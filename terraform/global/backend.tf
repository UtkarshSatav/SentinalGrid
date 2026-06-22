## Remote state — S3 + DynamoDB locking
## Bootstrapped once via terraform/global/bootstrap.sh

terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket         = "sentinelgrid-tfstate-prod"
    key            = "global/state.tfstate"
    region         = "us-east-1"
    dynamodb_table = "sentinelgrid-tfstate-lock"
    encrypt        = true
    kms_key_id     = "alias/sentinelgrid-tfstate"
  }

  required_providers {
    aws        = { source = "hashicorp/aws",        version = "~> 5.40" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.30" }
    helm       = { source = "hashicorp/helm",       version = "~> 2.13" }
    vault      = { source = "hashicorp/vault",      version = "~> 4.2"  }
  }
}
