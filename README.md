# EtymoGraph

영어 단어의 어원을 분석하고, 파생어/유사어를 그래프 형태로 탐색하는 서비스

## 핵심 기능

1. 단어 검색 → 어원(라틴어, 그리스어 등) 분석
2. 어원 기반 파생어 탐색 (text → context, pretext, texture...)
3. 유사어 비교 및 뉘앙스 차이 설명 (pretext vs excuse)
4. 꼬리에 꼬리를 무는 그래프 탐색
5. 탐색 히스토리 export (JSON, CSV, Markdown)
6. **어원 버전 관리**: 단어당 최대 3개의 LLM 생성 버전 저장, 선호 버전 선택 가능

## 용어 설명

### 그래프 노드 타입

| 타입         | 영어       | 색상          | 설명                                 | 예시                        |
| ------------ | ---------- | ------------- | ------------------------------------ | --------------------------- |
| **단어**     | word       | 파란색        | 검색한 영어 단어                     | pretext                     |
| **어근**     | root       | 주황색        | 단어의 원형 (라틴어, 그리스어 등)    | praetextum (라틴어)         |
| **구성요소** | component  | 빨간색/보라색 | 어근을 구성하는 접두사, 접미사, 어간 | prae- (앞에), textum (짜다) |
| **파생어**   | derivative | 청록색        | 같은 어원에서 파생된 다른 단어들     | context, texture, textile   |

### 그래프 엣지 (연결선)

노드와 노드 사이를 연결하는 선을 **엣지(Edge)** 또는 **링크(Link)**라고 합니다.

| 연결              | 의미                                           | 방향      |
| ----------------- | ---------------------------------------------- | --------- |
| 단어 → 어근       | 단어가 이 어근에서 유래함                      | 어원 방향 |
| 어근 → 구성요소   | 어근이 이 구성요소들로 이루어짐                | 분해 방향 |
| 단어 → 구성요소   | 단어가 이 구성요소들로 이루어짐 (어근 없을 때) | 분해 방향 |
| 구성요소 → 파생어 | 이 구성요소를 공유하는 파생어                  | 파생 방향 |
| 파생어 → 단어     | 파생어 클릭 시 새 단어로 확장                  | 탐색 방향 |

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

| 용어                 | 설명                                                             |
| -------------------- | ---------------------------------------------------------------- |
| **어원 (Etymology)** | 단어의 기원과 역사적 발전 과정                                   |
| **접두사 (Prefix)**  | 단어 앞에 붙어 의미를 변화시키는 요소 (pre-, con-, sub-)         |
| **접미사 (Suffix)**  | 단어 뒤에 붙어 품사나 의미를 변화시키는 요소 (-tion, -ly, -ment) |
| **어간 (Stem)**      | 접사를 제외한 단어의 핵심 부분 (text, scrib, port)               |

### 유사어 (Synonyms) vs 파생어 (Derivatives)

| 구분       | 유사어 (Synonyms)                          | 파생어 (Derivatives)                     |
| ---------- | ------------------------------------------ | ---------------------------------------- |
| **정의**   | 의미는 비슷하지만 **어원이 다른** 단어들   | 같은 어원에서 **파생된** 단어들          |
| **목적**   | 뉘앙스 차이 학습, 어휘 확장                | 어원 기반 단어 연결, 체계적 암기         |
| **예시**   | happy → joyful (Latin), glad (Old English) | text → context, pretext, texture         |
| **API**    | `GET /api/words/:word/synonyms`            | `GET /api/words/:word/derivatives`       |

**유사어 비교 예시 (happy):**

| 유사어  | 어원            | 뉘앙스                           |
| ------- | --------------- | -------------------------------- |
| joyful  | Latin (gaudere) | 기쁨이 외부로 표현되는 느낌      |
| glad    | Old English     | 일시적인 기쁨, 구어체            |
| content | Latin (contentus) | 만족스러운, 차분한 행복        |

### 다의어 (Polysemy)

하나의 어원에서 여러 의미로 확장된 단어들을 분석합니다.

**예시 (capital):**

