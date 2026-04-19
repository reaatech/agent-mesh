terraform {
  required_version = ">= 1.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

# Container Engine Cluster
resource "oci_containerengine_cluster" "main" {
  count          = var.create_cluster ? 1 : 0
  cluster_options {
    add_ons {
      is_kubernetes_dashboard_enabled = false
      is_tiller_enabled               = false
    }
    service_lb_subnet_ids = var.service_lb_subnet_ids
  }
  compartment_id = var.compartment_id
  endpoint_config {
    is_public_ip_enabled = var.is_public
    nsg_ids              = var.nsg_ids
    subnet_id            = var.cluster_endpoint_subnet_id
  }
  kubernetes_version = var.kubernetes_version
  name               = var.cluster_name
  vcn_id             = var.vcn_id
}

# Node Pool
resource "oci_containerengine_node_pool" "main" {
  count          = var.create_cluster ? 1 : 0
  compartment_id = var.compartment_id
  cluster_id     = oci_containerengine_cluster.main[0].id
  name           = "${var.cluster_name}-node-pool"
  node_shape     = var.node_shape
  node_shape_config {
    memory_in_gbs = var.node_memory_in_gbs
    ocpus         = var.node_ocpus
  }
  node_source_details {
    image_id    = var.node_image_id
    source_type = "IMAGE"
  }
  ssh_public_key = var.ssh_public_key
  subnet_ids     = var.node_pool_subnet_ids

  node_config_details {
    placement_configs {
      availability_domain = var.availability_domain
      subnet_id          = var.node_pool_subnet_ids[0]
    }
    size = var.node_pool_size
  }
}

# Local Kubernetes config
resource "local_file" "kubeconfig" {
  count    = var.create_cluster ? 1 : 0
  content  = oci_containerengine_cluster.main[0].metadata[0].kube_config
  filename = "${path.module}/kubeconfig_${var.cluster_name}"
}

# Helm Provider for deploying applications
terraform {
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Deploy application using Helm
resource "helm_release" "app" {
  name       = var.app_name
  repository = var.helm_repository
  chart      = var.helm_chart
  version    = var.helm_chart_version
  namespace  = var.namespace

  set {
    name  = "image.repository"
    value = var.image_url
  }

  set {
    name  = "image.tag"
    value = var.image_tag
  }

  set {
    name  = "replicas"
    value = var.replicas
  }

  dynamic "set" {
    for_each = var.helm_values
    content {
      name  = set.key
      value = set.value
    }
  }

  depends_on = [oci_containerengine_node_pool.main[0]]
}
