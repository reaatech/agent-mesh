output "service_url" {
  description = "URL of the deployed Container App"
  value       = azurerm_container_app.main.ingress[0].fqdn
}

output "container_app_name" {
  description = "Name of the Container App"
  value       = azurerm_container_app.main.name
}

output "container_app_environment_id" {
  description = "ID of the Container Apps Environment"
  value       = azurerm_container_apps_environment.main.id
}

output "container_registry_login_server" {
  description = "Login server of the Container Registry"
  value       = azurerm_container_registry.main.login_server
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = var.create_resource_group ? azurerm_resource_group.main[0].name : var.resource_group_name
}

output "key_vault_name" {
  description = "Name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}
