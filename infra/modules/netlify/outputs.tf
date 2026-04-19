output "site_id" {
  description = "The ID of the Netlify site"
  value       = try(netlify_site.main[0].id, null)
}

output "site_url" {
  description = "The URL of the Netlify site"
  value       = try(netlify_site.main[0].url, null)
}

output "admin_url" {
  description = "The admin URL of the Netlify site"
  value       = try(netlify_site.main[0].admin_url, null)
}

output "build_hook_url" {
  description = "The build hook URL for triggering deployments"
  value       = try(netlify_build_hook.main[0].url, null)
}
