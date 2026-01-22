FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./

# Copy source
COPY . .

# Download dependencies and build both binaries
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -o /api cmd/server/main.go && \
    CGO_ENABLED=0 GOOS=linux go build -o /seed cmd/seed/main.go

# Runtime
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /api .
COPY --from=builder /seed .
COPY --from=builder /app/data ./data

EXPOSE 4000

CMD ["./api"]
