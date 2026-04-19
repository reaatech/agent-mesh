# Cloud Run module for agent-mesh orchestrator
# Deploys a containerized service with configurable scaling and security

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "agent-mesh"
}

variable "container_image" {
  description = "Container image URL from Artifact Registry"
  type        = string
}

variable "min_instances" {
  description = "Minimum number of instances (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "memory" {
  description = "Memory limit per instance (e.g., 512Mi, 1Gi)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU limit per instance"
  type        = string
  default     = "1"
}

variable "timeout" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "environment_variables" {
  description = "Environment variables to pass to the container"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Secret environment variables (map of env var name to secret name)"
  type        = map(string)
  default     = {}
}

variable "vpc_connector" {
  description = "VPC connector name (optional)"
  type        = string
  default     = null
}

variable "ingress_settings" {
  description = "Ingress settings (all, internal, internal-and-cloud-load-balancing)"
  type        = string
  default     = "all"
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}

variable "service_account_email" {
  description = "Service account email for the Cloud Run service"
  type        = string
  default     = null
}

# Cloud Run service
resource "google_cloud_run_v2_service" "main" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  labels = merge(
    {
      "app" = "agent-mesh"
    },
    var.labels
  )

  ingress = var.ingress_settings

  template {
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = []
      }
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
      }

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      ports {
        name           = "http1"
        container_port = 8080
      }

      startup_probe {
        timeout_seconds     = 240
        period_seconds      = 10
        failure_threshold   = 3
        initial_delay_seconds = 0

        http_get {
          path = "/health"
        }
      }

      liveness_probe {
        timeout_seconds     = 10
        period_seconds      = 10
        failure_threshold   = 3
        initial_delay_seconds = 5

        http_get {
          path = "/health"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    service_account = var.service_account_email
    vpc_access {
      connector = var.vpc_connector
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# IAM binding for unauthenticated access (if needed)
resource "google_cloud_run_service_iam_member" "unauthenticated" {
  count = var.ingress_settings == "all" ? 1 : 0

  project  = var.project_id
  location = var.region
  service  = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.uri
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.name
}