| 의미     | 도메인   | 의미 확장 과정                                    |
| -------- | -------- | ------------------------------------------------- |
| 수도     | 정치     | caput (머리) → 국가의 "머리" → 수도               |
| 자본금   | 금융     | caput (머리) → 원금 (이자를 낳는 "머리")          |
| 대문자   | 타이포   | caput (머리) → 문장의 "머리"에 오는 글자          |
| 사형     | 법률     | caput (머리) → "머리"를 자르는 형벌 → 극형        |

## 아키텍처

```
Frontend (Next.js:3000) → API (Go:4000) → LLM Proxy (Go:8081) → Gemini/Ollama
                              ↓
                           Redis ← 1차 캐시
                              ↓
                         PostgreSQL ← 2차 캐시 + 사용자 데이터
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

## Kubernetes 배포 (선택)

### 시크릿 설정

```bash
cd k8s

# example에서 secrets.yaml 생성
cp base/secrets.yaml.example base/secrets.yaml

# 실제 값으로 수정
# - CHANGE_ME_POSTGRES_PASSWORD → 안전한 비밀번호
# - CHANGE_ME_GEMINI_API_KEY → Gemini API 키
vi base/secrets.yaml
```

### 배포

```bash
cd k8s
./deploy.sh
```

## 프로젝트 구조

```
etymograph/
├── frontend/          # Next.js 15 (TypeScript, Tailwind CSS)
├── api-go/            # Go 1.23 (Gin, GORM)
├── llm-proxy/         # Go 1.22 (Gemini/Ollama 연동)
├── rate-limiter/      # Go 1.22 (Token Bucket)
├── k8s/               # Kubernetes manifests
├── docker-compose.yml
└── README.md
```

## API Endpoints

### 형태소 API

| Method | Endpoint       | Description                             |
| ------ | -------------- | --------------------------------------- |
| GET    | /api/morphemes | 접두사/접미사 목록 (프론트엔드 캐싱용)  |

### 단어 API

| Method | Endpoint                                  | Description                             |
| ------ | ----------------------------------------- | --------------------------------------- |
| POST   | /api/words/search                         | 단어 검색 + 어원 분석                   |
| GET    | /api/words/:word/etymology                | 어원 상세                               |
| GET    | /api/words/:word/derivatives              | 파생어 목록                             |
| GET    | /api/words/:word/synonyms                 | 유사어 + 차이점                         |
| POST   | /api/words/:word/refresh                  | 어원 새로고침 (새 버전 생성, 최대 3개)  |
| GET    | /api/words/:word/revisions                | 해당 단어의 모든 버전 목록              |
| GET    | /api/words/:word/revisions/:revNum        | 특정 버전 조회                          |
| POST   | /api/words/:word/revisions/:revNum/select | 유저가 해당 버전 선택 (로그인 필요)     |

### 세션 API

| Method | Endpoint                 | Description                   |
| ------ | ------------------------ | ----------------------------- |
| POST   | /api/sessions            | 세션 생성                     |
| GET    | /api/sessions/:id        | 세션 조회                     |
| POST   | /api/sessions/:id/words  | 세션에 단어 추가              |
| GET    | /api/export/:sessionId   | Export (format=json\|csv\|md) |

### 어원 일괄 생성 API

| Method | Endpoint                       | Description                      |
| ------ | ------------------------------ | -------------------------------- |
| GET    | /api/words/unfilled            | revision이 없는 단어 목록        |
| POST   | /api/words/fill-etymology      | 어원 일괄 생성 Job 시작          |
| GET    | /api/words/fill-status/:jobId  | Job 진행 상황 조회               |
| POST   | /api/words/fill-etymology/stop | 진행 중인 Job 중단               |

### 인증 API (OAuth 2.0 + JWT)

| Method | Endpoint              | Description                     | 인증 |
| ------ | --------------------- | ------------------------------- | ---- |
| GET    | /auth/google          | Google OAuth URL 반환           | X    |
| GET    | /auth/google/callback | OAuth 콜백 처리                 | X    |
| POST   | /auth/refresh         | Access Token 갱신               | X    |
| POST   | /auth/logout          | 로그아웃 (Refresh Token 무효화) | O    |
| GET    | /auth/me              | 현재 사용자 정보                | O    |

### 검색 히스토리 API

| Method | Endpoint                     | Description                        | 인증 |
| ------ | ---------------------------- | ---------------------------------- | ---- |
| GET    | /api/history?page=1&limit=20 | 검색 히스토리 조회 (페이지네이션)  | O    |
| GET    | /api/history/dates           | 날짜별 히스토리 요약 목록          | O    |
| GET    | /api/history/dates/:date     | 특정 날짜 검색어 목록 (YYYY-MM-DD) | O    |
| DELETE | /api/history/:id             | 특정 히스토리 삭제                 | O    |
| DELETE | /api/history                 | 전체 히스토리 삭제                 | O    |

## 환경 변수

### Backend (API)

```bash
# Database
DATABASE_URL=postgres://etymograph:etymograph@postgres:5432/etymograph?sslmode=disable

