FROM golang:1.26.3 AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/live-service ./cmd/server

FROM alpine:3.20

WORKDIR /app
COPY --from=builder /out/live-service /app/live-service
EXPOSE 8080
ENTRYPOINT ["/app/live-service"]
