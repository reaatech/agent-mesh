# Development environment Terraform configuration
# Deploys Firestore, Secret Manager secrets, and IAM bindings

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
    bucket = "agent-mesh-tfstate-dev"
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
  default     = "dev"
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
  name                          = "(default)"
  location                      = var.region
  app_engine_integration_mode   = "DISABLED"
  concurrency_mode              = "PESSIMISTIC"
  type                          = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_DISABLED"
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

resource "google_secret_manager_secret" "vertex_ai_sa_key" {
  secret_id = "agent-mesh-vertex-ai-sa-key"

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

# Firestore TTL policy for sessions collection
resource "google_firestore_index" "sessions_ttl" {
  api_version = "v1"
  database    = google_firestore_database.main.name
  collection  = "sessions"
  query_scope = "COLLECTION"

  fields {
    field_path = "ttl"
    order      = "ASCENDING"
  }

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
}

# Outputs
output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.main.name
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.agent_mesh.email
}

output "session_events_topic" {
  description = "Pub/Sub topic for session events"
  value       = google_pubsub_topic.session_events.name
}

output "secret_names" {
  description = "Names of created secrets"
  value = {
    api_key           = google_secret_manager_secret.api_key.secret_id
    slack_bot_token   = google_secret_manager_secret.slack_bot_token.secret_id
    vertex_ai_sa_key  = google_secret_manager_secret.vertex_ai_sa_key.secret_id
  }
}
