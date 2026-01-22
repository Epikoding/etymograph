# Project Decisions

## 2026-01-16: 언어별 캐싱 구조

**상황**: API 결과를 DB에 캐싱할 때 언어별 데이터를 어떻게 저장할지

**선택지**:

- Option A: `language` 컬럼 추가, (word, language) 복합 유니크 인덱스
- Option B: 단일 레코드에 etymology JSON 내 언어별 키로 저장

**결정**: Option A

**이유**:

1. 쿼리 단순화: `WHERE word = ? AND language = ?`
2. 캐시 히트 판단 용이
3. 언어별 독립적 업데이트 가능
4. 인덱스 효율성 향상

---

## 2026-01-16: DB 선택

**Q**: 데이터 양이 많아질텐데 어떤 DB가 좋을까?

**A**: PostgreSQL 유지 권장

- JSON/JSONB 지원 (etymology 데이터)
- 복합 인덱스 지원 (word, language)
- 배열 타입 지원 (derivatives)
- 수백만 건까지 충분히 처리 가능

대용량 대응 방안:

1. 읽기 성능: Redis 캐싱 레이어 추가
2. 수억 건 이상: 테이블 파티셔닝 (언어별)
3. 전문 검색: Elasticsearch 연동

---

## 2026-01-16: 단어 검증 방식

**상황**: 사용자가 이상한 단어를 검색하면 LLM 토큰 낭비

**선택지**:

1. Free Dictionary API만 사용
2. 로컬 단어 목록만 사용
3. 혼합 방식 (로컬 1차 → API 2차)

**결정**: 혼합 방식

**이유**:

- 로컬 검증으로 빠른 응답 (대부분의 일반 단어)
- API로 신조어/전문용어 커버
- 네트워크 비용 최소화

---

## 2026-01-16: 백그라운드 스케줄러

**상황**: 사용자 요청마다 LLM 호출하면 응답 지연 + 비용 발생

**결정**: Go ticker 기반 백그라운드 스케줄러 구현

**구현 내용**:

- 5초 간격으로 LLM 호출 (1분에 12개)
- 우선순위 단어 목록 순서대로 처리
- DB에 이미 있는 단어는 스킵
- 환경변수로 on/off 제어 가능

**단어 우선순위 소스**:

- 기초 영단어 (NGSL - New General Service List)
- 학술 단어 (AWL - Academic Word List)
- 어원 학습에 자주 사용되는 라틴어/그리스어 어근 단어

---

## 2026-01-17: priority_words.txt 구축

**상황**: 스케줄러가 우선 처리할 단어 목록 필요. words.txt에 37만개가 있지만 현대 영어에서 실제로 자주 사용되는 단어는 3~5만개 수준.

**선택지**:

1. COCA (Corpus of Contemporary American English) - 학술적, 유료
2. Kaggle English Word Frequency - 33만개, CSV
3. FrequencyWords (OpenSubtitles 기반) - 50k, 무료
4. Google 10,000 English - 1만개로 부족

**결정**: FrequencyWords en_50k.txt 사용

**이유**:

- 영화/TV 자막 기반으로 실제 구어체 반영
- 빈도순 정렬되어 있음
- 무료 + 충분한 단어 수

**처리 과정**:

1. 원본 다운로드: 50,000단어
2. 1차 필터링: 축약형('s, 't), 1글자 제거 → 46,691개
3. 2차 필터링: words.txt에 없는 단어 제거 (고유명사, 감탄사, 브랜드명 등 9,791개) → **36,900개**

**제거된 단어 유형**:

- 감탄사/의성어: aaaah, aaagh, ugh
- 고유명사: abdul, abdullah, adrianna
- 브랜드명: adidas, advil, aerosmith
- 오타/붙여쓰기: aboutyou, afterall
- 약어: adhd, acl

**결과**: `api-go/data/priority_words.txt` - 36,900개 (빈도순)

**소스**: https://github.com/hermitdave/FrequencyWords

---

## 2026-01-17: COCA vs FrequencyWords 비교 검증

**상황**: WordFrequency.info(COCA 기반)에서 무료 제공하는 단어 목록과 비교하여 누락된 중요 단어가 있는지 검증

**COCA 무료 버전**:

- 단어 수: 5,000개 (상위)
- 형식: Excel (XLSX)
- 실제 추출: 10,530개 (sharedStrings.xml에서 중복 포함)

