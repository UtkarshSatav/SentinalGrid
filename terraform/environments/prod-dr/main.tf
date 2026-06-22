## DR region (us-west-2) — warm standby. Same modules, smaller capacity,
## continuous replication from primary.

terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket         = "sentinelgrid-tfstate-prod"
    key            = "prod-dr/state.tfstate"
    region         = "us-east-1"
    dynamodb_table = "sentinelgrid-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-west-2"
  default_tags {
    tags = {
      Project     = "SentinelGrid"
      Environment = "prod"
      Region      = "dr"
      Owner       = "platform-engineering"
    }
  }
}

provider "aws" {
  alias  = "primary"
  region = "us-east-1"
}

locals {
  name = "sentinelgrid-dr"
  azs  = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

module "vpc" {
  source = "../../modules/vpc"
  name   = local.name
  cidr   = "10.1.0.0/16"
  azs    = local.azs
}

module "eks" {
  source         = "../../modules/eks"
  name           = local.name
  vpc_id         = module.vpc.vpc_id
  app_subnet_ids = module.vpc.app_subnet_ids
}

## RDS in DR is a cross-region read replica, promoted on failover
data "terraform_remote_state" "primary" {
  backend = "s3"
  config = {
    bucket = "sentinelgrid-tfstate-prod"
    key    = "prod-primary/state.tfstate"
    region = "us-east-1"
  }
}

resource "aws_db_instance" "dr_replica" {
  identifier            = "${local.name}-replica"
  replicate_source_db   = data.terraform_remote_state.primary.outputs.rds_arn
  instance_class        = "db.r6i.xlarge"
  publicly_accessible   = false
  auto_minor_version_upgrade = true
  storage_encrypted     = true
  deletion_protection   = true
  skip_final_snapshot   = false
  performance_insights_enabled = true
}

## MSK in DR + MirrorMaker2 deployment for cross-region topic replication
module "msk" {
  source          = "../../modules/msk"
  name            = local.name
  vpc_id          = module.vpc.vpc_id
  data_subnet_ids = module.vpc.data_subnet_ids
  broker_count    = 3
}

output "cluster_name" { value = module.eks.cluster_name }
output "rds_replica"  { value = aws_db_instance.dr_replica.endpoint sensitive = true }
