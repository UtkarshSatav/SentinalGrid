## S3 buckets — threat intel storage, audit logs, Velero backups.
## Object Lock + versioning on audit; lifecycle to Glacier on intel.

variable "name_prefix"  { type = string }
variable "tags"         { type = map(string) default = {} }

resource "aws_kms_key" "s3" {
  description             = "S3 encryption for SentinelGrid"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = var.tags
}

## ── Threat intel data lake ────────────────────────────────────────────────
resource "aws_s3_bucket" "intel" {
  bucket = "${var.name_prefix}-intel"
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "intel" {
  bucket = aws_s3_bucket.intel.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "intel" {
  bucket = aws_s3_bucket.intel.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "intel" {
  bucket = aws_s3_bucket.intel.id
  rule {
    id     = "tier-to-glacier"
    status = "Enabled"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

## ── Immutable audit bucket ────────────────────────────────────────────────
resource "aws_s3_bucket" "audit" {
  bucket              = "${var.name_prefix}-audit"
  object_lock_enabled = true
  tags                = var.tags
}

resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = 2555  # 7 years
    }
  }
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = toset([aws_s3_bucket.intel.id, aws_s3_bucket.audit.id])
  bucket   = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

## ── Velero backups (K8s state) ────────────────────────────────────────────
resource "aws_s3_bucket" "velero" {
  bucket = "${var.name_prefix}-velero-backups"
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "velero" {
  bucket = aws_s3_bucket.velero.id
  versioning_configuration { status = "Enabled" }
}

## Cross-region replication for the audit bucket
resource "aws_iam_role" "replication" {
  name = "${var.name_prefix}-s3-replication"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

output "intel_bucket"  { value = aws_s3_bucket.intel.id }
output "audit_bucket"  { value = aws_s3_bucket.audit.id }
output "velero_bucket" { value = aws_s3_bucket.velero.id }
output "kms_key_arn"   { value = aws_kms_key.s3.arn }
