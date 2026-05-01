FROM golang:1.24-alpine AS builder
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /user-service-go ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=builder /user-service-go /user-service-go
COPY --from=builder /app/migrations /migrations

EXPOSE 3013
ENTRYPOINT ["/user-service-go"]
