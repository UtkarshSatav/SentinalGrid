#!/usr/bin/env bash
# Take cold-storage forensic snapshots of a pod, node, or DB before remediation.
# All output goes to the WORM audit bucket.
set -euo pipefail

usage() { echo "usage: $0 --target <pod|node|db> [--name NAME]"; exit 1; }
[[ "${1:-}" == "--target" ]] || usage
target=$2; name=${4:-}
ts=$(date -u +%Y%m%dT%H%M%SZ)
bucket=s3://sentinelgrid-primary-audit/forensics/${ts}

case $target in
  pod)
    kubectl logs    "$name" -n sg-apps --all-containers > "/tmp/${name}.logs"
    kubectl describe pod "$name" -n sg-apps             > "/tmp/${name}.describe"
    kubectl get pod "$name" -n sg-apps -o yaml          > "/tmp/${name}.yaml"
    aws s3 cp "/tmp/${name}.logs"     "${bucket}/pod/${name}/logs"
    aws s3 cp "/tmp/${name}.describe" "${bucket}/pod/${name}/describe"
    aws s3 cp "/tmp/${name}.yaml"     "${bucket}/pod/${name}/manifest" \
      --metadata-directive REPLACE --metadata sha256sum="$(sha256sum /tmp/${name}.yaml | awk '{print $1}')"
    ;;
  node)
    instance_id=$(kubectl get node "$name" -o jsonpath='{.spec.providerID}' | awk -F/ '{print $NF}')
    aws ec2 create-snapshot --volume-id "$(./query-root-volume.sh "$instance_id")" \
      --description "forensic-${name}-${ts}" \
      --tag-specifications "ResourceType=snapshot,Tags=[{Key=Forensic,Value=true},{Key=Node,Value=${name}}]"
    ;;
  db)
    aws rds create-db-snapshot \
      --db-snapshot-identifier "forensic-${name}-${ts}" \
      --db-instance-identifier "$name" \
      --tags Key=Forensic,Value=true
    ;;
  *) usage ;;
esac

echo "✓ forensic artifacts at ${bucket}"
