# Generic multi-stage build for any Go service in services/.
#
# Build args:
#   SERVICE — service directory under services/  (e.g. gateway)
#   BINARY  — binary name under cmd/             (default: server)
#
# Usage:
#   docker build -f infrastructure/docker/Dockerfile.go \
#                --build-arg SERVICE=gateway -t novastream/gateway .

ARG GO_VERSION=1.23

# --- builder ------------------------------------------------------------
FROM golang:${GO_VERSION}-alpine AS builder
ARG SERVICE
ARG BINARY=server
RUN apk add --no-cache git ca-certificates
WORKDIR /src

# Copy the whole workspace because services share libs/go/pkg via go.work.
COPY . .

# Build with -trimpath + ldflags=-s -w for a smaller, reproducible binary.
WORKDIR /src/services/${SERVICE}
ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-trimpath
RUN go build -ldflags="-s -w" -o /out/${BINARY} ./cmd/${BINARY}

# --- final image --------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
ARG BINARY=server
WORKDIR /
COPY --from=builder /out/${BINARY} /novastream-service
USER nonroot:nonroot
EXPOSE 8080 50051
ENTRYPOINT ["/novastream-service"]
