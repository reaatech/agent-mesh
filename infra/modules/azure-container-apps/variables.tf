variable "service_name" {
  description = "Name of the service"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "create_resource_group" {
  description = "Whether to create a new resource group"
  type        = bool
  default     = true
}

variable "resource_group_name" {
  description = "Name of existing resource group (used if create_resource_group is false)"
  type        = string
  default     = null
}

variable "tenant_id" {
  description = "Azure tenant ID"
  type        = string
}

variable "image_url" {
  description = "Container image URL"
  type        = string
}

variable "target_port" {
  description = "Port the container listens on"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "Number of CPU cores"
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory in GB"
  type        = string
  default     = "1Gi"
}

variable "min_replicas" {
  description = "Minimum number of replicas"
  type        = number
  default     = 0
}

variable "max_replicas" {
  description = "Maximum number of replicas"
  type        = number
  default     = 10
}

variable "environment_variables" {
  description = "Map of environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Map of secret environment variables with name and secret_name"
  type = map(object({
    name        = string
    secret_name = string
    value       = string
  }))
  default  = {}
  sensitive = true
}

variable "log_retention_days" {
  description = "Log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
