# API gateway: Kong + OPA bundle.
FROM kong:3.8-ubuntu
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
COPY applications/api-gateway/kong.yml /etc/kong/kong.yml
COPY applications/api-gateway/opa-policies /etc/opa/policies
ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_ADMIN_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_ERROR_LOG=/dev/stderr
USER kong
EXPOSE 8000 8001
