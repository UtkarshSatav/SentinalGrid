## EKS module — managed cluster, three node groups, IRSA enabled,
## envelope encryption via KMS, control plane logs to CloudWatch.

variable "name"            { type = string }
variable "kubernetes_version" { type = string default = "1.30" }
variable "vpc_id"          { type = string }
variable "app_subnet_ids"  { type = list(string) }
variable "tags"            { type = map(string) default = {} }

resource "aws_kms_key" "eks" {
  description             = "EKS secrets envelope encryption for ${var.name}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_iam_role" "cluster" {
  name = "${var.name}-eks-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_eks_cluster" "this" {
  name     = var.name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.app_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]  # tighten in prod to bastion CIDRs
  }

  encryption_config {
    provider { key_arn = aws_kms_key.eks.arn }
    resources = ["secrets"]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = var.tags
}

## OIDC provider for IRSA
data "tls_certificate" "oidc" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "this" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.oidc.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

## ── Node groups ────────────────────────────────────────────────────────────
resource "aws_iam_role" "node" {
  name = "${var.name}-eks-node-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])
  policy_arn = each.value
  role       = aws_iam_role.node.name
}

locals {
  node_groups = {
    system = { min = 3, desired = 3, max = 6,  instance_types = ["m6i.large"],   labels = { role = "system" } }
    app    = { min = 3, desired = 6, max = 30, instance_types = ["m6i.xlarge"],  labels = { role = "app" } }
    ingest = { min = 2, desired = 4, max = 50, instance_types = ["c6i.2xlarge"], labels = { role = "ingest" } }
  }
}

resource "aws_eks_node_group" "this" {
  for_each        = local.node_groups
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name}-${each.key}"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.app_subnet_ids
  instance_types  = each.value.instance_types

  scaling_config {
    desired_size = each.value.desired
    min_size     = each.value.min
    max_size     = each.value.max
  }

  update_config {
    max_unavailable_percentage = 25
  }

  labels = each.value.labels

  tags = merge(var.tags, {
    "k8s.io/cluster-autoscaler/enabled"            = "true"
    "k8s.io/cluster-autoscaler/${var.name}"        = "owned"
  })
}

output "cluster_name"     { value = aws_eks_cluster.this.name }
output "cluster_endpoint" { value = aws_eks_cluster.this.endpoint }
output "oidc_provider_arn" { value = aws_iam_openid_connect_provider.this.arn }
output "kms_key_arn"      { value = aws_kms_key.eks.arn }
