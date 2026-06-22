## MSK (managed Kafka) — 3-AZ cluster, in-transit + at-rest encryption,
## IAM auth, used for event ingestion pipeline.

variable "name"           { type = string }
variable "vpc_id"         { type = string }
variable "data_subnet_ids" { type = list(string) }
variable "kafka_version"  { type = string default = "3.7.x" }
variable "broker_count"   { type = number default = 3 }
variable "instance_type"  { type = string default = "kafka.m7g.xlarge" }
variable "tags"           { type = map(string) default = {} }

resource "aws_security_group" "msk" {
  name   = "${var.name}-msk-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port = 9098  # IAM-auth TLS
    to_port   = 9098
    protocol  = "tcp"
    self      = true
    description = "Kafka IAM TLS"
  }
  ingress {
    from_port = 2181
    to_port   = 2181
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_kms_key" "msk" {
  description             = "MSK encryption for ${var.name}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_msk_configuration" "this" {
  name              = "${var.name}-cfg"
  kafka_versions    = [var.kafka_version]
  server_properties = <<EOT
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.io.threads=8
num.network.threads=5
num.partitions=12
log.retention.hours=72
unclean.leader.election.enable=false
EOT
}

resource "aws_msk_cluster" "this" {
  cluster_name           = var.name
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.broker_count

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.data_subnet_ids
    security_groups = [aws_security_group.msk.id]
    storage_info {
      ebs_storage_info { volume_size = 1000 }
    }
  }

  client_authentication {
    sasl { iam = true }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.this.arn
    revision = aws_msk_configuration.this.latest_revision
  }

  open_monitoring {
    prometheus {
      jmx_exporter  { enabled_in_broker = true }
      node_exporter { enabled_in_broker = true }
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${var.name}"
  retention_in_days = 90
}

output "bootstrap_brokers" { value = aws_msk_cluster.this.bootstrap_brokers_sasl_iam }
output "security_group_id" { value = aws_security_group.msk.id }
