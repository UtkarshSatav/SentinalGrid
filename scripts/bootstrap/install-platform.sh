#!/usr/bin/env bash
# Post-Terraform bootstrap: install Vault, monitoring, logging, ingress, KEDA, Argo Rollouts.
# Idempotent — safe to re-run.
set -euo pipefail
trap 'echo "✗ failed at line $LINENO"' ERR

: "${CLUSTER:?must be set, e.g. sentinelgrid-primary}"
: "${REGION:?must be set, e.g. us-east-1}"

echo "→ Verifying kubectl context"
kubectl config use-context "arn:aws:eks:${REGION}:$(aws sts get-caller-identity --query Account --output text):cluster/${CLUSTER}"

echo "→ Namespaces"
kubectl apply -f "$(dirname "$0")/../../kubernetes/namespaces/namespaces.yaml"

echo "→ AWS Load Balancer Controller"
helm upgrade --install aws-lb-controller eks/aws-load-balancer-controller \
  -n kube-system --set clusterName="${CLUSTER}" \
  --set serviceAccount.create=false --set serviceAccount.name=aws-load-balancer-controller

echo "→ Cluster Autoscaler"
helm upgrade --install autoscaler autoscaler/cluster-autoscaler \
  -n kube-system --set autoDiscovery.clusterName="${CLUSTER}" --set awsRegion="${REGION}"

echo "→ Vault (HA Raft + KMS auto-unseal)"
helm upgrade --install vault hashicorp/vault -n sg-security --create-namespace \
  -f "$(dirname "$0")/../../kubernetes/helm-values/vault.yaml"

echo "→ Prometheus + Alertmanager + Grafana (kube-prometheus-stack)"
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  -n sg-observability --create-namespace \
  -f "$(dirname "$0")/../../kubernetes/helm-values/monitoring.yaml"
kubectl apply -f "$(dirname "$0")/../../monitoring/prometheus/rules/" -n sg-observability

echo "→ ELK (ECK operator)"
helm upgrade --install eck-operator elastic/eck-operator -n sg-observability
kubectl apply -f "$(dirname "$0")/../../logging/filebeat/filebeat-daemonset.yaml"

echo "→ KEDA (Kafka-lag-based autoscaling)"
helm upgrade --install keda kedacore/keda -n keda --create-namespace

echo "→ Argo Rollouts"
kubectl apply -k https://github.com/argoproj/argo-rollouts/manifests/cluster-install?ref=stable

echo "→ Velero"
helm upgrade --install velero vmware-tanzu/velero -n velero --create-namespace \
  -f "$(dirname "$0")/../../kubernetes/helm-values/velero.yaml"

echo "→ Kyverno (admission policies — image-signature verification, etc.)"
helm upgrade --install kyverno kyverno/kyverno -n kyverno --create-namespace

echo "✓ Platform bootstrap complete. Next: ./vault/init-scripts/bootstrap.sh"
