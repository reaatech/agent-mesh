output "project_id" {
  description = "Vercel project ID"
  value       = var.project_id != "" ? var.project_id : vercel_project.main[0].id
}

output "project_url" {
  description = "Vercel project URL"
  value       = var.project_id != "" ? "https://${var.project_id}.vercel.app" : "https://${vercel_project.main[0].name}.vercel.app"
}

output "deployment_url" {
  description = "URL for the latest deployment"
  value       = var.project_id != "" ? "https://${var.project_id}.vercel.app" : "https://${vercel_project.main[0].name}.vercel.app"
}
