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

| 유형 | 예시 | 판단 |
|------|------|------|
| 고유명사 | Academy, African, American, Bible, Twitter | 어원 학습 부적합 |
| 오타/비표준 철자 | acheive, beleive, begining, admited, tryed | 학습자 오류 |
| 비표준 비교급/최상급 | awesomest, badder, bestest, beautifulest | 비표준 문법 |
| 비표준 복수형 | babys, bellys, tooths, wifes, wolfs | 불규칙 변화 오류 |
| 기술 용어 | Android, apps, blogs, browsers, website | 일부 유용 |
| 구어체/방언 | tryin, theirself, themself, yerself | 비표준 |

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