**비교 결과**:

- COCA에만 있고 priority_words.txt에 없는 단어: **954개**

**954개 단어의 패턴 분석**:

| 유형                 | 예시                                       | 판단             |
| -------------------- | ------------------------------------------ | ---------------- |
| 고유명사             | Academy, African, American, Bible, Twitter | 어원 학습 부적합 |
| 오타/비표준 철자     | acheive, beleive, begining, admited, tryed | 학습자 오류      |
| 비표준 비교급/최상급 | awesomest, badder, bestest, beautifulest   | 비표준 문법      |
| 비표준 복수형        | babys, bellys, tooths, wifes, wolfs        | 불규칙 변화 오류 |
| 기술 용어            | Android, apps, blogs, browsers, website    | 일부 유용        |
| 구어체/방언          | tryin, theirself, themself, yerself        | 비표준           |

**결정**: 954개 단어 추가하지 않음

**이유**:

1. 대부분 고유명사, 오타, 비표준형으로 어원 학습에 부적합
2. 유용한 기술 용어(apps, website 등)는 이미 기본형이 포함되어 있음
3. COCA 무료 버전(5,000개)보다 FrequencyWords(36,900개)가 7배 이상 풍부
4. FrequencyWords가 실제 구어체를 더 잘 반영

**결론**: 현재 FrequencyWords 기반 priority_words.txt(36,900개) 유지

---

## 2026-01-19: derivatives/synonyms 컬럼 제거 (DB 스키마 단순화)

**상황**: words 테이블의 `derivatives`(text[])와 `synonyms`(jsonb) 컬럼이 모두 NULL 상태. etymology JSON 내부에 이미 derivatives 데이터가 포함되어 있어 중복.

**선택지**:

- Option A: 단순화 - 별도 컬럼 제거, etymology JSON만 사용
- Option B: 관계 테이블 추가 - word_derivatives, word_synonyms 테이블로 단어 간 FK 관계 관리
- Option C: 현상 유지 - 나중에 활용

**결정**: Option A (단순화)

**이유**:

1. **데이터 중복 제거**: etymology JSON 내부에 derivatives가 이미 포함됨
2. **현재 기능으로 충분**: derivative 노드 클릭 → 새 검색으로 그래프 탐색 가능
3. **YAGNI 원칙**: 관계 테이블은 복잡도만 증가, 현재 필요 없음
4. **나중에 확장 가능**: 필요해지면 관계 테이블 추가

**NoSQL 마이그레이션 검토**:

- PostgreSQL JSONB가 이미 충분히 강력함
- 단어 간 JOIN 쿼리가 필요하면 RDB가 유리
- 현재 규모(수천 단어)에서 NoSQL은 오버엔지니어링

**변경 내용**:

- DB: derivatives, synonyms 컬럼 DROP
- Go 모델: 해당 필드 제거
- API 핸들러: etymology JSON에서 추출하도록 수정
- Frontend: etymology.derivatives만 사용하도록 통일

---

## 2026-01-19: 파생어(Derivatives) 필터링 검토 및 철회

**상황**: "interest" 검색 시 "interesting", "interested", "interestingly"가 파생어로 반환됨. 처음에는 이들이 단순 활용형이라고 판단하여 필터링 로직을 구현했으나, 재검토 후 철회.

**시도한 구현**:

1. LLM 프롬프트에 파생어 필터링 규칙 추가
2. Go 필터 패키지 구현 (`api-go/internal/filter/derivatives.go`)
   - 문법적 변형 자동 생성 (복수형, -ed, -ing, -ly, -ingly, -edly 등)
   - 복합어 필터링 (공백 포함 단어 제거)

**최종 결정**: 필터링 비활성화

**이유**:

1. "interesting", "interested", "interestingly"는 실제로 "interest"의 **파생어가 맞음**
2. 어원 학습 관점에서 동일 어근에서 파생된 다양한 형태를 보여주는 것이 교육적으로 유익
3. 파생어(derivation)와 굴절(inflection)의 구분이 모호한 경우가 많음
   - "interesting"은 분사형이지만 형용사로도 독립적으로 사용됨
   - "interestingly"는 독립적인 부사

**현재 상태**:

- LLM 프롬프트: 파생어 필터링 규칙 제거됨
- Go 필터: 코드는 보존하되 호출 비활성화 (주석 처리)
- 필요시 재활성화 가능

