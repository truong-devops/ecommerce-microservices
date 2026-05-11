FROM golang:1.24-alpine AS builder
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /media-service ./cmd/server

FROM gcr.io/distroless/static-debian12
WORKDIR /
COPY --from=builder /media-service /media-service
ENV PORT=8080

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/media-service"]
