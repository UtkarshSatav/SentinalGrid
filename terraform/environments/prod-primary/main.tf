## Primary region — composes VPC, EKS, RDS, MSK, S3 for us-east-1

terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket         = "sentinelgrid-tfstate-prod"
    key            = "prod-primary/state.tfstate"
    region         = "us-east-1"
    dynamodb_table = "sentinelgrid-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = {
      Project     = "SentinelGrid"
      Environment = "prod"
      Region      = "primary"
      Owner       = "platform-engineering"
      Compliance  = "FedRAMP-High"
    }
  }
}

locals {
  name = "sentinelgrid-primary"
  azs  = ["us-east-1a", "us-east-1b", "us-east-1c"]
  tags = { Stack = local.name }
}

module "vpc" {
  source = "../../modules/vpc"
  name   = local.name
  cidr   = "10.0.0.0/16"
  azs    = local.azs
  tags   = local.tags
}

module "eks" {
  source             = "../../modules/eks"
  name               = local.name
  vpc_id             = module.vpc.vpc_id
  app_subnet_ids     = module.vpc.app_subnet_ids
  kubernetes_version = "1.30"
  tags               = local.tags
}

module "rds" {
  source                  = "../../modules/rds"
  name                    = local.name
  vpc_id                  = module.vpc.vpc_id
  data_subnet_ids         = module.vpc.data_subnet_ids
  allowed_security_groups = [module.eks.cluster_security_group_id]
  tags                    = local.tags
}

module "msk" {
  source          = "../../modules/msk"
  name            = local.name
  vpc_id          = module.vpc.vpc_id
  data_subnet_ids = module.vpc.data_subnet_ids
  tags            = local.tags
}

module "s3" {
  source      = "../../modules/s3"
  name_prefix = local.name
  tags        = local.tags
}

output "cluster_name"      { value = module.eks.cluster_name }
output "rds_endpoint"      { value = module.rds.endpoint sensitive = true }
output "kafka_brokers"     { value = module.msk.bootstrap_brokers sensitive = true }
output "intel_bucket"      { value = module.s3.intel_bucket }
