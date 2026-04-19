terraform {
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }
}

# Vercel project for agent-mesh frontend/API
resource "vercel_project" "main" {
  count = var.create_project ? 1 : 0
  name  = var.project_name

  framework = var.framework
  root_directory = var.root_directory
  install_command = var.install_command
  build_command   = var.build_command
  output_directory = var.output_directory

  git_repository = var.git_repository != "" ? {
    type = "github"
    repo = var.git_repository
  } : null
}

# Production environment variables
resource "vercel_project_environment_variables" "production" {
  for_each   = var.environment_variables
  project_id = var.project_id != "" ? var.project_id : vercel_project.main[0].id
  key        = each.key
  value      = each.value
  target     = ["production"]
}

# Preview environment variables (same as production by default)
resource "vercel_project_environment_variables" "preview" {
  for_each   = var.environment_variables
  project_id = var.project_id != "" ? var.project_id : vercel_project.main[0].id
  key        = each.key
  value      = each.value
  target     = ["preview"]
}

# Development environment variables
resource "vercel_project_environment_variables" "development" {
  for_each   = var.environment_variables
  project_id = var.project_id != "" ? var.project_id : vercel_project.main[0].id
  key        = each.key
  value      = each.value
  target     = ["development"]
}
