# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EtymoGraph는 영단어의 어원을 분석하고 파생어/유사어를 그래프 형태로 탐색하는 웹 애플리케이션이다. LLM(Gemini/Ollama)을 통해 어원 데이터를 생성하고 PostgreSQL에 캐싱한다.
**중요**: 코드 작성 시 반드시 `README.md`를 참조하세요.

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, react-force-graph-2d
- **Backend (api-go)**: Go 1.23, Gin, GORM
- **LLM Proxy**: Go, Gin (Gemini API 또는 Ollama 연동)
- **Database**: PostgreSQL 16 (JSONB for etymology), Redis 7
- **Infra**: Docker Compose, k3s (optional)

## Development Commands

```bash
# 전체 스택 실행 (권장)
docker compose up -d --build

# 개별 서비스 로컬 실행
cd frontend && npm run dev        # http://localhost:3000
cd llm-proxy && go run cmd/server/main.go  # http://localhost:8081
cd api-go && go run cmd/server/main.go     # http://localhost:4000 (requires DB)

# 로그 확인
docker compose logs -f api
docker compose logs -f llm-proxy

# DB 접속
docker exec -it etymograph-postgres-1 psql -U etymograph

# 테스트
cd llm-proxy && go test ./...
cd rate-limiter && go test ./...
cd frontend && npm run lint

# 빌드
cd llm-proxy && go build -o bin/llm-proxy cmd/server/main.go
cd api-go && go build -o bin/api cmd/server/main.go
cd frontend && npm run build
```

## Architecture

```
Frontend (Next.js:3000) → API (Go:4000) → LLM Proxy (Go:8081) → Gemini/Ollama
                              ↓
                           Redis ← 1차 캐시 (word:language 키)
                              ↓
                         PostgreSQL ← 2차 캐시 (word, language 복합키)
```

### Data Flow

1. 사용자가 단어 검색 → `POST /api/words/search`
2. **Redis 캐시 확인** (word:language 키, 예: "teacher:ko")
3. Redis 미스 시 **PostgreSQL 캐시 확인** (word + language 키)
4. 캐시 미스 시 단어 유효성 검증 (로컬 words.txt → Free Dictionary API)
5. LLM Proxy 호출 → Gemini/Ollama에서 어원 분석 (언어별 번역 포함)
6. 결과를 **Redis + PostgreSQL에 저장** 후 반환
7. Frontend에서 react-force-graph-2d로 그래프 시각화

### Key Design Decisions

- **2단계 캐싱**: Redis(1차) → PostgreSQL(2차). Redis는 빠른 조회, PostgreSQL은 영구 저장
- **캐시 무효화**: `/refresh` 호출 시 Redis 캐시 삭제, 새 데이터 반영
- **언어별 캐싱**: `(word, language)` 복합 유니크 인덱스 사용. 같은 단어라도 한국어/일본어/중국어 버전이 별도 레코드
- **단어 검증**: 로컬 단어 목록 1차 검증 → Free Dictionary API 2차 검증 (LLM 토큰 낭비 방지)
- **etymology JSON 구조**: `{ "ko": {...}, "ja": {...} }` 형태로 다국어 지원
- **접두사/접미사 지원**: dash(-)로 접사 구분 (`-er` = 접미사, `un-` = 접두사)

## Project Structure

```
etymograph/
├── api-go/           # Go API 서버
│   ├── cmd/server/   # main.go 진입점
│   ├── internal/
│   │   ├── cache/    # Redis 캐시 클라이언트
│   │   ├── handler/  # HTTP 핸들러 (word, session, export)
│   │   ├── model/    # GORM 모델 (Word, Session)
│   │   ├── client/   # LLM Proxy 클라이언트
│   │   ├── validator/# 단어 유효성 검증
│   │   └── scheduler/# 백그라운드 어원 생성 스케줄러
│   └── data/         # words.txt, priority_words.txt
├── llm-proxy/        # LLM 프록시 서버
│   └── internal/
│       ├── llm/      # Gemini/Ollama 클라이언트, prompts.go
│       └── handler/  # etymology, derivatives, synonyms (접두사/접미사 감지 포함)
├── frontend/         # Next.js 앱
│   ├── components/   # EtymologyGraph, EtymologyCard, ...
│   ├── lib/api.ts    # API 클라이언트
│   └── types/word.ts # Etymology 타입 정의
├── rate-limiter/     # Token bucket rate limiter
└── k8s/              # Kubernetes manifests
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/words/search | 단어 검색 + 어원 분석 |
| GET | /api/words/:word/etymology | 어원 상세 |
| GET | /api/words/:word/derivatives | 파생어 목록 |
| GET | /api/words/:word/synonyms | 유사어 비교 |
| POST | /api/words/:word/refresh | 어원 새로고침 (LLM 재호출) |
| POST | /api/words/:word/apply | 새 어원 적용 확정 |
| POST | /api/words/:word/revert | 이전 어원으로 복원 |

모든 엔드포인트는 `?language=Korean|Japanese|Chinese` 쿼리 파라미터 지원.

## Environment Variables

```bash
# LLM Provider (gemini 또는 ollama)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.0-flash

# Ollama (로컬 모델 사용 시)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b

# 백그라운드 스케줄러 (선택)
SCHEDULER_ENABLED=false
SCHEDULER_INTERVAL=5s
```

## Graph Node Types

| 타입 | 색상 | 설명 |
|------|------|------|
| word | 파란색 | 검색한 영어 단어 |
| root | 주황색 | 어근 (라틴어/그리스어 원형) |
| component | 보라색 | 접두사/접미사/어간 |
| derivative | 청록색 | 같은 어원 파생어 |

## LLM Prompt 규칙 (llm-proxy/internal/llm/prompts.go)

- `definition.brief`: 사전 번역 (1-3 단어). 직역 금지, 표준 번역 사용
- `origin.components[].part`: 영어 접사 형태 (예: "pre-", "-tion"). 그리스어/라틴어 원문 금지
- 응답은 순수 JSON만 (마크다운 코드블록 없이)

### 접두사/접미사 검색

사용자 입력 시 dash(-)로 단어 유형 구분:

| 입력 | 유형 | 사용 프롬프트 |
|------|------|---------------|
| `-er` | 접미사 | `SuffixEtymologyPrompt` |
| `un-` | 접두사 | `PrefixEtymologyPrompt` |
| `teacher` | 일반 단어 | `EtymologyPrompt` |

접두사/접미사 검색 시 전용 JSON 스키마 사용 (examples, relatedSuffixes/relatedPrefixes 등)

## Redis 캐시 사용법

```bash
# 캐시 확인
docker exec etymograph-redis-1 redis-cli GET "teacher:ko"

# 캐시 삭제
docker exec etymograph-redis-1 redis-cli DEL "teacher:ko"

# 모든 캐시 키 목록
docker exec etymograph-redis-1 redis-cli KEYS "*"
```
