FROM golang:1.24-alpine AS builder
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /shipping-service ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /nexus-healthcheck ./cmd/nexus-healthcheck

FROM gcr.io/distroless/static-debian12
WORKDIR /
COPY --from=builder /shipping-service /shipping-service
COPY --from=builder /nexus-healthcheck /nexus-healthcheck
COPY --from=builder /app/migrations /migrations
ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["/shipping-service"]
