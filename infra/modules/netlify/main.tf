terraform {
  required_providers {
    netlify = {
      source  = "netlify/netlify"
      version = "~> 2.0"
    }
  }
}

resource "netlify_site" "main" {
  count   = var.create_site ? 1 : 0
  name    = var.site_name
  account = var.account_slug
}

resource "netlify_build_hook" "main" {
  count    = var.create_site ? 1 : 0
  site_id  = netlify_site.main[0].id
  title    = "agent-mesh-deploy"
  branch   = var.deploy_branch
  enabled  = true
}

resource "netlify_env_vars" "main" {
  for_each = var.environment_variables
  site_id  = netlify_site.main[0].id
  key      = each.key
  value    = each.value
}

resource "null_resource" "deploy" {
  count      = var.create_site ? 1 : 0
  depends_on = [netlify_site.main, netlify_env_vars.main]

  provisioner "local-exec" {
    command = "echo 'Deploy to Netlify: ${netlify_site.main[0].url}'"
  }
}
