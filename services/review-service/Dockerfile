FROM golang:1.26.3 AS builder
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /review-service-go ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=builder /review-service-go /review-service-go

ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["/review-service-go"]
