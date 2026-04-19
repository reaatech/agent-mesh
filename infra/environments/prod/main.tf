# Production environment Terraform configuration
# Deploys Cloud Run service, Cloud Load Balancer, Monitoring dashboards, and Alert policies

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "agent-mesh-tfstate-prod"
    prefix = "terraform/state"
  }
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "container_image" {
  description = "Container image URL from Artifact Registry"
  type        = string
}

variable "domain_name" {
  description = "Custom domain name (optional)"
  type        = string
  default     = null
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Firestore database
resource "google_firestore_database" "main" {
  name                        = "(default)"
  location                    = var.region
  app_engine_integration_mode = "DISABLED"
  concurrency_mode            = "PESSIMISTIC"
  type                        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  point_in_time_recovery {
    enabled = true
  }
}

# Pub/Sub topic for session events
resource "google_pubsub_topic" "session_events" {
  name = "session-events"
}

# Secret Manager secrets
resource "google_secret_manager_secret" "api_key" {
  secret_id = "agent-mesh-api-key"

  labels = {
    environment = var.environment
    app         = "agent-mesh"
  }

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "slack_bot_token" {
  secret_id = "agent-mesh-slack-bot-token"

  labels = {
    environment = var.environment
    app         = "agent-mesh"
  }

  replication {
    auto {}
  }
}

# Service account for the Cloud Run service
resource "google_service_account" "agent_mesh" {
  account_id   = "agent-mesh-sa"
  display_name = "Agent Mesh Service Account"
  description  = "Service account for Agent Mesh orchestrator"
}

# IAM bindings for the service account
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "cloud_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "logging_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

resource "google_project_iam_member" "monitoring_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.agent_mesh.email}"
}

# Cloud Run service
module "cloud_run" {
  source = "../../modules/cloud-run"

  project_id       = var.project_id
  region           = var.region
  service_name     = "agent-mesh"
  container_image  = var.container_image

  min_instances    = 2
  max_instances    = 100
  memory           = "1Gi"
  cpu              = "2"
  timeout          = 300

  environment_variables = {
    NODE_ENV                    = "production"
    GOOGLE_CLOUD_PROJECT        = var.project_id
    GOOGLE_CLOUD_REGION         = var.region
    FIRESTORE_DATABASE          = "(default)"
    VERTEX_AI_LOCATION          = var.region
    VERTEX_AI_MODEL             = "gemini-2.0-flash"
    LOG_LEVEL                   = "info"
    ENABLE_SESSION_BYPASS       = "true"
    ENABLE_CLARIFICATION        = "true"
    ENABLE_CIRCUIT_BREAKER      = "true"
    ENABLE_RATE_LIMITING        = "true"
    RATE_LIMIT_WINDOW_MS        = "900000"
    RATE_LIMIT_MAX_REQUESTS     = "100"
    CIRCUIT_BREAKER_FAILURE_THRESHOLD = "5"
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS  = "30000"
    SESSION_TTL_MINUTES         = "30"
    SESSION_MAX_TURNS           = "100"
  }

  secret_env_vars = {
    API_KEY           = "agent-mesh-api-key"
    SLACK_BOT_TOKEN   = "agent-mesh-slack-bot-token"
  }

  service_account_email = google_service_account.agent_mesh.email

  labels = {
    environment = var.environment
  }

  ingress_settings = "internal-and-cloud-load-balancing"
}

# Serverless NEG for Cloud Run
resource "google_compute_region_network_endpoint_group" "cloud_run_neg" {
  name                 = "agent-mesh-neg"
  network_endpoint_type = "SERVERLESS"
  region               = var.region
  cloud_run_service    = module.cloud_run.service_name
}

# Backend service for Cloud Run via NEG
resource "google_compute_backend_service" "main" {
  name        = "agent-mesh-backend"
  description = "Backend service for Agent Mesh orchestrator"
  region      = var.region

  protocol = "HTTP"
  timeout_sec = 300

  backend {
    group           = google_compute_region_network_endpoint_group.cloud_run_neg.id
    balancing_mode  = "UTILIZATION"
  }

  log_config {
    enable      = true
    sample_rate = 0.1
  }

  cloud_run_fraction = 1.0
}

# URL map for routing
resource "google_compute_url_map" "main" {
  name            = "agent-mesh-urlmap"
  default_service = google_compute_backend_service.main.id

  host_rules {
    hosts        = [var.domain_name != null ? var.domain_name : "agent-mesh.example.com"]
    path_matcher = "paths"
  }

  path_matcher {
    name            = "paths"
    default_service = google_compute_backend_service.main.id

    path_rules {
      paths   = ["/*"]
      handler = google_compute_backend_service.main.id
    }
  }
}

# Managed SSL certificate (requires Cloud DNS or external domain)
resource "google_compute_managed_ssl_certificate" "main" {
  name = "agent-mesh-ssl-cert"

  certificate = var.domain_name != null ? null : null
  managed {
    domains = var.domain_name != null ? [var.domain_name] : ["agent-mesh.example.com"]
  }
}

# HTTP target proxy
resource "google_compute_target_http_proxy" "main" {
  name    = "agent-mesh-http-proxy"
  url_map = google_compute_url_map.main.id
}

# HTTPS target proxy (if domain provided)
resource "google_compute_target_https_proxy" "main" {
  count  = var.domain_name != null ? 1 : 0
  name   = "agent-mesh-https-proxy"
  url_map = google_compute_url_map.main.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

# Global forwarding rule for HTTP
resource "google_compute_forwarding_rule" "http" {
  name       = "agent-mesh-http-forwarding-rule"
  port_range = "80"
  target     = google_compute_target_http_proxy.main.id

  ip_protocol = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# Global forwarding rule for HTTPS
resource "google_compute_forwarding_rule" "https" {
  count      = var.domain_name != null ? 1 : 0
  name       = "agent-mesh-https-forwarding-rule"
  port_range = "443"
  target     = google_compute_target_https_proxy.main[0].id

  ip_protocol = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address = var.domain_name != null ? google_compute_global_address.main[0].id : null
}

# Static IP address for HTTPS (if domain provided)
resource "google_compute_global_address" "main" {
  count  = var.domain_name != null ? 1 : 0
  name   = "agent-mesh-ip"
  domain = var.domain_name
}

# Cloud Monitoring dashboard
resource "google_monitoring_dashboard" "main" {
  dashboard_json = jsonencode({
    displayName = "Agent Mesh - Overview"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Request Count"
          xyChart = {
            dataSources = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/requests\""
                    aggregation = {
                      alignmentPeriod = "60s"
                      perSeriesAligner = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }
            ]
            period = "300s"
            classification = "CHART"
          }
        },
        {
          title = "Request Latency (p50, p95, p99)"
          xyChart = {
            dataSources = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/latency\""
                    aggregation = {
                      alignmentPeriod = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_50"
                      crossSeriesReducer = "REDUCE_MEAN"
                    }
                  }
                }
              }
            ]
            period = "300s"
            classification = "CHART"
          }
        },
        {
          title = "Error Rate"
          xyChart = {
            dataSources = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/errors\""
                    aggregation = {
                      alignmentPeriod = "60s"
                      perSeriesAligner = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }
            ]
            period = "300s"
            classification = "CHART"
          }
        },
        {
          title = "Circuit Breaker State"
          xyChart = {
            dataSources = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/circuit_breaker_state\""
                    aggregation = {
                      alignmentPeriod = "60s"
                      perSeriesAligner = "ALIGN_MEAN"
                      crossSeriesReducer = "REDUCE_MEAN"
                    }
                  }
                }
              }
            ]
            period = "300s"
            classification = "CHART"
          }
        }
      ]
    }
  })
}

# Alert policy for high error rate
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "Agent Mesh - High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Error rate > 5% for 5 minutes"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/errors\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = []
  user_labels = {
    severity = "critical"
    team     = "platform"
  }
}

# Alert policy for high latency
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "Agent Mesh - High Latency"
  combiner     = "OR"

  conditions {
    display_name = "P99 latency > 2s for 5 minutes"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"custom.googleapis.com/agent_mesh/latency\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = []
  user_labels = {
    severity = "warning"
    team     = "platform"
  }
}

# Outputs
output "service_url" {
  description = "URL of the Cloud Run service"
  value       = module.cloud_run.service_url
}

output "load_balancer_url" {
  description = "URL of the Cloud Load Balancer"
  value       = "https://${var.domain_name != null ? var.domain_name : google_compute_forwarding_rule.http.ip_address}"
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = module.cloud_run.service_name
}

output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.main.name
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.agent_mesh.email
}
