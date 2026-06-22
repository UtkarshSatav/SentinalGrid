#!/usr/bin/env bash
# End-to-end smoke test — pushes a synthetic event through the full pipeline
# (ingestion → Kafka → analysis → ES → TAXII feed) and verifies it surfaces.
set -euo pipefail

ENV=${1:-staging}
SVC=${2:-all}

BASE_URL=$(case "$ENV" in
  staging)  echo https://staging-api.sentinelgrid.gov ;;
  prod)     echo https://api.sentinelgrid.gov ;;
  dr-prod)  echo https://api-dr.sentinelgrid.gov ;;
  *) echo "unknown env: $ENV" >&2; exit 1 ;;
esac)

trace=$(uuidgen)
payload=$(cat <<EOF
{
  "source_org": "smoke-test",
  "event_type": "synthetic_probe",
  "severity": "low",
  "occurred_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "payload": { "src_ip": "203.0.113.42", "mitre_technique": "T1059" },
  "signature": "smoke-${trace}"
}
EOF
)

echo "→ Pushing synthetic event ${trace}"
http_code=$(curl -sS -o /tmp/resp.json -w '%{http_code}' \
  -H "Content-Type: application/json" \
  -H "X-Trace-Id: ${trace}" \
  --cert /etc/pki/smoke-client.crt --key /etc/pki/smoke-client.key \
  -X POST "${BASE_URL}/v1/events" -d "$payload")
[[ "$http_code" == "202" ]] || { echo "✗ ingest returned $http_code"; cat /tmp/resp.json; exit 1; }

echo "→ Waiting for event in Elasticsearch (max 60 s)"
for i in $(seq 1 30); do
  hits=$(curl -sS "https://es.sentinelgrid.internal:9200/sg-app-logs-*/_search?q=signature:smoke-${trace}" \
    -u "${ES_USER}:${ES_PASS}" | jq -r '.hits.total.value')
  [[ "$hits" -gt 0 ]] && break
  sleep 2
done
[[ "${hits:-0}" -gt 0 ]] || { echo "✗ event never reached ES"; exit 1; }

echo "→ Verifying TAXII feed has the IOC"
poll=$(curl -sS "${BASE_URL}/taxii2/collections/synthetic/objects/?match[id]=indicator-${trace}" \
  -H "Accept: application/taxii+json;version=2.1")
echo "$poll" | jq -e '.objects | length > 0' >/dev/null || { echo "✗ IOC not published"; exit 1; }

echo "✓ smoke test passed (trace=${trace})"
