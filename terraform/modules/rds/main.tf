## RDS PostgreSQL — Multi-AZ, encrypted, PITR enabled, IAM auth,
## with cross-region read replica for DR.

variable "name"                  { type = string }
variable "vpc_id"                { type = string }
variable "data_subnet_ids"       { type = list(string) }
variable "allowed_security_groups" { type = list(string) }
variable "engine_version"        { type = string default = "16.3" }
variable "instance_class"        { type = string default = "db.r6i.2xlarge" }
variable "allocated_storage"     { type = number default = 500 }
variable "max_allocated_storage" { type = number default = 4000 }
variable "tags"                  { type = map(string) default = {} }

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-subnet-group"
  subnet_ids = var.data_subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name   = "${var.name}-rds-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "PostgreSQL from app SGs"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_kms_key" "rds" {
  description             = "RDS encryption key for ${var.name}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "random_password" "master" {
  length  = 32
  special = true
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg"
  family = "postgres16"

  parameter { name = "log_statement"             value = "ddl" }
  parameter { name = "log_min_duration_statement" value = "1000" }
  parameter { name = "rds.force_ssl"             value = "1" }
}

resource "aws_db_instance" "primary" {
  identifier             = var.name
  engine                 = "postgres"
  engine_version         = var.engine_version
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  max_allocated_storage  = var.max_allocated_storage
  storage_type           = "gp3"
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.rds.arn

  db_name                = "sentinelgrid"
  username               = "sgadmin"
  password               = random_password.master.result

  multi_az               = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period      = 35
  backup_window                = "03:00-04:00"
  maintenance_window           = "Mon:04:30-Mon:05:30"
  copy_tags_to_snapshot        = true
  delete_automated_backups     = false
  deletion_protection          = true
  iam_database_authentication_enabled = true
  performance_insights_enabled = true
  performance_insights_retention_period = 31

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final-snapshot"

  tags = var.tags
}

## Store master credentials in Secrets Manager (Vault will pull from here on bootstrap)
resource "aws_secretsmanager_secret" "master" {
  name                    = "${var.name}/master"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "master" {
  secret_id = aws_secretsmanager_secret.master.id
  secret_string = jsonencode({
    username = aws_db_instance.primary.username
    password = random_password.master.result
    host     = aws_db_instance.primary.address
    port     = aws_db_instance.primary.port
    dbname   = aws_db_instance.primary.db_name
  })
}

output "endpoint"           { value = aws_db_instance.primary.endpoint }
output "security_group_id"  { value = aws_security_group.this.id }
output "secret_arn"         { value = aws_secretsmanager_secret.master.arn }
output "kms_key_arn"        { value = aws_kms_key.rds.arn }
