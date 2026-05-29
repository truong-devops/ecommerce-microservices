FROM golang:1.26.3 AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /payment-service-go ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=builder /payment-service-go /payment-service-go
COPY --from=builder /app/migrations /migrations

ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["/payment-service-go"]
