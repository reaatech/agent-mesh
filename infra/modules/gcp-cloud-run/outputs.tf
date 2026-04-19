output "service_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.uri
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.main.name
}

output "service_location" {
  description = "Region where the service is deployed"
  value       = google_cloud_run_v2_service.main.location
}

output "service_account_email" {
  description = "Email of the service account"
  value       = google_service_account.main.email
}

output "secret_names" {
  description = "Names of created secrets"
  value       = { for k, v in google_secret_manager_secret.env_secrets : k => v.name }
}

output "log_bucket" {
  description = "Name of the log bucket"
  value       = google_logging_project_bucket_config.main.bucket_id
}
