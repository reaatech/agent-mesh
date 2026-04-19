terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0.0"
}

# Project
data "google_project" "main" {
  project_id = var.project_id
}

# Enable APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com"
  ])

  service            = each.value
  disable_on_destroy = false
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    max_instance_request_concurrency = var.max_instance_request_concurrency
    max_instances                    = var.max_instances
    min_instances                    = var.min_instances

    containers {
      image = var.image_url
      ports {
        name           = "http1"
        container_port = var.target_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      # Startup probe
      startup_probe {
        timeout_seconds     = 240
        period_seconds      = 240
        failure_threshold   = 1
        initial_delay_seconds = 1

        http_get {
          path = "/health"
          port = var.target_port
        }
      }

      # Liveness probe
      liveness_probe {
        timeout_seconds     = 5
        period_seconds      = 10
        failure_threshold   = 3

        http_get {
          path = "/health"
          port = var.target_port
        }
      }
    }

    # Service account
    service_account = google_service_account.main.email

    # VPC Access (optional)
    dynamic "vpc_access" {
      for_each = var.vpc_connector_name != null ? [1] : []
      content {
        connector = "projects/${data.google_project.main.project_id}/locations/${var.region}/connectors/${var.vpc_connector_name}"
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Service Account
resource "google_service_account" "main" {
  account_id   = "${var.service_name}-sa"
  display_name = "Service account for ${var.service_name}"
  project      = var.project_id
}

# IAM bindings
resource "google_cloud_run_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Secret Manager for sensitive env vars
resource "google_secret_manager_secret" "env_secrets" {
  for_each = var.secret_env_vars

  secret_id = "${var.service_name}-${each.key}"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "env_secrets" {
  for_each = var.secret_env_vars

  secret = google_secret_manager_secret.env_secrets[each.key].id
  secret_data = each.value.value
}

# Cloud Logging sink for custom retention
resource "google_logging_project_bucket_config" "main" {
  project    = var.project_id
  location   = "global"
  bucket_id  = "${var.service_name}-logs"
  name       = "${var.service_name} Logs"
  description = "Log bucket for ${var.service_name}"
  retention_days = var.log_retention_days
}

# Metrics
resource "google_monitoring_metric_descriptor" "custom" {
  count = length(var.custom_metrics)

  project      = var.project_id
  display_name = var.custom_metrics[count.index].display_name
  type         = "${var.custom_metrics[count.index].name}/custom.googleapis.com/${var.service_name}/${var.custom_metrics[count.index].name}"
  metric_kind  = var.custom_metrics[count.index].kind
  value_type   = var.custom_metrics[count.index].value_type
  description  = var.custom_metrics[count.index].description
  unit         = var.custom_metrics[count.index].unit

  labels {
    key         = "service_name"
    value_type  = "STRING"
    description = "Name of the service"
  }
}

# Cloud Run IAM for service account to access secrets
resource "google_service_account_iam_member" "secrets_access" {
  service_account_id = google_service_account.main.name
  role               = "roles/secretmanager.secretAccessor"
  member             = "serviceAccount:${google_service_account.main.email}"
}
