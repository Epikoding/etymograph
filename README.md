# EtymoGraph

영어 단어의 어원을 분석하고, 파생어/유사어를 그래프 형태로 탐색하는 서비스

## 핵심 기능

1. 단어 검색 → 어원(라틴어, 그리스어 등) 분석
2. 어원 기반 파생어 탐색 (text → context, pretext, texture...)
3. 유사어 비교 및 뉘앙스 차이 설명 (pretext vs excuse)
4. 꼬리에 꼬리를 무는 그래프 탐색
5. 탐색 히스토리 export (JSON, CSV, Markdown)

## 용어 설명

### 그래프 노드 타입

| 타입 | 영어 | 색상 | 설명 | 예시 |
|------|------|------|------|------|
| **단어** | word | 파란색 | 검색한 영어 단어 | pretext |
| **어근** | root | 주황색 | 단어의 원형 (라틴어, 그리스어 등) | praetextum (라틴어) |
| **구성요소** | component | 빨간색/보라색 | 어근을 구성하는 접두사, 접미사, 어간 | prae- (앞에), textum (짜다) |
| **파생어** | derivative | 청록색 | 같은 어원에서 파생된 다른 단어들 | context, texture, textile |

### 그래프 엣지 (연결선)

노드와 노드 사이를 연결하는 선을 **엣지(Edge)** 또는 **링크(Link)**라고 합니다.

| 연결 | 의미 | 방향 |
|------|------|------|
| 단어 → 어근 | 단어가 이 어근에서 유래함 | 어원 방향 |
| 어근 → 구성요소 | 어근이 이 구성요소들로 이루어짐 | 분해 방향 |
| 단어 → 구성요소 | 단어가 이 구성요소들로 이루어짐 (어근 없을 때) | 분해 방향 |
| 구성요소 → 파생어 | 이 구성요소를 공유하는 파생어 | 파생 방향 |
| 파생어 → 단어 | 파생어 클릭 시 새 단어로 확장 | 탐색 방향 |

### 그래프 레이아웃

```
[단어] ─→ [어근] ─→ [구성요소]
   │                    │
   └──────→ [파생어] ←──┘
```

- **왼쪽 → 오른쪽**: 검색 단어에서 시작해 어원을 탐색
- **노드 클릭**:
  - 단어/파생어 클릭 → 상세 정보 패널 표시
  - 구성요소 클릭 → 해당 구성요소를 공유하는 파생어 탐색
  - 어근 클릭 → 동작 없음 (정보 표시만)

### 어원 관련 용어

| 용어 | 설명 |
|------|------|
| **어원 (Etymology)** | 단어의 기원과 역사적 발전 과정 |
| **접두사 (Prefix)** | 단어 앞에 붙어 의미를 변화시키는 요소 (pre-, con-, sub-) |
| **접미사 (Suffix)** | 단어 뒤에 붙어 품사나 의미를 변화시키는 요소 (-tion, -ly, -ment) |
| **어간 (Stem)** | 접사를 제외한 단어의 핵심 부분 (text, scrib, port) |

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
