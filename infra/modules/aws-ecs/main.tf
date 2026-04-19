terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# CloudWatch Log Group for the service
resource "aws_cloudwatch_log_group" "main" {
  name              = "/aws/ecs/${var.service_name}"
  retention_in_days = var.log_retention_days
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  count = var.create_cluster ? 1 : 0
  name  = "${var.service_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Task Execution Role (for pulling images, pushing logs)
resource "aws_iam_role" "task_execution" {
  name = "${var.service_name}-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role (for the application to access AWS resources)
resource "aws_iam_role" "task" {
  name = "${var.service_name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# CloudWatch Logs policy for task role
resource "aws_iam_role_policy" "task_logging" {
  name = "${var.service_name}-task-logging"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.main.arn}:*"
      }
    ]
  })
}

# Secrets Manager policy for task role (if using secrets)
resource "aws_iam_role_policy" "task_secrets" {
  count = var.enable_secrets ? 1 : 0
  name  = "${var.service_name}-task-secrets"
  role  = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.secret_arns
      }
    ]
  })
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = var.service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name  = var.service_name
      image = var.image_url
      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.main.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        for key, value in var.environment_variables : {
          name  = key
          value = value
        }
      ]
      secrets = var.enable_secrets ? [
        for secret in var.secrets : {
          name      = secret.name
          valueFrom = secret.arn
        }
      ] : []
      healthCheck = var.enable_health_check ? {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      } : null
    }
  ])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  tags = var.tags
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = var.service_name
  cluster         = var.create_cluster ? aws_ecs_cluster.main[0].id : var.cluster_arn
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.enable_autoscaling ? 0 : var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = var.security_group_ids
  }

  # Load balancer configuration (optional)
  dynamic "load_balancer" {
    for_each = var.lb_arn != "" ? [1] : []
    content {
      target_group_arn = var.lb_target_group_arn
      container_name   = var.service_name
      container_port   = 8080
    }
  }

  # Autoscaling configuration
  dynamic "capacity_provider_strategy" {
    for_each = var.enable_autoscaling ? [1] : []
    content {
      capacity_provider = "FARGATE"
      weight            = 1
      base              = var.min_capacity
    }
  }

  lifecycle {
    ignore_changes = [
      desired_count,
      task_definition
    ]
  }

  tags = var.tags
}

# Application Auto Scaling (optional)
resource "aws_appautoscaling_target" "main" {
  count              = var.enable_autoscaling ? 1 : 0
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${var.create_cluster ? aws_ecs_cluster.main[0].name : var.cluster_name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu_scaling" {
  count              = var.enable_autoscaling ? 1 : 0
  name               = "${var.service_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.main[0].resource_id
  scalable_dimension = aws_appautoscaling_target.main[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.main[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_target_value
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "memory_scaling" {
  count              = var.enable_autoscaling ? 1 : 0
  name               = "${var.service_name}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.main[0].resource_id
  scalable_dimension = aws_appautoscaling_target.main[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.main[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = var.memory_target_value
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# CloudWatch Alarms for scaling
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count               = var.enable_autoscaling ? 1 : 0
  alarm_name          = "${var.service_name}-cpu-high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 120
  statistic           = "Average"
  threshold           = var.cpu_target_value
  alarm_description   = "Scale up if CPU > ${var.cpu_target_value}%"

  dimensions = {
    ClusterName = var.create_cluster ? aws_ecs_cluster.main[0].name : var.cluster_name
    ServiceName = aws_ecs_service.main.name
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  count               = var.enable_autoscaling ? 1 : 0
  alarm_name          = "${var.service_name}-cpu-low"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 120
  statistic           = "Average"
  threshold           = var.cpu_target_value * 0.5
  alarm_description   = "Scale down if CPU < ${var.cpu_target_value * 0.5}%"

  dimensions = {
    ClusterName = var.create_cluster ? aws_ecs_cluster.main[0].name : var.cluster_name
    ServiceName = aws_ecs_service.main.name
  }
}