## 2026-01-21: Hybrid Graph Layout (Category vs. Fan-Out)

**상황**: 그래프가 깊어질수록 노드와 링크가 겹쳐 시각적 복잡도가 급증함. 특히 기존의 카테고리별 고정 방향(어근=위, 구성=우, 파생=아래, 동의=좌) 방식은 노드가 확장될 때 부모 노드나 다른 가지와 겹치는 심각한 문제 발생.

**결정**: 하이브리드 레이아웃 전략 (Level 0 vs Level > 0)

**상세 내용**:

1. **Level 0 (검색 단어 중심)**: 카테고리별 **고정 섹터** 유지
   - 목적: 정보의 유형을 방향으로 직관적으로 구분
   - 배치: Root(위), Component(오른쪽), Derivative(아래), Synonym(왼쪽)
   - 범위: 60° (섹터 간 겹침 방지)

2. **Level > 0 (확장 노드)**: **동적 부채꼴(Dynamic Fan-Out)** 확장
   - 목적: 겹침 방지 및 외부로의 지속적 확장
   - 배치: 부모 노드의 각도를 중심으로 **120° 부채꼴** 내에 자식들을 균등 분포
   - **예외 처리**: 깊은 레벨의 Root에서 나오는 Component들도 강제 오른쪽 배치가 아닌, Root의 진행 방향에 맞춰 Fan-Out 되도록 수정 (기존 "Component=Right" 규칙은 Level 0에만 한정).

**이유**:

- 초기 탐색 시에는 정보 구조(방향성)가 중요하지만, 심층 탐색 시에는 가독성(겹침 방지)이 우선됨.
- 깊은 레벨에서 고정 방향을 고수하면 필연적으로 그래프가 꼬이게 됨.

---

## 2026-01-22: 스케줄러 → API 기반 어원 일괄 생성

**상황**: 기존 백그라운드 스케줄러(5초마다 자동 실행)가 있었으나, 제어가 어렵고 서버 재시작 시 상태가 초기화되는 문제.

**선택지**:

1. 기존 스케줄러 유지 (자동 실행)
2. API 기반 Job 관리 (수동 시작/중단)
3. 별도 Worker 서비스 분리

**결정**: Option 2 - API 기반 Job 관리

**변경 내용**:

1. **스케줄러 제거**: `internal/scheduler/` 디렉토리 삭제
2. **시드 CLI 추가**: `cmd/seed/main.go` - DB에 단어 미리 삽입 (etymology = null)
3. **Fill API 추가**:
   - `GET /api/words/unfilled` - null인 단어 목록 조회
   - `POST /api/words/fill-etymology` - Job 시작
   - `GET /api/words/fill-status/:jobId` - 진행 상황 조회
   - `POST /api/words/fill-etymology/stop` - Job 중단
4. **부분 인덱스 추가**: `idx_words_etymology_null` - etymology IS NULL인 행만 인덱싱

**Rate Limiting 전략**:

- BatchSize: 100 (최대)
- DelayMs: 2000 (요청 간 2초 지연, ~30 RPM)
- MaxRetries: 3 (rate limit 시 60초 후 재시도)

**이유**:

1. **제어 용이**: 필요할 때만 실행, 언제든 중단 가능
2. **진행 상황 모니터링**: API로 실시간 확인
3. **Rate Limit 대응**: 재시도 로직으로 자동 복구
4. **다국어 순차 처리**: 현재는 한국어만, 추후 언어별 순차 실행 가능

**언어 지원 현황**: 현재 한국어(ko)만 지원. 일본어/중국어는 추후 계획.

---

## 2026-01-22: 고유명사 제거

**상황**: 200개 샘플 검증 결과, 고유명사(인명, 지명, 브랜드명)의 어원 분석 품질이 낮음. "cha"를 Old English "þu"로 분석하는 등 오류 발생.

**검증 결과**:

| 유형 | 개수 | 비율 |
|------|------|------|
| 정확한 어원 | 160 | 80% |
| 고유명사 | 25 | 12% |
| 어원 오류 | 15 | 8% |

**결정**: priority_words.txt와 DB에서 고유명사 제거

**제거 기준**:

