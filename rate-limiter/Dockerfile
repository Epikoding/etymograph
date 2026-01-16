FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./

# Copy source
COPY . .

# Download dependencies and build
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o /rate-limiter cmd/server/main.go

# Runtime
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /rate-limiter .

EXPOSE 8080

CMD ["./rate-limiter"]
