.PHONY: all dev dev-frontend dev-api dev-llm dev-rate-limiter build clean

# Development
dev:
	docker-compose up -d

dev-frontend:
	cd frontend && npm run dev

dev-api:
	cd api && npm run start:dev

dev-llm:
	cd llm-proxy && go run cmd/server/main.go

dev-rate-limiter:
	cd rate-limiter && go run cmd/server/main.go

# Build
build:
	docker-compose build

build-frontend:
	cd frontend && npm run build

build-api:
	cd api && npm run build

build-llm:
	cd llm-proxy && go build -o bin/llm-proxy cmd/server/main.go

build-rate-limiter:
	cd rate-limiter && go build -o bin/rate-limiter cmd/server/main.go

# Docker
docker-build:
	docker-compose build --no-cache

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Database
db-migrate:
	cd api && npx prisma migrate dev

db-generate:
	cd api && npx prisma generate

db-studio:
	cd api && npx prisma studio

# k3s
k8s-apply:
	kubectl apply -k k8s/

k8s-delete:
	kubectl delete -k k8s/

# Test
test:
	cd api && npm run test
	cd frontend && npm run test
	cd llm-proxy && go test ./...
	cd rate-limiter && go test ./...

# Clean
clean:
	docker-compose down -v
	rm -rf frontend/.next
	rm -rf api/dist
	rm -rf llm-proxy/bin
	rm -rf rate-limiter/bin

# Ollama
ollama-pull:
	ollama pull qwen3:8b

ollama-run:
	ollama run qwen3:8b
