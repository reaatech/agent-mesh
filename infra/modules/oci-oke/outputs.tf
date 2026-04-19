output "cluster_id" {
  description = "OCID of the OKE cluster"
  value       = try(oci_containerengine_cluster.main[0].id, null)
}

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = try(oci_containerengine_cluster.main[0].endpoints[0].public_endpoint, null)
}

output "node_pool_id" {
  description = "OCID of the node pool"
  value       = try(oci_containerengine_node_pool.main[0].id, null)
}

output "kubeconfig_path" {
  description = "Path to the generated kubeconfig file"
  value       = try(local_file.kubeconfig[0].filename, null)
}

output "app_url" {
  description = "URL of the deployed application"
  value       = var.create_cluster ? "http://${var.app_name}.${var.namespace}.svc.cluster.local" : null
}
