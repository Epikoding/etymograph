# TODO: 프론트엔드 잘못된 접사 필터링

## 배경

- LLM 프롬프트 개선 완료 (`llm-proxy/internal/llm/prompts.go:28-34`)
- 하지만 여전히 일부 단어에서 잘못된 접사 생성됨
  - 예: `interview` → `inter-` + `vid-` + `-ew` (❌ `-ew`는 가짜 접미사)
  - 예: `renew` → `re-` + `nov-` + `-ate` (❌ 올바른 분석: `re-` + `new`)

## 해결 방안

프론트엔드에서 유효한 접사만 표시하도록 필터링 로직 추가

### 수정 대상 파일

- `frontend/components/EtymologyCard.tsx` (줄 41, 48)
- `frontend/components/EtymologyGraph.tsx` (줄 531, 631, 695, 1572, 1574)

### 구현 계획

1. **접사 검증 유틸리티 생성**: `frontend/lib/affix-validator.ts`
   - Morpheme Dataset에서 유효한 접두사/접미사 목록 추출
   - `isValidAffix(part: string): boolean` 함수 구현
   - `filterValidComponents(components)` 헬퍼 함수 구현

2. **Morpheme Dataset 활용**
   - GitHub: https://github.com/colingoldberg/morphemes
   - JSON: https://raw.githubusercontent.com/colingoldberg/morphemes/master/data/morphemes.json
   - 접두사: 3,034개, 접미사: 850개
   - 데이터 구조:
     ```json
     {
       "-able": {
         "forms": [{ "root": "-able", "loc": "suffix" }],
         "meaning": ["able to", "capable of being"],
         "examples": ["capable", "agreeable"]
       }
     }
     ```

3. **접두사/접미사 추출 스크립트**

   ```bash
   # 접미사 목록 추출
   curl -s "https://raw.githubusercontent.com/colingoldberg/morphemes/master/data/morphemes.json" | \
     jq '[to_entries[] | .value.forms[] | select(.loc == "suffix") | .root] | unique'

   # 접두사 목록 추출
   curl -s "https://raw.githubusercontent.com/colingoldberg/morphemes/master/data/morphemes.json" | \
     jq '[to_entries[] | .value.forms[] | select(.loc == "prefix") | .root] | unique'
   ```

4. **기존 필터링 로직 수정**
   현재: `components.filter(c => c.part !== '-')`
   변경: `filterValidComponents(components)`

## 검증 테스트

- `interview` 검색 → `-ew` 접미사가 표시되지 않아야 함
- `review` 검색 → `re-` + `view`만 표시되어야 함
- `preview` 검색 → `pre-` + `view`만 표시되어야 함

# DB 칼럼 추가

word verified

---

# TODO: 링크 파티클 애니메이션 멈춤 현상

## 문제

- 단어 클릭, 버전 변경, 파생어/어근 클릭 시 링크의 파티클(움직이는 점)이 멈춤
- 첫 번째 상호작용에서만 멈추고 그 후에는 괜찮은 경우도 있음

## 시도한 해결책 (모두 실패)

### 1. cooldownTicks/cooldownTime을 Infinity로 설정
```tsx
cooldownTicks={Infinity}
cooldownTime={Infinity}
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
