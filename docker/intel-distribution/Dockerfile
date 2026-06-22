# Intel-distribution: STIX/TAXII publisher (Go).
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY applications/intel-distribution/go.mod applications/intel-distribution/go.sum ./
RUN go mod download
COPY applications/intel-distribution/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/intel-distribution ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/intel-distribution /usr/local/bin/intel-distribution
USER nonroot
EXPOSE 8082
ENTRYPOINT ["/usr/local/bin/intel-distribution"]
