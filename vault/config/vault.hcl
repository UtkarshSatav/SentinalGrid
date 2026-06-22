## Vault server — HA cluster on Raft (3 nodes), KMS auto-unseal,
## audit logs streamed to STDOUT (picked up by Filebeat → immutable S3).

ui            = true
cluster_name  = "sentinelgrid-vault"
disable_mlock = false
log_level     = "info"

listener "tcp" {
  address                  = "0.0.0.0:8200"
  cluster_address          = "0.0.0.0:8201"
  tls_cert_file            = "/vault/tls/vault.crt"
  tls_key_file             = "/vault/tls/vault.key"
  tls_min_version          = "tls13"
  tls_require_and_verify_client_cert = false
  telemetry { unauthenticated_metrics_access = false }
}

storage "raft" {
  path    = "/vault/data"
  node_id = "${POD_NAME}"

  retry_join { leader_api_addr = "https://vault-0.vault-internal:8200" }
  retry_join { leader_api_addr = "https://vault-1.vault-internal:8200" }
  retry_join { leader_api_addr = "https://vault-2.vault-internal:8200" }
}

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/sentinelgrid-vault-unseal"
}

service_registration "kubernetes" {}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

api_addr     = "https://$(POD_IP):8200"
cluster_addr = "https://$(POD_IP):8201"
