# 링크 겹침 문제 해결 시도 기록

## 문제 상황

그래프에서 여러 단어가 같은 노드(예: `inter-`)에 연결될 때 링크들이 서로 겹치는 현상 발생.

```
현재 상태:
    A   B   C
     \  |  /
      \ | /
       \|/
      [inter-]  ← 모든 링크가 한 점에 수렴하여 겹침
```

### 영향받는 파일

- `frontend/components/EtymologyGraph.tsx`

---

## 시도 1: findBestAngleForNewLink 함수 추가 (노드 위치 조정)

### 날짜

2026-01-20

### 접근 방식

새 노드가 기존 공유 노드(예: `inter-`)에 연결될 때, 기존 링크들의 각도를 분석하여 겹치지 않는 각도에 새 노드를 배치.

### 구현 내용

```typescript
// 기존 노드에 연결될 때 최적의 각도 찾기
const findBestAngleForNewLink = (
  targetNode: GraphNode, // 연결 대상 노드 (예: inter-)
  sourceX: number, // 새 노드의 예상 X
  sourceY: number, // 새 노드의 예상 Y
  existingLinks: GraphLink[], // 모든 링크
  existingNodes: GraphNode[], // 모든 노드
  minAngleDiff: number = Math.PI / 6, // 최소 각도 차이 (30도)
): { x: number; y: number } => {
  // 1. targetNode로 향하는 모든 링크의 각도 수집
  // 2. 현재 예상 각도가 겹치는지 확인
  // 3. 겹치면 가장 가까운 빈 각도 찾기
  // 4. 새 위치 반환
};
```

### 적용 위치

1. **Root 연결** (line ~617): word → existing root 연결 시 word 노드 위치 조정
2. **Component 연결 (with root)** (line ~707): root → existing component 연결 시 root + word 노드 위치 조정
3. **Component 연결 (no root)** (line ~770): word → existing component 연결 시 word 노드 위치 조정

### 발견된 버그들

#### 버그 1: 잘못된 배열에서 노드 검색

```typescript
// Before (버그)
const wordNodeToUpdate = newNodes.find((n) => n.id === wordNodeId);

// After (수정)
const wordNodeToUpdate =
  newNodes.find((n) => n.id === wordNodeId) ||
  nodesRef.current.find((n) => n.id === wordNodeId);
```

- **원인**: 기존 예시 단어 클릭 시 해당 노드는 `newNodes`가 아닌 `nodesRef.current`에 존재
- **수정**: 두 배열 모두 검색하도록 변경

#### 버그 2: findExistingNode가 타입 불일치로 노드를 못 찾음

```typescript
// Before (버그)
const findExistingNode = (
  label: string,
  type: "component" | "root",
  currentNodes: GraphNode[],
) => {
  return currentNodes.find(
    (n) => normalizeLabel(n.label) === normalized && n.type === type,
  );
};

// After (수정)
const findExistingNode = (
  label: string,
  type: "component" | "root",
  currentNodes: GraphNode[],
) => {
  const typesToSearch = type === "component" ? ["component", "word"] : [type];
  return currentNodes.find(
    (n) =>
      normalizeLabel(n.label) === normalized && typesToSearch.includes(n.type),
  );
};
```

- **원인**: 접두사/접미사를 클릭하면 해당 노드의 type이 'component'에서 'word'로 변경됨
- **수정**: component 검색 시 'word' 타입도 함께 검색

### 결과

- 함수는 호출되고 각도 계산도 수행됨 (콘솔 로그 확인)
- 하지만 **시각적 겹침 문제는 해결되지 않음**
- **근본적 한계**: 노드 위치를 조정해도 모든 링크가 타겟 노드의 중심점으로 수렴하기 때문에 겹침은 여전히 발생

---

## 시도 2: linkCanvasObject로 링크 분산 렌더링

### 날짜

2026-01-20

### 접근 방식

링크를 커스텀 렌더링하여, 같은 타겟 노드에 연결된 링크들의 끝점을 노드 원주 위 여러 지점에 분산 배치.

```
목표 상태:
    A   B   C
     \  |  /
      \ | /
       \|/
      [inter-]  ← 링크 끝점이 원주 위에 분산
        ↑
    링크들이 노드 원주의 서로 다른 지점에 연결
```

### 구현 내용

```typescript
const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
  // 1. 타겟 노드에 연결된 모든 링크 찾기
  const linksToTarget = links.filter(l => targetId === target.id);

  // 2. 현재 링크의 인덱스 찾기
  const linkIndex = linksToTarget.findIndex(...);

  // 3. 기본 각도 (소스에서 타겟 방향)
  const baseAngle = Math.atan2(sourceY - targetY, sourceX - targetX);

  // 4. 링크 개수에 따라 오프셋 각도 계산
  const spreadAngle = Math.min(maxSpread, (totalLinksToTarget - 1) * spreadPerLink);
  const targetOffsetAngle = startAngle + (linkIndex / (totalLinksToTarget - 1)) * spreadAngle;

  // 5. 타겟 노드 원주 위의 연결점 계산
  const targetEndX = targetX + (targetSize + 2) * Math.cos(baseAngle + targetOffsetAngle);
  const targetEndY = targetY + (targetSize + 2) * Math.sin(baseAngle + targetOffsetAngle);

  // 6. 링크 그리기
  ctx.beginPath();
  ctx.moveTo(sourceEndX, sourceEndY);
  ctx.lineTo(targetEndX, targetEndY);
  ctx.stroke();
}, [nodes, links]);
```

### ForceGraph2D 설정 변경

```typescript
// Before
linkColor={() => '#475569'}
linkWidth={2}
linkDirectionalParticles={2}
linkDirectionalParticleWidth={2}
linkDirectionalParticleSpeed={0.005}
linkDirectionalParticleColor={() => '#818cf8'}

// After
linkCanvasObject={linkCanvasObject}
linkCanvasObjectMode={() => 'replace'}
```

### 결과

- **작동하지 않음**
- 링크가 렌더링되긴 하지만 분산 효과가 시각적으로 확인되지 않음
- 애니메이션 파티클 효과도 제거됨 (linkDirectionalParticles 비활성화)
- **원복 결정**: 사용자 요청에 따라 원래 코드로 복원

---

## 현재 상태

- **시도 1 코드**: 일부 유지 (findBestAngleForNewLink 함수, 노드 검색 버그 수정)
- **시도 2 코드**: 완전 원복
- **링크 겹침 문제**: 미해결
