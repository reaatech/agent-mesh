variable "create_project" {
  description = "Whether to create a new Vercel project"
  type        = bool
  default     = true
}

variable "project_id" {
  description = "Existing Vercel project ID (if not creating new)"
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Name of the Vercel project"
  type        = string
  default     = "agent-mesh"
}

variable "framework" {
  description = "Framework preset (e.g., 'nextjs', 'nuxt', 'sveltekit', 'other')"
  type        = string
  default     = "other"
}

variable "root_directory" {
  description = "Root directory of the project (relative to repository root)"
  type        = string
  default     = null
}

variable "install_command" {
  description = "Install command override"
  type        = string
  default     = null
}

variable "build_command" {
  description = "Build command override"
  type        = string
  default     = null
}

variable "output_directory" {
  description = "Output directory (e.g., 'dist', 'build')"
  type        = string
  default     = null
}

variable "git_repository" {
  description = "GitHub repository (owner/repo) for Git integration"
  type        = string
  default     = ""
}

variable "environment_variables" {
  description = "Environment variables to configure in all environments"
  type        = map(string)
  default     = {}
}
