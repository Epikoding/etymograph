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
- **다중 버전 시스템**: 단어당 최대 3개 어원 버전 저장. `etymology_revisions` 테이블에서 관리. 로그인 사용자는 선호 버전 선택 가능
- **검색 히스토리 버퍼링**: Redis ZSET으로 검색어 버퍼링 → K8s CronJob으로 매시간 DB 일괄 저장. 사용자가 히스토리 조회 시 on-demand flush

## Project Structure

```
etymograph/
├── api-go/           # Go API 서버
│   ├── cmd/
│   │   ├── server/       # main.go 진입점
│   │   ├── seed/         # 단어 시드 CLI
│   │   └── history-flush/# 검색 히스토리 Redis→DB 일괄 저장 CLI
│   ├── internal/
│   │   ├── auth/     # Google OAuth, JWT 토큰 관리
│   │   ├── cache/    # Redis 캐시 클라이언트
│   │   ├── handler/  # HTTP 핸들러 (word, fill, session, export, auth, history)
│   │   ├── middleware/ # 인증 미들웨어
│   │   ├── model/    # GORM 모델 (Word, EtymologyRevision, UserEtymologyPreference, Session, User, SearchHistoryDaily)
│   │   ├── client/   # LLM Proxy 클라이언트
│   │   └── validator/# 단어 유효성 검증
│   └── data/         # words.txt, priority_words.txt
├── llm-proxy/        # LLM 프록시 서버
│   └── internal/
│       ├── llm/      # Gemini/Ollama 클라이언트, prompts.go
│       └── handler/  # etymology, derivatives, synonyms (접두사/접미사 감지 포함)
├── frontend/         # Next.js 앱
│   ├── components/   # EtymologyGraph, EtymologyCard, HistoryPanel, Header, ...
│   ├── lib/
│   │   ├── api.ts              # API 클라이언트
│   │   └── use-morpheme-cache.ts # 접사 캐싱 훅
│   └── types/        # word.ts (Etymology), auth.ts (User, History)
├── rate-limiter/     # Token bucket rate limiter
└── k8s/              # Kubernetes manifests
    └── jobs/         # CronJob (history-flush)
```

## API Endpoints

### 형태소 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/morphemes | 접두사/접미사 목록 (프론트엔드 캐싱용) |

### 단어 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/words/search | 단어 검색 + 어원 분석 |
| GET | /api/words/:word/etymology | 어원 상세 |
| GET | /api/words/:word/derivatives | 파생어 목록 |
| GET | /api/words/:word/synonyms | 유사어 비교 |
| POST | /api/words/:word/refresh | 어원 새로고침 (새 버전 생성, 최대 3개) |
| GET | /api/words/:word/revisions | 해당 단어의 모든 버전 목록 |
| GET | /api/words/:word/revisions/:revNum | 특정 버전 조회 |
| POST | /api/words/:word/revisions/:revNum/select | 유저가 해당 버전 선택 (로그인 필요) |

### 어원 일괄 생성 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/words/unfilled | revision이 없는 단어 목록 (페이지네이션) |
| POST | /api/words/fill-etymology | 어원 일괄 생성 Job 시작 (revision 생성) |
| GET | /api/words/fill-status/:jobId | Job 진행 상황 조회 |
| POST | /api/words/fill-etymology/stop | 진행 중인 Job 중단 |
| GET | /api/words/fill-jobs | 모든 Job 목록 조회 |

모든 단어 엔드포인트는 `?language=Korean` 쿼리 파라미터 지원 (현재 한국어만 지원).

### 검색 히스토리 API (인증 필요)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/history | 검색 히스토리 조회 (Redis flush 후 DB에서 조회) |
| GET | /api/history/dates | 날짜별 히스토리 요약 목록 |
| GET | /api/history/dates/:date | 특정 날짜 검색어 목록 (YYYY-MM-DD) |
| DELETE | /api/history/words/:word | 특정 단어 삭제 (JSONB에서 제거) |
| DELETE | /api/history | 전체 히스토리 삭제 |

**히스토리 저장 흐름**:
1. 단어 검색 시 → Redis ZSET에 저장 (`history:{userID}` 키, score=timestamp)
2. 사용자가 히스토리 조회 시 → on-demand flush (Redis → DB)
3. K8s CronJob이 매시간 → 전체 유저 일괄 flush

## Environment Variables

```bash
# LLM Provider (gemini 또는 ollama)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.0-flash

# Ollama (로컬 모델 사용 시)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

## 단어 시드 및 어원 일괄 생성

```bash
# 1. 단어 시드 (최초 1회 - priority_words.txt에서 36,900개 단어 DB에 삽입)
docker compose exec api ./seed

# 2. unfilled 단어 확인
curl "http://localhost:4000/api/words/unfilled?language=ko&limit=10"

# 3. 어원 일괄 생성 시작
curl -X POST "http://localhost:4000/api/words/fill-etymology" \
  -H "Content-Type: application/json" \
  -d '{"language":"Korean","batchSize":100,"delayMs":2000}'

# 4. 진행 상황 확인
curl "http://localhost:4000/api/words/fill-status/<jobId>"

# 5. 필요시 중단
curl -X POST "http://localhost:4000/api/words/fill-etymology/stop"
```

## Graph Node Types

| 타입 | 색상 | 설명 |
|------|------|------|
| word | 파란색 | 검색한 영어 단어 |
| root | 주황색 | 어근 (라틴어/그리스어 원형) |
| component | 보라색 | 접두사/접미사/어간 |
| derivative | 청록색 | 같은 어원 파생어 |

### 노드 클릭 동작

| 타입 | 클릭 가능 | 동작 |
|------|----------|------|
| word | O | 해당 단어 검색 |
| root | X | 클릭 불가 (라틴어/그리스어 원형은 정보 표시용) |
| component | O | 접두사/접미사 검색 가능. 어간(port-)은 하이픈 제거 후 words.txt 검증 |
| derivative | O | 해당 단어 검색 |

**검증 로직**:
- 접두사 (`xxx-`): `prefixes.txt` 화이트리스트에서 검증 → 없으면 하이픈 제거 후 `words.txt` fallback
- 접미사 (`-xxx`): `suffixes.txt` 화이트리스트에서 검증
- 일반 단어: `words.txt` API로 검증
- 어간 (`port-`): 접두사 목록에 없으면 → `port`로 변환 → `words.txt` 검증

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

## Redis 사용법

### 어원 캐시

```bash
# 캐시 확인
docker exec etymograph-redis-1 redis-cli GET "teacher:ko"

# 캐시 삭제
docker exec etymograph-redis-1 redis-cli DEL "teacher:ko"

# 모든 캐시 키 목록
docker exec etymograph-redis-1 redis-cli KEYS "*"
```

### 검색 히스토리 버퍼

```bash
# 특정 유저의 히스토리 버퍼 확인 (ZSET)
docker exec etymograph-redis-1 redis-cli ZRANGE "history:1" 0 -1 WITHSCORES

# 활성 유저 목록 확인 (SET)
docker exec etymograph-redis-1 redis-cli SMEMBERS "history:active"

# 히스토리 수동 flush (dry-run)
docker compose exec api ./history-flush --dry-run

# 히스토리 수동 flush (실제 실행)
docker compose exec api ./history-flush
```