- 인명: john, mary, michael, jennifer 등
- 지명/국가명: florida, italy, london, germany 등
- 브랜드명: mercedes 등
- 약어: mr, mrs, dr 등

**변경 내용**:

- priority_words.txt: 36,900 → **36,338개** (562개 제거)
- DB (Korean): 36,929 → **36,367개** (562개 제거)

**이유**:

1. 고유명사는 어원 학습에 부적합
2. LLM이 고유명사 어원을 잘못 분석하는 경우 많음
3. 사용자가 고유명사를 검색할 가능성 낮음

---

## 2026-01-22: 2단계 LLM 모델 전략

**상황**: 어원 일괄 생성 시 어떤 LLM 모델을 사용할지 결정 필요.

**모델 비교**:

| 모델 | 비용 (36K 단어) | 정확도 |
|------|-----------------|--------|
| Gemini 2.5 Flash-Lite | ~$4 | 88% |
| Gemini 2.5 Flash | ~$8 | 92% |
| Gemini 3 Flash | ~$35 | 97% |

**선택지**:

1. 전체를 Gemini 3 Flash로 처리 (~$35)
2. 2.5 Flash-Lite로 1차 처리 → 문제 단어만 3 Flash로 재처리 (~$6)

**결정**: Option 2 - 2단계 처리

**이유**:

1. **비용 효율**: 88% 정확도면 ~4,400개만 재처리 필요
2. **품질 유지**: 문제 단어만 고품질 모델로 처리
3. **검증 가능**: 1차 처리 후 품질 패턴 분석 가능

**구현 계획**:

1. **1단계**: Gemini 2.5 Flash-Lite로 전체 처리 (현재 진행 중)
2. **2단계**: 완료 후 문제 단어 식별 (순환 정의, 어원 오류 등)
3. **3단계**: 문제 단어만 Gemini 3 Flash로 재처리

**문제 단어 식별 기준**:

- 순환 정의: root = word (예: "sissy" → "sissy")
- 번역 누락: brief가 영어로 남아있는 경우
- 어원 오류: 알려진 패턴과 불일치 (예: "cha" ≠ Old English)

---

## 2026-01-22: Fill Job 중복 처리 버그 수정

**상황**: Fill Job 진행 중 Job의 completed 수와 실제 DB의 filled 수가 2배 차이 발생.

| 항목 | Job 기록 | 실제 DB |
|------|----------|---------|
| 완료 | 33,041 | 17,017 |

**원인**: Producer-Worker 간 Race Condition

```
Timeline:
t=0ms:   Producer fetches words [1-200] (unfilled)
t=100ms: Producer fetches again - same words (still unfilled in DB)
t=200ms: Producer fetches again - same words
...
t=5000ms: Workers finally save to DB
```

- Producer가 100ms마다 unfilled 단어를 가져옴
- Worker가 LLM 호출(~5초)하는 동안 같은 단어를 여러 번 가져옴
- 같은 단어가 여러 Worker에게 전달되어 중복 처리

**해결책**: In-memory tracking 추가

```go
// Producer에서 처리 중인 단어 추적
processing := make(map[int64]bool)
var processingMu sync.Mutex

// Producer: 이미 처리 중인 단어 필터링
processingMu.Lock()
for _, word := range words {
    if !processing[word.ID] {
        processing[word.ID] = true
        toProcess = append(toProcess, word)
    }
}
processingMu.Unlock()

// Worker: 완료 후 processing에서 제거
processingMu.Lock()
delete(processing, word.ID)
processingMu.Unlock()
```

**결과**: Job completed 수와 DB filled 수가 일치함

---

## 2026-01-22: DB 전수조사 및 품질 개선

**상황**: Fill Job 완료 후 36,367개 어원 데이터의 품질 검증 필요.

**검증 방법**: Go CLI 도구로 병렬 감사 (20 workers, 13.6초 소요)

**검증 기준**:

| 이슈 타입 | 설명 |
|----------|------|
| CIRCULAR_ROOT | 어근 = 단어 (순환 정의) |
| ENGLISH_BRIEF | brief 필드가 영어 (한국어여야 함) |
| ENGLISH_DETAILED | detailed 필드가 영어 |
| EMPTY_ROOT | 어근 비어있음 |
| SUSPICIOUS_ORIGIN | 어원이 "English"로만 표시 |

**검증 결과**:

