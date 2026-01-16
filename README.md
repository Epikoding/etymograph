# EtymoGraph

영어 단어의 어원을 분석하고, 파생어/유사어를 그래프 형태로 탐색하는 서비스

## 핵심 기능

1. 단어 검색 → 어원(라틴어, 그리스어 등) 분석
2. 어원 기반 파생어 탐색 (text → context, pretext, texture...)
3. 유사어 비교 및 뉘앙스 차이 설명 (pretext vs excuse)
4. 꼬리에 꼬리를 무는 그래프 탐색
5. 탐색 히스토리 export (JSON, CSV, Markdown)

## 아키텍처

```
Frontend (Next.js:3000) → API (NestJS:4000) → LLM Proxy (Go:8081) → Ollama (qwen3:8b)
                                ↓                    ↓
                           PostgreSQL              Redis
                                ↑
                        Rate Limiter (Go:8080)
```

## 로컬 개발

### 사전 요구사항

- Docker & Docker Compose
- Node.js 20+
- Go 1.22+
- Ollama (with qwen3:8b model)

### 실행

```bash
# Ollama 모델 다운로드 (최초 1회)
ollama pull qwen3:8b

# 전체 스택 실행
docker-compose up -d

# 또는 개별 서비스 실행
make dev-frontend  # Frontend only
make dev-api       # API only
make dev-llm       # LLM Proxy only
```

### 개발 URL

- Frontend: http://localhost:3000
- API: http://localhost:4000
- API Docs (Swagger): http://localhost:4000/api/docs
- LLM Proxy: http://localhost:8081
- Rate Limiter: http://localhost:8080

## 프로젝트 구조

```
etymograph/
├── frontend/          # Next.js 15
├── api/               # NestJS 10
├── llm-proxy/         # Go 1.22
├── rate-limiter/      # Go 1.22
├── k8s/               # Kubernetes manifests
├── docker-compose.yml
├── Makefile
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/words/search | 단어 검색 + 어원 분석 |
| GET | /api/words/:word/etymology | 어원 상세 |
| GET | /api/words/:word/derivatives | 파생어 목록 |
| GET | /api/words/:word/synonyms | 유사어 + 차이점 |
| POST | /api/sessions | 세션 생성 |
| GET | /api/sessions/:id | 세션 조회 |
| POST | /api/sessions/:id/words | 세션에 단어 추가 |
| GET | /api/export/:sessionId | Export (format=json\|csv\|md) |

## 기술 스택

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TailwindCSS, react-force-graph |
| API | NestJS 10, Prisma, TypeScript |
| LLM Proxy | Go 1.22, Gin |
| Rate Limiter | Go 1.22, Token Bucket |
| Database | PostgreSQL 16, Redis 7 |
| LLM | Ollama + Qwen3:8b |
| Infra | k3s, Traefik |
