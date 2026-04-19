# Outputs for Cloud Run module

output "service_id" {
  description = "The ID of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.id
}

output "service_url" {
  description = "The URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.uri
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.name
}

output "service_location" {
  description = "The location of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.location
}

output "service_project" {
  description = "The project of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.project
}
