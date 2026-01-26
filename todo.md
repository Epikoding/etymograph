# TODO: 링크 파티클 애니메이션 멈춤 현상

## 문제

- 단어 클릭, 버전 변경, 파생어/어근 클릭 시 링크의 파티클(움직이는 점)이 멈춤
- 첫 번째 상호작용에서만 멈추고 그 후에는 괜찮은 경우도 있음

## 시도한 해결책 (모두 실패)

### 1. cooldownTicks/cooldownTime을 Infinity로 설정

```tsx
cooldownTicks = { Infinity };
cooldownTime = { Infinity };
```

- 결과: ❌ 여전히 멈춤

### 2. d3AlphaDecay/d3AlphaMin 조정

```tsx
d3AlphaDecay={0.02}  // 기존 0.1에서 감소
d3AlphaMin={0.001}   // 추가
warmupTicks={0}      // 기존 20에서 감소
```

- 결과: ❌ 여전히 멈춤

### 3. 상태 업데이트 후 resumeAnimation() 호출

```tsx
requestAnimationFrame(() => {
  graphRef.current?.resumeAnimation?.();
});
```

- loadWord, handleSelectRevision, derivative 로딩 함수에 추가
- 결과: ❌ 여전히 멈춤

### 4. resumeAnimation() 대신 d3ReheatSimulation() 호출

```tsx
requestAnimationFrame(() => {
  graphRef.current?.d3ReheatSimulation?.();
});
```

- 결과: ❌ 여전히 멈춤

## 현재 상태

- `autoPauseRedraw={false}` 설정되어 있음
- `onEngineStop` 콜백에서 노드 위치 고정하는 로직 있음
- ForceGraph2D의 내부 동작과 React 상태 업데이트 간 충돌 가능성

## 추가 시도 가능한 방법

1. `onEngineStop` 콜백 제거
2. 파티클 애니메이션 제거 (linkDirectionalParticles 관련 설정 삭제)
3. ForceGraph2D 대신 다른 라이브러리 사용
4. Canvas 렌더링 방식 조사

## 결정

- 성능 저하 우려로 시도한 변경사항 모두 원복
- 현재 설정:
  ```tsx
  cooldownTicks={50}
  cooldownTime={800}
  d3AlphaDecay={0.1}
  warmupTicks={20}
  ```
- `d3ReheatSimulation()` 호출 제거
- 파티클 멈춤 현상은 미해결 상태로 유지

---

# TODO: 한국어 발음으로 영단어 검색 시 후보 제안 기능

## 요구사항

- 사용자가 한국어 발음으로 검색 (예: "월드")
- LLM이 가능한 영단어 후보를 제안 (예: "world", "word")
- 모달로 후보 목록 표시
- 후보 클릭 시 해당 단어 바로 검색

## 구현 방향

1. **프론트엔드**
   - 검색어가 한글인지 감지
   - 한글이면 LLM에 후보 요청
   - 후보 목록을 모달로 표시
   - 선택 시 해당 영단어로 검색

2. **백엔드 (LLM Proxy)**
   - 새 엔드포인트: `POST /api/suggest-words`
   - 입력: 한국어 발음
   - 출력: 영단어 후보 목록 (최대 5개)

3. **프롬프트 예시**
   ```
   사용자가 "월드"라고 검색했습니다.
   이 발음과 유사한 영어 단어 후보를 최대 5개 제안해주세요.
   JSON 형식: ["word1", "word2", ...]
   ```

## 고려사항

- 한글 감지: 정규식 `/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/`
- 캐싱: 자주 검색되는 한글 발음은 Redis에 캐싱
- UX: 모달 대신 자동완성 드롭다운도 고려 가능

---

# TODO: 유저 히스토리 내역은 redis에 가지고만 있다가 사용자가 없는 새벽시간에 bulk insert?

단어 중복은 없애고 db insert 할 때 검색한 단어 list를 가지고 있게
