# Azure Container Apps module for agent-mesh

resource "azurerm_resource_group" "main" {
  count = var.create_resource_group ? 1 : 0

  name     = "${var.service_name}-rg"
  location = var.location
}

resource "azurerm_container_apps_environment" "main" {
  name                = "${var.service_name}-env"
  location            = var.location
  resource_group_name = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  tags = var.tags
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.service_name}-logs"
  location            = var.location
  resource_group_name = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
  retention_in_days   = var.log_retention_days

  tags = var.tags
}

resource "azurerm_container_registry" "main" {
  name                = replace("acr${var.service_name}", "/[^a-zA-Z0-9]/", "")
  location            = var.location
  resource_group_name = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
  sku                 = "Basic"
  admin_enabled       = false

  tags = var.tags
}

resource "azurerm_container_app" "main" {
  name                         = var.service_name
  location                     = var.location
  resource_group_name          = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
  container_app_environment_id = azurerm_container_apps_environment.main.id
  revision_mode                = "Single"

  tags = var.tags

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = var.service_name
      image  = var.image_url
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name        = env.value.name
          secret_name = env.value.secret_name
        }
      }
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = var.target_port
    transport                  = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

resource "azurerm_key_vault" "main" {
  name                = replace("kv${var.service_name}${random_id.kv_suffix.hex}", "/[^a-zA-Z0-9]/", "")
  location            = var.location
  resource_group_name = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
  tenant_id           = var.tenant_id
  sku_name            = "standard"
  purge_protection_enabled = false

  tags = var.tags
}

resource "random_id" "kv_suffix" {
  byte_length = 4
}

resource "azurerm_key_vault_secret" "env_secrets" {
  for_each = var.secret_env_vars

  name         = each.value.secret_name
  value        = each.value.value
  key_vault_id = azurerm_key_vault.main.id

  tags = var.tags
}

resource "azurerm_monitor_diagnostic_setting" "main" {
  name                       = "${var.service_name}-diagnostics"
  target_resource_id         = azurerm_container_app.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "containerappconsole"
  }

  enabled_log {
    category = "containerappsystem"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}
