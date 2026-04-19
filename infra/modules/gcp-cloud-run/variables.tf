variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "agent-mesh"
}

variable "image_url" {
  description = "Container image URL (e.g., gcr.io/project/agent-mesh:latest)"
  type        = string
}

variable "target_port" {
  description = "Port the container listens on"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU allocation (e.g., '1000m' for 1 CPU)"
  type        = string
  default     = "1000m"
}

variable "memory" {
  description = "Memory allocation (e.g., '512Mi')"
  type        = string
  default     = "512Mi"
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

variable "max_instance_request_concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "environment_variables" {
  description = "Non-sensitive environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Sensitive environment variables to store in Secret Manager"
  type        = map(object({
    value = string
  }))
  default = {}
}

variable "vpc_connector_name" {
  description = "Name of the VPC connector (optional)"
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}

variable "custom_metrics" {
  description = "Custom metrics to create"
  type = list(object({
    name         = string
    display_name = string
    kind         = string
    value_type   = string
    description  = string
    unit         = string
  }))
  default = []
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default     = {}
}
