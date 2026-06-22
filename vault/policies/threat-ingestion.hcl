## Vault policy for the threat-ingestion service.
## Principle of least privilege — only what the service actually needs.

# Read its own KV secrets
path "secret/data/sentinelgrid/threat-ingestion/*" {
  capabilities = ["read"]
}

# Get dynamic Postgres credentials (auto-rotated each hour)
path "database/creds/threat-ingestion" {
  capabilities = ["read"]
}

# Issue mTLS client certs from the internal PKI for Kafka/internal calls
path "pki_int/issue/sentinelgrid-internal" {
  capabilities = ["create","update"]
}

# Renew its own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Look up its own metadata (for self-introspection)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