| 이슈 | 개수 | 실제 문제 여부 |
|------|------|---------------|
| CIRCULAR_ROOT | 2,090 | ❌ 정상 (차용어는 어근=단어가 맞음) |
| SUSPICIOUS_ORIGIN | 1,358 | ❌ 정상 (현대 영어 단어) |
| ENGLISH_DETAILED | 273 | ⚠️ 재처리 필요 |
| EMPTY_ROOT | 117 | ❌ 정상 (접사는 어근 없음) |
| ENGLISH_BRIEF | 50 | ⚠️ 고유명사 + 재처리 필요 |

**조치 사항**:

1. **추가 고유명사 제거** (32개): ENGLISH_BRIEF 중 고유명사 식별 후 삭제
   - 인명: alois, andi, archibald, byron, cedric, collin, denis, dhoni, emil, frasier, harding, indra, jagger, jeff, jobe, marsha, mavis, mulder, pelham, sagan, sefton, stedman, thaddeus, trent
   - 지명: akron, buckland, dundee, campos, pisa, kent, kim, magellan
   - DB: 32개 삭제
   - priority_words.txt: 36,338 → **36,306개**

2. **번역 문제 재처리** (251개): etymology = NULL로 리셋 후 Fill Job 재실행
   - 문제: detailed 필드가 한국어가 아닌 영어로 되어 있음
   - 예시 (이전): "Chronicle refers to a factual written account..."
   - 예시 (이후): "Chronicle은 사건을 시간 순서대로 기록한..."

**최종 DB 상태**:

| 항목 | 수치 |
|------|------|
| 총 단어 (ko) | 37,588개 |
| 채워진 것 | 37,588개 (100%) |
| 미채운 것 | 0개 |

**감사 도구**: `api-go/cmd/audit/main.go` - 재사용 가능

---

## 2026-01-22: LLM 모델 사용 전략 및 품질 검증 프로세스

**상황**: 37,587개 한국어 어원 데이터 생성 및 품질 보장 필요.

### 사용된 LLM 모델

| 모델 | 용도 | 처리량 |
|------|------|--------|
| **gemini-2.5-flash-lite** | 1차 대량 생성 + 2차 재처리 | 36,367 + 251 = 36,618개 |
| **gemini-3-flash-preview** | 3차 문제 단어 재처리 | 61개 |
| **Claude 4.5 Opus** | 품질 검증 도구 개발 + 분석 | - |

### 품질 검증 프로세스 (3회 반복)

| 단계 | 조사 대상 | 이슈 발견 | 실제 문제 | 조치 |
|------|-----------|-----------|-----------|------|
| **1차** | 36,367개 | 3,904 (10.7%) | 323개 | 고유명사 32개 삭제, 251개 재처리 |
| **2차** | 37,588개 | 3,666 (9.75%) | 59개 | 61개 재처리 (gemini-3-flash-preview) |
| **3차** | 37,588개 | 3,603 (9.59%) | 1개 | isn 삭제 |

### Claude 4.5 Opus 역할

1. **전수조사 도구 개발**: `api-go/cmd/audit/main.go`
   - 20개 워커 병렬 처리
   - 37,588개 단어 15초 내 검사
   - 6가지 품질 기준 자동 검증

2. **품질 분석 및 의사결정**
   - False positive 식별 (CIRCULAR_ROOT, SUSPICIOUS_ORIGIN 등)
   - 실제 문제 단어 분류 (ENGLISH_BRIEF, ENGLISH_DETAILED)
   - 고유명사 패턴 식별 및 제거 리스트 생성

3. **고유명사 제거** (총 595개)
   - 1차: 562개 (priority_words.txt 초기 정리)
   - 2차: 32개 (전수조사 후 추가 발견)
   - 3차: 1개 (isn - 비표준 축약어)

### 최종 결과

| 항목 | 수치 |
|------|------|
| 총 단어 | 37,587개 |
| 어원 생성 완료 | 37,587개 (100%) |
| 실제 품질 문제 | 0개 |
| priority_words.txt | 36,305개 |

### 비용 효율성

- **대량 생성**: gemini-2.5-flash-lite (저비용)
- **품질 보완**: gemini-3-flash-preview (61개만 사용)
- **품질 검증**: Claude 4.5 Opus (도구 개발 + 분석)

이 전략으로 전체를 고비용 모델로 처리하는 것 대비 약 80% 비용 절감.