# Redis
REDIS_URL=redis://redis:6379

# LLM
LLM_PROXY_URL=http://llm-proxy:8081

# JWT & OAuth (Google)
JWT_SECRET=your-256-bit-secret-change-in-production
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URL=http://localhost:4000/auth/google/callback
FRONTEND_URL=http://localhost:3000
```

### Frontend

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
3. 승인된 리디렉션 URI 추가:
   - 개발: `http://localhost:4000/auth/google/callback`
   - 운영: `https://your-domain.com/auth/google/callback`
4. 발급된 Client ID와 Secret을 환경 변수에 설정

## 기술 스택

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | Next.js 15, React 19, TailwindCSS, react-force-graph-2d          |
| API          | Go 1.23, Gin, GORM                                               |
| LLM Proxy    | Go 1.22, Gin                                                     |
| Rate Limiter | Go 1.22, Token Bucket                                            |
| Database     | PostgreSQL 16, Redis 7                                           |
| LLM          | Gemini API (2.5 Flash-Lite, 3 Flash Preview) / Ollama (Qwen3:8b) |
| Auth         | Google OAuth 2.0, JWT                                            |
| Infra        | Docker Compose, k3s (optional)                                   |

## 단어 데이터

### 수록 단어 (37,587개)

| 소스               | 단어 수   | 설명                            |
| ------------------ | --------- | ------------------------------- |
| **FrequencyWords** | ~36,300개 | 영화/TV 자막 기반 빈도순 영단어 |
| **TOEIC**          | ~1,200개  | 토익 필수 어휘                  |
| **TOEFL**          | 5,033개   | 토플 필수 어휘                  |
| **IELTS**          | 3,564개   | 아이엘츠 필수 어휘              |
| **GRE**            | 674개     | GRE 필수 어휘                   |

### 한국인 대상 영어 시험 단어

한국인이 많이 응시하는 영어 시험의 필수 어휘를 포함:

- **TOEIC**: 비즈니스 영어 능력 평가
- **TOEFL**: 북미 대학/대학원 입학용
- **IELTS**: 영국/호주/캐나다 유학 및 이민용
- **GRE**: 북미 대학원 입학용

### LLM 모델 및 품질 검증

어원 데이터 생성에 사용된 LLM 모델:

| 모델                   | 용도                | 처리량   |
| ---------------------- | ------------------- | -------- |
| gemini-2.5-flash-lite  | 대량 생성           | 36,618개 |
| gemini-3-flash-preview | 문제 단어 재처리    | 61개     |
| Claude 4.5 Opus        | 품질 검증 도구 개발 | -        |

품질 검증 프로세스:

1. 병렬 전수조사 (20 workers, 15초)
2. 문제 단어 식별 및 재처리 (3회 반복)
3. 고유명사/비표준어 제거 (595개)
4. 최종 품질 문제: **0개**

## 단어 시드 및 어원 일괄 생성

```bash
# 1. 단어 시드 (최초 1회)
docker compose exec api ./seed

# 2. 어원 일괄 생성 시작
curl -X POST "http://localhost:4000/api/words/fill-etymology" \
  -H "Content-Type: application/json" \
  -d '{"language":"Korean","batchSize":100,"delayMs":2000}'

# 3. 진행 상황 확인
curl "http://localhost:4000/api/words/fill-status/<jobId>"

# 4. 필요시 중단
curl -X POST "http://localhost:4000/api/words/fill-etymology/stop"
```
