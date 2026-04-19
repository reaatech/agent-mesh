variable "create_cluster" {
  description = "Whether to create the OKE cluster"
  type        = bool
  default     = true
}

variable "compartment_id" {
  description = "OCID of the compartment where the cluster will be created"
  type        = string
}

variable "vcn_id" {
  description = "OCID of the VCN where the cluster will be created"
  type        = string
}

variable "cluster_name" {
  description = "Name of the OKE cluster"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version for the cluster"
  type        = string
  default     = "v1.27.1"
}

variable "cluster_endpoint_subnet_id" {
  description = "OCID of the subnet for the cluster endpoint"
  type        = string
}

variable "service_lb_subnet_ids" {
  description = "List of subnet IDs for Kubernetes load balancers"
  type        = list(string)
  default     = []
}

variable "nsg_ids" {
  description = "List of NSG IDs for the cluster endpoint"
  type        = list(string)
  default     = []
}

variable "is_public" {
  description = "Whether the cluster endpoint is public"
  type        = bool
  default     = true
}

variable "node_pool_size" {
  description = "Number of nodes in the node pool"
  type        = number
  default     = 3
}

variable "node_shape" {
  description = "Instance shape for worker nodes"
  type        = string
  default     = "VM.Standard.E4.Flex"
}

variable "node_memory_in_gbs" {
  description = "Memory in GB for worker nodes"
  type        = number
  default     = 16
}

variable "node_ocpus" {
  description = "Number of OCPUs for worker nodes"
  type        = number
  default     = 4
}

variable "node_image_id" {
  description = "Image ID for worker nodes"
  type        = string
}

variable "node_pool_subnet_ids" {
  description = "List of subnet IDs for worker nodes"
  type        = list(string)
}

variable "availability_domain" {
  description = "Availability domain for worker nodes"
  type        = number
  default     = 1
}

variable "ssh_public_key" {
  description = "SSH public key for worker nodes"
  type        = string
  default     = ""
}

variable "app_name" {
  description = "Name of the application deployment"
  type        = string
  default     = "agent-mesh"
}

variable "helm_repository" {
  description = "Helm repository URL"
  type        = string
  default     = ""
}

variable "helm_chart" {
  description = "Helm chart name"
  type        = string
  default     = ""
}

variable "helm_chart_version" {
  description = "Helm chart version"
  type        = string
  default     = "1.0.0"
}

variable "namespace" {
  description = "Kubernetes namespace for deployment"
  type        = string
  default     = "default"
}

variable "image_url" {
  description = "Container image repository URL"
  type        = string
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "replicas" {
  description = "Number of replicas for the deployment"
  type        = number
  default     = 3
}

variable "helm_values" {
  description = "Additional Helm values"
  type        = map(string)
  default     = {}
}
