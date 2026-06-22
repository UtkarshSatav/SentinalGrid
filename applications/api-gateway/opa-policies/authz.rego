package sentinelgrid.authz

# Authorization policy for SentinelGrid partner organizations.
# Decision: allow partners to push events and pull intel, but restrict
# incident-coordination mutations to authenticated SOC operators.

default allow := false

# Partners (mTLS client cert mapped to org) may submit security events.
allow if {
    input.method == "POST"
    startswith(input.path, "/v1/events")
    input.client.role == "partner"
}

# Any authenticated subscriber may pull the TAXII intel feed.
allow if {
    input.method == "GET"
    startswith(input.path, "/taxii2")
    input.client.authenticated == true
}

# Only SOC operators may open or advance incidents.
allow if {
    startswith(input.path, "/v1/incidents")
    input.client.role == "soc-operator"
}

# Health and metrics endpoints are always permitted (scraped internally).
allow if {
    input.path in ["/healthz", "/readyz", "/metrics"]
}
