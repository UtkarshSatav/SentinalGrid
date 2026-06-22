#!/usr/bin/env bash
# Vault one-time bootstrap — run AFTER `vault operator init` produces the recovery keys.
# Recovery keys are sealed with KMS auto-unseal, so only the root token is needed here.
set -euo pipefail

: "${VAULT_ADDR:?must be set}"
: "${VAULT_TOKEN:?root token from operator init}"

# ── 1. Enable audit device → stdout (Filebeat ships to immutable S3 audit bucket)
vault audit enable file file_path=stdout

# ── 2. Enable secret engines
vault secrets enable -path=secret   -version=2 kv
vault secrets enable -path=database database
vault secrets enable -path=pki_root pki
vault secrets enable -path=pki_int  pki
vault secrets enable -path=transit  transit       # for envelope-encrypting data at rest

# ── 3. Root + intermediate PKI for service mTLS
vault secrets tune -max-lease-ttl=87600h pki_root
vault write -field=certificate pki_root/root/generate/internal \
  common_name="SentinelGrid Root CA" ttl=87600h > /tmp/root.crt

vault secrets tune -max-lease-ttl=43800h pki_int
vault write -format=json pki_int/intermediate/generate/internal \
  common_name="SentinelGrid Intermediate CA" | jq -r '.data.csr' > /tmp/int.csr
vault write -format=json pki_root/root/sign-intermediate \
  csr=@/tmp/int.csr format=pem_bundle ttl=43800h | jq -r '.data.certificate' > /tmp/int.crt
vault write pki_int/intermediate/set-signed certificate=@/tmp/int.crt

vault write pki_int/roles/sentinelgrid-internal \
  allowed_domains="sentinelgrid.internal,svc.cluster.local" \
  allow_subdomains=true max_ttl=72h

# ── 4. PostgreSQL dynamic credentials
vault write database/config/sentinelgrid \
  plugin_name=postgresql-database-plugin \
  allowed_roles="threat-ingestion,threat-analysis,incident-coordination" \
  connection_url="postgresql://{{username}}:{{password}}@${RDS_ENDPOINT}/sentinelgrid?sslmode=require" \
  username="vault_admin" password="${RDS_VAULT_PASSWORD}"

vault write database/roles/threat-ingestion \
  db_name=sentinelgrid \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA events TO \"{{name}}\";" \
  default_ttl="1h" max_ttl="24h"

# ── 5. Kubernetes auth method (services authenticate using their ServiceAccount JWT)
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

# Write all service policies
for pol in /vault-policies/*.hcl; do
  name=$(basename "$pol" .hcl)
  vault policy write "$name" "$pol"
  vault write "auth/kubernetes/role/${name}" \
    bound_service_account_names="${name}" \
    bound_service_account_namespaces="sg-apps,sg-platform" \
    policies="${name}" ttl=1h
done

echo "✓ Vault bootstrapped"
