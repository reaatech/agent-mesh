variable "service_name" {
  description = "Name of the service"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "image_url" {
  description = "Docker image URL"
  type        = string
}

variable "cpu" {
  description = "CPU units for the task (256, 512, 1024, etc.)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memory in MB for the task (512, 1024, 2048, etc.)"
  type        = number
  default     = 512
}

variable "cpu_architecture" {
  description = "CPU architecture (X86_64, ARM64)"
  type        = string
  default     = "X86_64"
}

variable "desired_count" {
  description = "Number of tasks to run"
  type        = number
  default     = 1
}

variable "environment_variables" {
  description = "Map of environment variables"
  type        = map(string)
  default     = {}
}

variable "enable_secrets" {
  description = "Whether to enable secrets from Secrets Manager"
  type        = bool
  default     = false
}

variable "secret_arns" {
  description = "List of Secrets Manager ARNs"
  type        = list(string)
  default     = []
}

variable "secrets" {
  description = "List of secrets to inject as environment variables"
  type = list(object({
    name = string
    arn  = string
  }))
  default = []
}

variable "enable_health_check" {
  description = "Whether to enable health check"
  type        = bool
  default     = true
}

variable "create_cluster" {
  description = "Whether to create a new ECS cluster"
  type        = bool
  default     = true
}

variable "cluster_arn" {
  description = "ARN of existing cluster (if create_cluster is false)"
  type        = string
  default     = ""
}

variable "cluster_name" {
  description = "Name of existing cluster (if create_cluster is false)"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "List of subnet IDs"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "lb_arn" {
  description = "Load balancer ARN (optional)"
  type        = string
  default     = ""
}

variable "lb_target_group_arn" {
  description = "Load balancer target group ARN"
  type        = string
  default     = ""
}

variable "enable_autoscaling" {
  description = "Whether to enable auto scaling"
  type        = bool
  default     = false
}

variable "min_capacity" {
  description = "Minimum number of tasks"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks"
  type        = number
  default     = 4
}

variable "cpu_target_value" {
  description = "Target CPU utilization for scaling"
  type        = number
  default     = 70
}

variable "memory_target_value" {
  description = "Target memory utilization for scaling"
  type        = number
  default     = 70
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
