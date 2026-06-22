# Kibana Spaces & Role Mapping

| Space            | Audience              | Index patterns visible        | Permissions |
|------------------|-----------------------|-------------------------------|-------------|
| `operations`     | SRE / Platform        | `sg-app-logs-*`, `sg-infra-*` | read + dashboards |
| `soc`            | Security ops center   | `sg-soc-events-*`, `sg-audit-*` | read + lens + alerting |
| `incident`       | Incident responders   | `sg-soc-events-*`             | read + saved searches |
| `executive`      | Leadership / auditors | dashboards only               | read-only dashboards |

Role mapping is driven by AWS SSO group claims via Elasticsearch's OIDC realm.
SAML group → built-in role mapping is defined in `roles_mapping.yml` (provisioned by the bootstrap script).

## Pre-built dashboards

- **Threat ingestion live** — events/sec by source, drop rate, top source orgs
- **Active incidents** — open Temporal workflows by severity, mean time to mitigate
- **SOC daily brief** — top MITRE techniques observed, geo heatmap of source IPs
- **Audit trail** — every kubectl + Vault + Jenkins audit event (immutable index)
