variable "site_name" {
  description = "Name of the Netlify site"
  type        = string
  default     = "agent-mesh"
}

variable "account_slug" {
  description = "Netlify account slug"
  type        = string
  default     = ""
}

variable "deploy_branch" {
  description = "Branch to deploy from"
  type        = string
  default     = "main"
}

variable "create_site" {
  description = "Whether to create a new Netlify site"
  type        = bool
  default     = true
}

variable "environment_variables" {
  description = "Environment variables to set on the site"
  type        = map(string)
  default     = {}
}
