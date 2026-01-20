'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { forceCollide, forceX, forceY } from 'd3-force';
import { X, RefreshCw } from 'lucide-react';
import { api, ApiError, type SupportedLanguage } from '@/lib/api';
import type { Etymology } from '@/types/word';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
});

interface GraphNode {
  id: string;
  label: string;
  type: 'word' | 'component' | 'derivative' | 'root' | 'synonym';
  meaning?: string;
  meaningKo?: string;
  language?: string;
  color?: string;
  size?: number;
  etymology?: Etymology; // Full etymology data for word nodes
  x?: number; // 초기 x 위치
  y?: number; // 초기 y 위치
  fx?: number; // 고정 x 위치
  fy?: number; // 고정 y 위치
  depth?: number; // 중심으로부터의 거리 (0=중심)
  angle?: number; // 부모로부터의 각도 (라디안) - 이 방향으로 계속 확장
  createdAt?: number; // 생성 시간 (애니메이션용)
  sourceX?: number; // 애니메이션 시작 x 위치 (부모 노드)
  sourceY?: number; // 애니메이션 시작 y 위치 (부모 노드)
}

interface GraphLink {
  source: string;
  target: string;
}

interface EtymologyGraphProps {
  initialWord?: string;
  language?: SupportedLanguage;
  onWordSelect?: (word: string) => void;
  onInitialLoad?: () => void;
}

const COLORS = {
  word: '#6366f1',
  component: '#f43f5e',  // rose-500 (red)
  derivative: '#06b6d4',
  root: '#f59e0b',
  synonym: '#a855f7',    // purple-500
  latin: '#e11d48',
  greek: '#0ea5e9',
  french: '#a855f7',
};

// Korean translations for common etymology meanings
const KOREAN_MEANINGS: Record<string, string> = {
  'before, in front of': '앞에, 전에',
  'woven, fabric (from textus)': '짜다, 직물',
  'love, affection': '사랑, 애정',
  'wisdom': '지혜',
  'hand': '손',
  'write': '쓰다',
  'far, distant': '먼, 멀리',
  'writing, letter': '글, 문자',
  'sound': '소리',
  'see, look': '보다',
  'hear': '듣다',
  'speak': '말하다',
  'carry, bear': '나르다, 운반하다',
  'make, do': '만들다, 하다',
  'lead': '이끌다',
  'throw': '던지다',
  'take, seize': '잡다, 취하다',
  'stand': '서다',
  'go, walk': '가다, 걷다',
  'come': '오다',
  'give': '주다',
  'put, place': '놓다, 두다',
  'break': '깨다, 부수다',
  'bind': '묶다',
  'cut': '자르다',
  'flow': '흐르다',
  'grow': '자라다',
  'life': '생명, 삶',
  'death': '죽음',
  'light': '빛',
  'earth, land': '땅, 대지',
  'water': '물',
  'fire': '불',
  'air, wind': '공기, 바람',
  'time': '시간',
  'place': '장소',
  'god': '신',
  'man, human': '인간, 사람',
  'woman': '여자',
  'child': '아이',
  'father': '아버지',
  'mother': '어머니',
  'king': '왕',
  'good': '좋은',
  'bad, evil': '나쁜',
  'great, large': '큰, 위대한',
  'small': '작은',
  'new': '새로운',
  'old': '오래된',
  'true': '진실한',
  'false': '거짓된',
};

function getKoreanMeaning(meaning: string): string {
  if (!meaning) return '';
  // Direct match
  if (KOREAN_MEANINGS[meaning.toLowerCase()]) {
    return KOREAN_MEANINGS[meaning.toLowerCase()];
  }
  // Partial match
  for (const [eng, ko] of Object.entries(KOREAN_MEANINGS)) {
    if (meaning.toLowerCase().includes(eng.toLowerCase())) {
      return ko;
    }
  }
  return '';
}

export default function EtymologyGraph({ initialWord, language = 'Korean', onWordSelect, onInitialLoad }: EtymologyGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-dismiss error message after 3 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [, setAnimationTick] = useState(0); // 애니메이션용 리렌더 트리거
  const [isComparing, setIsComparing] = useState(false);
  const [prevEtymology, setPrevEtymology] = useState<Etymology | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const loadedWordsRef = useRef<Set<string>>(new Set());
  const nodesRef = useRef<GraphNode[]>([]); // Track nodes in ref for reliable duplicate detection
  const linksRef = useRef<GraphLink[]>([]); // Track links in ref for reliable drag detection
  const isInitialLoadRef = useRef(false); // Track if it's the initial load
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Drag state for moving connected nodes together
  const dragStateRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    connectedNodes: Map<string, { startX: number; startY: number; node: any }>;
  } | null>(null);

  // 새 노드 애니메이션을 위한 리렌더 트리거
  useEffect(() => {
    const hasAnimatingNodes = nodes.some(n => n.createdAt && Date.now() - n.createdAt < 280);
    if (hasAnimatingNodes) {
      const timer = setInterval(() => {
        setAnimationTick(t => t + 1);
      }, 16); // ~60fps
      const cleanup = setTimeout(() => clearInterval(timer), 320);
      return () => {
        clearInterval(timer);
        clearTimeout(cleanup);
      };
    }
  }, [nodes]);

  // 로딩 중인 노드 애니메이션 (pulsing glow)
  useEffect(() => {
    if (loadingNodeIds.size > 0) {
      const timer = setInterval(() => {
        setAnimationTick(t => t + 1);
      }, 30); // ~33fps for smooth pulse
      return () => clearInterval(timer);
    }
  }, [loadingNodeIds.size]);

  // Configure d3 forces for layout
  useEffect(() => {
    if (graphRef.current) {
      // 반발력: fx가 있는 노드는 영향 안받음
      graphRef.current.d3Force('charge')?.strength((node: any) => node.fx !== undefined ? 0 : -60);

      // link force: 매우 약하게 (고정된 노드들을 움직이지 않도록)
      graphRef.current.d3Force('link')?.distance(48).strength(0.05);

      // 노드 겹침 방지: fx와 fy 모두 고정된 노드는 제외
      graphRef.current.d3Force('collision', forceCollide((node: any) => {
        if (node.fx !== undefined && node.fy !== undefined) return 0; // 완전히 고정된 노드만 제외
        return (node.size || 8) + 20;
      }));

      // x-force: fx가 없는 노드만
      graphRef.current.d3Force('x', forceX(0).strength((node: any) => node.fx !== undefined ? 0 : 0.08));

      // y-force: fy가 없는 노드만
      graphRef.current.d3Force('y', forceY(0).strength((node: any) => node.fy !== undefined ? 0 : 0.04));
    }
  }, [nodes]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Keep nodesRef in sync with nodes state
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Keep linksRef in sync with links state
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  // Load initial word (also reload when language changes)
  useEffect(() => {
    if (!initialWord) return;

    // Reset graph
    setNodes([]);
    setLinks([]);
    setErrorMessage(null);
    loadedWordsRef.current = new Set();
    nodesRef.current = [];
    linksRef.current = [];
    setHoveredNode(null);

    const timer = setTimeout(() => {
      isInitialLoadRef.current = true;
      loadWord(initialWord);
    }, 50);

    return () => clearTimeout(timer);
  }, [initialWord, language]);

  // Helper to find all connected descendant nodes (nodes reachable from the given node via links)
  const getConnectedDescendants = useCallback((nodeId: string, currentLinks: GraphLink[]): Set<string> => {
    const connected = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Find all nodes that this node links to (as source)
      currentLinks.forEach(link => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

        if (sourceId === current && !connected.has(targetId)) {
          connected.add(targetId);
          queue.push(targetId);
        }
      });
    }

    return connected;
  }, []);

  // Helper to normalize component labels for comparison (remove hyphens)
  const normalizeLabel = (label: string) => label.replace(/-/g, '').toLowerCase();

  // Helper to find existing node by label (any type)
  const findExistingNodeByLabel = (label: string, currentNodes: GraphNode[]) => {
    return currentNodes.find(n => n.label === label);
  };

  // Helper to find existing node by label and type (uses normalized comparison for components)
  const findExistingNode = (label: string, type: 'component' | 'root', currentNodes: GraphNode[]) => {
    const normalized = normalizeLabel(label);
    const found = currentNodes.find(n => normalizeLabel(n.label) === normalized && n.type === type);
    console.log('[findExistingNode]', { label, normalized, type, currentNodesCount: currentNodes.length, found: found?.label || null });
    return found;
  };

  // 상수: 노드 간 거리 (20% 증가)
  const RADIAL_DISTANCE = 144;

  // 방사형 위치 계산: 부모 각도 방향으로 계속 확장
  const getRadialPosition = (
    parentX: number,
    parentY: number,
    baseAngle: number, // 기본 각도 (첫 레벨: 섹터 중심, 이후: 부모 방향)
    parentDepth: number,
    index: number,
    total: number,
    isFirstLevel: boolean, // 첫 번째 레벨인지 (origin에서 직접 확장)
    sectorRange: number = Math.PI // 퍼지는 범위 (라디안)
  ): { x: number; y: number; depth: number; angle: number } => {
    const newDepth = parentDepth + 1;
    let angle: number;

    if (total === 1) {
      // 자식이 하나면 기본 각도 그대로
      angle = baseAngle;
    } else if (isFirstLevel) {
      // 첫 번째 레벨: sectorRange 범위 내에서 균등 분포
      const offsetRatio = (index / (total - 1)) - 0.5; // -0.5 to 0.5
      angle = baseAngle + offsetRatio * sectorRange;
    } else {
      // 이후 레벨: 부모 방향 유지하면서 퍼짐 (더 넓게)
      const spreadRange = Math.PI / 2; // 90도 범위로 퍼짐
      const offsetRatio = (index / (total - 1)) - 0.5;
      angle = baseAngle + offsetRatio * spreadRange;
    }

    const x = parentX + RADIAL_DISTANCE * Math.cos(angle);
    const y = parentY + RADIAL_DISTANCE * Math.sin(angle);

    return { x, y, depth: newDepth, angle };
  };

  // 충돌 회피: 가장 가까운 빈 공간 찾기
  const adjustForCollision = (
    targetX: number,
    targetY: number,
    targetAngle: number,
    existingNodes: GraphNode[],
    minDistance: number = 70
  ): { x: number; y: number } => {
    const isFarEnough = (x: number, y: number) => {
      return existingNodes.every(node => {
        const nx = node.fx ?? node.x ?? 0;
        const ny = node.fy ?? node.y ?? 0;
        const dist = Math.sqrt((x - nx) ** 2 + (y - ny) ** 2);
        return dist >= minDistance;
      });
    };

    if (isFarEnough(targetX, targetY)) {
      return { x: targetX, y: targetY };
    }

    // 같은 방향으로 조금씩 더 멀리 이동
    for (let extraDist = 40; extraDist < 300; extraDist += 40) {
      const x = targetX + extraDist * Math.cos(targetAngle);
      const y = targetY + extraDist * Math.sin(targetAngle);
      if (isFarEnough(x, y)) {
        return { x, y };
      }
    }

    // 방향에 수직으로 약간 이동
    for (let offset = 30; offset < 150; offset += 30) {
      const perpAngle = targetAngle + Math.PI / 2;
      if (isFarEnough(targetX + offset * Math.cos(perpAngle), targetY + offset * Math.sin(perpAngle))) {
        return { x: targetX + offset * Math.cos(perpAngle), y: targetY + offset * Math.sin(perpAngle) };
      }
      if (isFarEnough(targetX - offset * Math.cos(perpAngle), targetY - offset * Math.sin(perpAngle))) {
        return { x: targetX - offset * Math.cos(perpAngle), y: targetY - offset * Math.sin(perpAngle) };
      }
    }

    return { x: targetX, y: targetY };
  };

  // Helper to get language key from language name
  const getLangKey = (lang: SupportedLanguage): string => {
    switch (lang) {
      case 'Korean': return 'ko';
      case 'Japanese': return 'ja';
      case 'Chinese': return 'zh';
      default: return 'ko';
    }
  };

  // Helper to extract etymology data from nested language structure
  const extractEtymology = (etymologyData: any, lang: SupportedLanguage): Etymology | null => {
    if (!etymologyData) return null;
    const langKey = getLangKey(lang);
    // Check if data is nested under language key (e.g., etymology.ko)
    if (etymologyData[langKey]) {
      return etymologyData[langKey] as Etymology;
    }
    // Fallback to flat structure for backward compatibility
    if (etymologyData.definition || etymologyData.origin) {
      return etymologyData as Etymology;
    }
    return null;
  };

  const loadWord = async (word: string, parentNodeId?: string, clickedNodeId?: string) => {
    // Include language in the cache key to handle language changes
    const cacheKey = `${word}-${language}`;
    if (loadedWordsRef.current.has(cacheKey)) return;
    loadedWordsRef.current.add(cacheKey);

    // Track loading state for the clicked node
    if (clickedNodeId) {
      setLoadingNodeIds(prev => new Set(prev).add(clickedNodeId));
    }

    setLoading(true);
    try {
      const wordData = await api.searchWord(word, language);
      const etymology = extractEtymology(wordData.etymology, language);

      // Use nodesRef for reliable duplicate checking
      const currentNodes = nodesRef.current;

      // 부모 노드 위치 찾기 (파생어 클릭 시)
      const parentNode = parentNodeId ? currentNodes.find(n => n.id === parentNodeId) as any : null;
      const baseX = parentNode?.x ?? parentNode?.fx ?? 0;
      const baseY = parentNode?.y ?? 0;

      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      // Check if this word already exists as any node type
      const existingWordNode = findExistingNodeByLabel(word, currentNodes);

      let wordNodeId: string;

      if (existingWordNode) {
        // Update existing node with etymology data (mutate directly to preserve d3 link references)
        wordNodeId = existingWordNode.id;
        const nodeToUpdate = nodesRef.current.find(n => n.id === existingWordNode.id);
        if (nodeToUpdate) {
          nodeToUpdate.etymology = etymology || undefined;
          nodeToUpdate.type = 'word';
          nodeToUpdate.color = COLORS.word;
          nodeToUpdate.size = 14;
          // Trigger re-render without creating new objects
          setNodes([...nodesRef.current]);
        }
      } else {
        // Create new word node
        wordNodeId = `word-${word}`;
        const briefMeaning = etymology?.definition?.brief ||
          etymology?.modernMeaningLocalized ||
          etymology?.modernMeaningKo ||
          getKoreanMeaning(etymology?.modernMeaning || '');

        // 방사형 레이아웃: 부모 방향을 유지하면서 확장
        const parentDepth = parentNode?.depth ?? 0;
        const parentAngle = parentNode?.angle; // 부모의 확장 방향

        // 첫 번째 단어는 중앙(0,0), 파생어 클릭 시 같은 방향으로 확장
        let wordX = 0;
        let wordY = 0;
        let wordDepth = 0;
        let wordAngle: number | undefined = undefined;

        if (parentNode) {
          // 파생어에서 확장: 부모 방향 유지
          const radialPos = getRadialPosition(baseX, baseY, parentAngle, parentDepth, 0, 1, false);
          const adjusted = adjustForCollision(radialPos.x, radialPos.y, radialPos.angle, currentNodes, 70);
          wordX = adjusted.x;
          wordY = adjusted.y;
          wordDepth = radialPos.depth;
          wordAngle = radialPos.angle;
        }

        newNodes.push({
          id: wordNodeId,
          label: word,
          type: 'word',
          meaning: etymology?.modernMeaning,
          meaningKo: briefMeaning,
          color: COLORS.word,
          size: 14,
          etymology: etymology || undefined,
          x: wordX,
          y: wordY,
          fx: wordX,
          fy: wordY,
          depth: wordDepth,
          angle: wordAngle,
          createdAt: Date.now(),
          sourceX: parentNode ? baseX : undefined,
          sourceY: parentNode ? baseY : undefined,
        });
      }

      // Link from parent node (e.g., derivative) to this word
      if (parentNodeId && !existingWordNode) {
        newLinks.push({
          source: parentNodeId,
          target: wordNodeId,
        });
      }

      if (etymology?.origin) {
        const langColor = COLORS[etymology.origin.language?.toLowerCase() as keyof typeof COLORS] || COLORS.component;

        // 실제 단어 노드 정보 사용
        const wordNode = newNodes.find(n => n.id === wordNodeId) || currentNodes.find(n => n.id === wordNodeId);
        const wordX = wordNode?.fx ?? wordNode?.x ?? 0;
        const wordY = wordNode?.fy ?? wordNode?.y ?? 0;
        const wordDepth = wordNode?.depth ?? 0;
        const allNodes = [...currentNodes, ...newNodes];

        // Root node (e.g., praetextum) - 오른쪽 위 방향으로 확장
        if (etymology.origin.root) {
          // 같은 label의 root가 이미 있는지 확인
          const existingRoot = findExistingNode(etymology.origin.root, 'root', [...currentNodes, ...newNodes]);

          let rootId: string;
          let rootX: number;
          let rootY: number;
          let rootDepth: number;
          let rootAngle: number;

          if (existingRoot) {
            // 기존 root에 링크만 추가
            rootId = existingRoot.id;
            rootX = existingRoot.fx ?? existingRoot.x ?? 0;
            rootY = existingRoot.fy ?? existingRoot.y ?? 0;
            rootDepth = existingRoot.depth ?? 1;
            rootAngle = existingRoot.angle ?? 0;

            // 같은 root로 향하는 기존 링크들의 각도 확인
            const existingLinksToRoot = [...linksRef.current, ...newLinks].filter(
              link => {
                const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
                return targetId === rootId;
              }
            );

            // 기존 링크가 있으면 word 노드 위치를 약간 조정
            if (existingLinksToRoot.length > 0) {
              const currentAngle = Math.atan2(wordY - rootY, wordX - rootX);

              // 기존 링크들의 각도와 비교
              for (const existingLink of existingLinksToRoot) {
                const sourceId = typeof existingLink.source === 'object' ? (existingLink.source as any).id : existingLink.source;
                const sourceNode = [...currentNodes, ...newNodes].find(n => n.id === sourceId);
                if (sourceNode) {
                  const sourceX = sourceNode.fx ?? sourceNode.x ?? 0;
                  const sourceY = sourceNode.fy ?? sourceNode.y ?? 0;
                  const existingAngle = Math.atan2(sourceY - rootY, sourceX - rootX);

                  // 각도 차이가 15도 미만이면 조정
                  const angleDiff = Math.abs(currentAngle - existingAngle);
                  if (angleDiff < Math.PI / 12 || angleDiff > Math.PI * 23 / 12) {
                    // word 노드를 수직 방향으로 약간 이동
                    const offsetAngle = currentAngle + Math.PI / 2; // 수직 방향
                    const offsetDistance = 40; // 40px 이동
                    const offsetX = offsetDistance * Math.cos(offsetAngle);
                    const offsetY = offsetDistance * Math.sin(offsetAngle);

                    // word 노드 위치 업데이트
                    const wordNodeToUpdate = newNodes.find(n => n.id === wordNodeId);
                    if (wordNodeToUpdate) {
                      wordNodeToUpdate.x = (wordNodeToUpdate.x ?? 0) + offsetX;
                      wordNodeToUpdate.y = (wordNodeToUpdate.y ?? 0) + offsetY;
                      wordNodeToUpdate.fx = wordNodeToUpdate.x;
                      wordNodeToUpdate.fy = wordNodeToUpdate.y;
                    }
                    break;
                  }
                }
              }
            }

            newLinks.push({
              source: wordNodeId,
              target: rootId,
            });
          } else {
            // 새 root 노드 생성
            rootId = `root-${etymology.origin.root}`; // word 제거하여 고유 ID 생성
            const wordNodeAngle = wordNode?.angle;
            const isFirstLevel = wordDepth === 0;
            // 첫 번째 레벨: 오른쪽 위(angle=-PI/4), 이후: 부모 방향 유지
            const rootBaseAngle = isFirstLevel ? -Math.PI / 4 : (wordNodeAngle ?? 0);
            const rootPos = getRadialPosition(wordX, wordY, rootBaseAngle, wordDepth, 0, 1, isFirstLevel);
            const adjusted = adjustForCollision(rootPos.x, rootPos.y, rootPos.angle, allNodes, 55);

            rootX = adjusted.x;
            rootY = adjusted.y;
            rootDepth = rootPos.depth;
            rootAngle = rootPos.angle;

            newNodes.push({
              id: rootId,
              label: etymology.origin.root,
              type: 'root',
              meaning: etymology.originalMeaning,
              meaningKo: etymology.originalMeaningLocalized || etymology.originalMeaningKo || getKoreanMeaning(etymology.originalMeaning || ''),
              language: etymology.origin.language,
              color: COLORS.root,
              size: 12,
              x: rootX,
              y: rootY,
              fx: rootX,
              fy: rootY,
              depth: rootDepth,
              angle: rootAngle,
              createdAt: Date.now(),
              sourceX: wordX,
              sourceY: wordY,
            });
            // Link: word ← root (word comes from root)
            newLinks.push({
              source: wordNodeId,
              target: rootId,
            });
          }

          // Components branch from root (e.g., praetextum → prae- + textum)
          if (etymology.origin.components) {
            const compCount = etymology.origin.components.length;
            etymology.origin.components.forEach((comp: { part: string; meaning: string; meaningKo?: string; meaningLocalized?: string }, idx: number) => {
              const koreanMeaning = comp.meaningLocalized || comp.meaningKo || getKoreanMeaning(comp.meaning);

              // Check if this component already exists
              const existingComp = findExistingNode(comp.part, 'component', [...currentNodes, ...newNodes]);

              if (existingComp) {
                // Link to existing component node
                newLinks.push({
                  source: rootId,
                  target: existingComp.id,
                });
              } else {
                // Create new component node (use normalized ID for deduplication)
                const compId = `comp-${normalizeLabel(comp.part)}`; // word 제거하여 고유 ID
                // 방사형: 어근 방향을 유지하면서 확장
                const compPos = getRadialPosition(rootX, rootY, rootAngle, rootDepth, idx, compCount, false);
                const compAdjusted = adjustForCollision(compPos.x, compPos.y, compPos.angle, [...allNodes, ...newNodes], 50);
                newNodes.push({
                  id: compId,
                  label: comp.part,
                  type: 'component',
                  meaning: comp.meaning,
                  meaningKo: koreanMeaning,
                  language: etymology.origin.language,
                  color: COLORS.component,
                  size: 10,
                  x: compAdjusted.x,
                  y: compAdjusted.y,
                  fx: compAdjusted.x,
                  fy: compAdjusted.y,
                  depth: compPos.depth,
                  angle: compPos.angle,
                  createdAt: Date.now(),
                  sourceX: rootX,
                  sourceY: rootY,
                });
                newLinks.push({
                  source: rootId,
                  target: compId,
                });
              }
            });
          }
        } else if (etymology.origin.components) {
          // No root, components connect directly to word
          const compCount = etymology.origin.components.length;
          etymology.origin.components.forEach((comp: { part: string; meaning: string; meaningKo?: string; meaningLocalized?: string }, idx: number) => {
            const koreanMeaning = comp.meaningLocalized || comp.meaningKo || getKoreanMeaning(comp.meaning);

            // Check if this component already exists
            const existingComp = findExistingNode(comp.part, 'component', [...currentNodes, ...newNodes]);

            if (existingComp) {
              // Link to existing component node
              newLinks.push({
                source: wordNodeId,
                target: existingComp.id,
              });
            } else {
              // Create new component node (use normalized ID for deduplication)
              const compId = `comp-${normalizeLabel(comp.part)}`; // word 제거하여 고유 ID
              const wordNodeAngle = wordNode?.angle;
              const isFirstLevel = wordDepth === 0;
              // 첫 번째 레벨: 오른쪽 위 영역(angle=-PI/4), 이후: 부모 방향 유지
              const compBaseAngle = isFirstLevel ? -Math.PI / 4 : (wordNodeAngle ?? 0);
              const compSectorRange = isFirstLevel ? Math.PI / 2 : Math.PI; // 첫 레벨은 90° 범위
              // 방사형: 단어에서 오른쪽 위 방향으로 확장
              const compPos = getRadialPosition(wordX, wordY, compBaseAngle, wordDepth, idx, compCount, isFirstLevel, compSectorRange);
              const compAdjusted = adjustForCollision(compPos.x, compPos.y, compPos.angle, [...allNodes, ...newNodes], 50);
              newNodes.push({
                id: compId,
                label: comp.part,
                type: 'component',
                meaning: comp.meaning,
                meaningKo: koreanMeaning,
                language: etymology.origin.language,
                color: COLORS.component,
                size: 10,
                x: compAdjusted.x,
                y: compAdjusted.y,
                fx: compAdjusted.x,
                fy: compAdjusted.y,
                depth: compPos.depth,
                angle: compPos.angle,
                createdAt: Date.now(),
                sourceX: wordX,
                sourceY: wordY,
              });
              newLinks.push({
                source: wordNodeId,
                target: compId,
              });
            }
          });
        }
      }

      // Add derivative nodes from etymology.derivatives (no extra API call needed)
      if (etymology?.derivatives && etymology.derivatives.length > 0) {
        // 실제 단어 노드 정보 사용
        const wordNode = newNodes.find(n => n.id === wordNodeId) || currentNodes.find(n => n.id === wordNodeId);
        const derivWordX = wordNode?.fx ?? wordNode?.x ?? 0;
        const derivWordY = wordNode?.fy ?? wordNode?.y ?? 0;
        const derivWordDepth = wordNode?.depth ?? 0;
        const derivWordAngle = wordNode?.angle;
        const derivCount = etymology.derivatives.length;

        etymology.derivatives.forEach((deriv: { word: string; meaning: string }, idx: number) => {
          // Check if derivative already exists
          const existingDeriv = findExistingNodeByLabel(deriv.word, [...currentNodes, ...newNodes]);
          if (existingDeriv) return;

          const derivId = `deriv-${word}-${deriv.word}`;
          const isFirstLevel = derivWordDepth === 0;
          // 첫 번째 레벨: 270° 범위로 넓게 퍼짐 (어근 방향 제외), 이후: 부모 방향 유지
          const derivBaseAngle = isFirstLevel ? (3 * Math.PI / 4) : (derivWordAngle ?? Math.PI);
          const derivSectorRange = isFirstLevel ? (3 * Math.PI / 2) : Math.PI; // 첫 레벨은 270°, 이후는 90°
          // 방사형: 넓게 퍼지며 확장 (파생어)
          const derivPos = getRadialPosition(derivWordX, derivWordY, derivBaseAngle, derivWordDepth, idx, derivCount, isFirstLevel, derivSectorRange);
          const derivAdjusted = adjustForCollision(derivPos.x, derivPos.y, derivPos.angle, [...currentNodes, ...newNodes], 55);

          newNodes.push({
            id: derivId,
            label: deriv.word,
            type: 'derivative',
            meaning: deriv.meaning,
            meaningKo: deriv.meaning,
            color: COLORS.derivative,
            size: 8,
            x: derivAdjusted.x,
            y: derivAdjusted.y,
            fx: derivAdjusted.x,
            fy: derivAdjusted.y,
            depth: derivPos.depth,
            angle: derivPos.angle,
            createdAt: Date.now(),
            sourceX: derivWordX,
            sourceY: derivWordY,
          });
          newLinks.push({
            source: wordNodeId,
            target: derivId,
          });
        });
      }

      // Add synonym nodes from etymology.synonyms
      if (etymology?.synonyms && etymology.synonyms.length > 0) {
        const wordNode = newNodes.find(n => n.id === wordNodeId) || currentNodes.find(n => n.id === wordNodeId);
        const synWordX = wordNode?.fx ?? wordNode?.x ?? 0;
        const synWordY = wordNode?.fy ?? wordNode?.y ?? 0;
        const synWordDepth = wordNode?.depth ?? 0;
        const synWordAngle = wordNode?.angle;
        const synCount = etymology.synonyms.length;

        etymology.synonyms.forEach((syn: { word: string; meaning: string; nuance: string }, idx: number) => {
          // Check if synonym already exists
          const existingSyn = findExistingNodeByLabel(syn.word, [...currentNodes, ...newNodes]);
          if (existingSyn) return;

          const synId = `syn-${word}-${syn.word}`;
          const isFirstLevel = synWordDepth === 0;
          // 동의어: 왼쪽 아래 방향으로 배치 (파생어와 반대)
          const synBaseAngle = isFirstLevel ? (-3 * Math.PI / 4) : (synWordAngle ?? -Math.PI / 2);
          const synSectorRange = isFirstLevel ? (Math.PI / 2) : (Math.PI / 3); // 90° 범위
          const synPos = getRadialPosition(synWordX, synWordY, synBaseAngle, synWordDepth, idx, synCount, isFirstLevel, synSectorRange);
          const synAdjusted = adjustForCollision(synPos.x, synPos.y, synPos.angle, [...currentNodes, ...newNodes], 55);

          newNodes.push({
            id: synId,
            label: syn.word,
            type: 'synonym',
            meaning: syn.nuance,
            meaningKo: syn.meaning,
            color: COLORS.synonym,
            size: 8,
            x: synAdjusted.x,
            y: synAdjusted.y,
            fx: synAdjusted.x,
            fy: synAdjusted.y,
            depth: synPos.depth,
            angle: synPos.angle,
            createdAt: Date.now(),
            sourceX: synWordX,
            sourceY: synWordY,
          });
          newLinks.push({
            source: wordNodeId,
            target: synId,
          });
        });
      }

      // Handle suffix/prefix type etymology - show example words
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const etymologyAny = etymology as any;
      if (etymologyAny?.type === 'suffix' || etymologyAny?.type === 'prefix') {
        // 실제 단어 노드 정보 사용
        const wordNode = newNodes.find(n => n.id === wordNodeId) || currentNodes.find(n => n.id === wordNodeId);
        const exWordX = wordNode?.fx ?? wordNode?.x ?? 0;
        const exWordY = wordNode?.fy ?? wordNode?.y ?? 0;
        const exWordDepth = wordNode?.depth ?? 0;
        const exWordAngle = wordNode?.angle;
        const examples = etymologyAny.examples || [];
        const exampleCount = Math.min(examples.length, 5); // 최대 5개

        examples.slice(0, 5).forEach((ex: { word: string; base: string; meaning: string; explanation: string }, idx: number) => {
          // Check if example word already exists
          const existingEx = findExistingNodeByLabel(ex.word, [...currentNodes, ...newNodes]);
          if (existingEx) return;

          const exId = `example-${word}-${ex.word}`;
          const isFirstLevel = exWordDepth === 0;
          // 첫 번째 레벨: 270° 범위로 넓게 퍼짐, 이후: 부모 방향 유지
          const exBaseAngle = isFirstLevel ? (3 * Math.PI / 4) : (exWordAngle ?? Math.PI);
          const exSectorRange = isFirstLevel ? (3 * Math.PI / 2) : Math.PI; // 첫 레벨은 270°
          // 방사형: 접사에서 넓게 확장 (예시 단어들)
          const exPos = getRadialPosition(exWordX, exWordY, exBaseAngle, exWordDepth, idx, exampleCount, isFirstLevel, exSectorRange);
          const exAdjusted = adjustForCollision(exPos.x, exPos.y, exPos.angle, [...currentNodes, ...newNodes], 55);

          newNodes.push({
            id: exId,
            label: ex.word,
            type: 'derivative', // derivative 타입으로 표시 (클릭 시 검색 가능)
            meaning: ex.explanation,
            meaningKo: ex.meaning,
            color: COLORS.derivative,
            size: 8,
            x: exAdjusted.x,
            y: exAdjusted.y,
            fx: exAdjusted.x,
            fy: exAdjusted.y,
            depth: exPos.depth,
            angle: exPos.angle,
            createdAt: Date.now(),
            sourceX: exWordX,
            sourceY: exWordY,
          });
          newLinks.push({
            source: wordNodeId,
            target: exId,
          });
        });
      }

      // Fix all existing node positions before adding new nodes
      // This prevents the simulation from moving them around
      nodesRef.current.forEach((n: any) => {
        if (n.x !== undefined && n.y !== undefined) {
          n.fx = n.x;
          n.fy = n.y;
        }
      });

      // Update refs immediately for subsequent lookups
      nodesRef.current = [...nodesRef.current, ...newNodes];
      linksRef.current = [...linksRef.current, ...newLinks];
      setNodes(prev => [...prev, ...newNodes]);
      setLinks(prev => [...prev, ...newLinks]);

      // 단어 로드 후 자동으로 상세 패널 표시
      if (etymology) {
        const wordNode = newNodes.find(n => n.id === wordNodeId) ||
          nodesRef.current.find(n => n.id === wordNodeId);
        if (wordNode) {
          setSelectedNode({ ...wordNode, etymology } as GraphNode);
        }
      }
    } catch (error) {
      console.error('Failed to fetch word:', error);
      // Show error message based on error type
      if (error instanceof ApiError) {
        if (error.code === 'INVALID_WORD') {
          setErrorMessage(`"${error.word || word}" is not a valid English word`);
        } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
          setErrorMessage('API 한도 초과입니다. 잠시 후 다시 시도해주세요.');
        }
        // Remove from loaded cache so user can retry
        loadedWordsRef.current.delete(cacheKey);
      }
    } finally {
      setLoading(false);
      // Remove from loading state
      if (clickedNodeId) {
        setLoadingNodeIds(prev => {
          const next = new Set(prev);
          next.delete(clickedNodeId);
          return next;
        });
      }
      // Call onInitialLoad callback for the first load
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        onInitialLoad?.();
      }
    }
  };

  const loadDerivatives = async (nodeId: string, word: string) => {
    const derivKey = `deriv-${word}`;
    if (loadedWordsRef.current.has(derivKey)) return;
    loadedWordsRef.current.add(derivKey);

    // Track loading state for the clicked node
    setLoadingNodeIds(prev => new Set(prev).add(nodeId));

    setLoading(true);
    try {
      // Get derivatives from etymology JSON via API
      const result = await api.getDerivatives(word, language);
      const derivatives = result.derivatives || [];

      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      // 부모 노드의 정보 찾기
      const parentNode = nodesRef.current.find(n => n.id === nodeId) as any;
      const parentX = parentNode?.x || 0;
      const parentY = parentNode?.y || 0;
      const parentDepth = parentNode?.depth ?? 0;
      const parentAngle = parentNode?.angle;

      const derivTotal = derivatives.length;
      derivatives.forEach((deriv: { word: string; meaning: string }, index: number) => {
        const derivId = `deriv-${word}-${deriv.word}`;
        const isFirstLevel = parentDepth === 0;
        // 첫 번째 레벨: 270° 범위로 넓게 퍼짐, 이후: 부모 방향 유지
        const derivBaseAngle = isFirstLevel ? (3 * Math.PI / 4) : (parentAngle ?? Math.PI);
        const derivSectorRange = isFirstLevel ? (3 * Math.PI / 2) : Math.PI; // 첫 레벨은 270°
        // 방사형: 부모 방향 유지하면서 확장
        const derivPos = getRadialPosition(parentX, parentY, derivBaseAngle, parentDepth, index, derivTotal, isFirstLevel, derivSectorRange);
        const derivAdjusted = adjustForCollision(derivPos.x, derivPos.y, derivPos.angle, [...nodesRef.current, ...newNodes], 55);
        newNodes.push({
          id: derivId,
          label: deriv.word,
          type: 'derivative',
          meaning: deriv.meaning,
          meaningKo: deriv.meaning,
          color: COLORS.derivative,
          size: 8,
          x: derivAdjusted.x,
          y: derivAdjusted.y,
          fx: derivAdjusted.x,
          fy: derivAdjusted.y,
          depth: derivPos.depth,
          angle: derivPos.angle,
          createdAt: Date.now(),
          sourceX: parentX,
          sourceY: parentY,
        });
        newLinks.push({
          source: nodeId,
          target: derivId,
        });
      });

      // Fix all existing node positions before adding new nodes
      nodesRef.current.forEach((n: any) => {
        if (n.x !== undefined && n.y !== undefined) {
          n.fx = n.x;
          n.fy = n.y;
        }
      });

      // Update refs immediately for subsequent lookups
      nodesRef.current = [...nodesRef.current, ...newNodes];
      linksRef.current = [...linksRef.current, ...newLinks];
      setNodes(prev => [...prev, ...newNodes]);
      setLinks(prev => [...prev, ...newLinks]);
    } catch (error) {
      console.error('Failed to fetch derivatives:', error);
      if (error instanceof ApiError && error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage('API 한도 초과입니다. 잠시 후 다시 시도해주세요.');
        // Remove from loaded cache so user can retry
        loadedWordsRef.current.delete(derivKey);
      }
    } finally {
      setLoading(false);
      // Remove from loading state
      setLoadingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  // Etymology refresh functions
  const handleRefreshEtymology = async () => {
    if (!selectedNode || refreshLoading) return;

    setRefreshLoading(true);
    try {
      const wordData = await api.refreshEtymology(selectedNode.label, language);
      const newEtymology = extractEtymology(wordData.etymology, language);
      const oldEtymology = extractEtymology(wordData.etymologyPrev, language);

      if (newEtymology) {
        // Update the selected node's etymology
        setSelectedNode(prev => prev ? { ...prev, etymology: newEtymology } : null);
        // Update in nodes array too
        setNodes(prev => prev.map(n =>
          n.id === selectedNode.id ? { ...n, etymology: newEtymology } : n
        ));

        // Enter comparison mode
        setPrevEtymology(oldEtymology);
        setIsComparing(true);
      }
    } catch (error) {
      console.error('Failed to refresh etymology:', error);
      if (error instanceof ApiError && error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage('API 한도 초과입니다. 잠시 후 다시 시도해주세요.');
      } else {
        setErrorMessage('어원 정보 새로고침에 실패했습니다.');
      }
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleApplyEtymology = async () => {
    if (!selectedNode) return;

    try {
      await api.applyEtymology(selectedNode.label, language);
      // Exit comparison mode
      setPrevEtymology(null);
      setIsComparing(false);
    } catch (error) {
      console.error('Failed to apply etymology:', error);
      setErrorMessage('어원 정보 적용에 실패했습니다.');
    }
  };

  const handleRevertEtymology = async () => {
    if (!selectedNode || !prevEtymology) return;

    try {
      const wordData = await api.revertEtymology(selectedNode.label, language);
      const revertedEtymology = extractEtymology(wordData.etymology, language);

      if (revertedEtymology) {
        // Update the selected node's etymology back to previous
        setSelectedNode(prev => prev ? { ...prev, etymology: revertedEtymology } : null);
        setNodes(prev => prev.map(n =>
          n.id === selectedNode.id ? { ...n, etymology: revertedEtymology } : n
        ));
      }

      // Exit comparison mode
      setPrevEtymology(null);
      setIsComparing(false);
    } catch (error) {
      console.error('Failed to revert etymology:', error);
      setErrorMessage('어원 정보 복원에 실패했습니다.');
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    // Show detail panel for word or derivative nodes with etymology
    if ((node.type === 'word' || node.type === 'derivative') && node.etymology) {
      setSelectedNode(node as GraphNode);
    }

    if (node.type === 'component') {
      const label = node.label.toLowerCase();
      const cleanLabel = label.replace(/[-–—]/g, '');

      // 접미사: -로 시작 (예: -er, -ing, -tion)
      if (label.startsWith('-') && cleanLabel.length >= 2) {
        loadWord(label, node.id, node.id);
        onWordSelect?.(label);
        return;
      }

      // 접두사: -로 끝남 (예: un-, re-, pre-, inter-, super-, trans-)
      if (label.endsWith('-')) {
        loadWord(label, node.id, node.id);
        onWordSelect?.(label);
        return;
      }

      // 그 외는 어근이므로 검색하지 않음 (예: bike, teach)
      return;
    } else if (node.type === 'derivative') {
      // Pass the derivative node ID as parent and as clicked node for loading indicator
      loadWord(node.label, node.id, node.id);
      onWordSelect?.(node.label);
    } else if (node.type === 'synonym') {
      // Load synonym word etymology
      loadWord(node.label, node.id, node.id);
      onWordSelect?.(node.label);
    } else if (node.type === 'root') {
      // 어근 클릭 시 API 호출 안 함 (정보 표시만)
    }
  }, [onWordSelect]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Guard against undefined coordinates during initialization
    if (node.x === undefined || node.y === undefined || !isFinite(node.x) || !isFinite(node.y)) {
      return;
    }

    const label = node.label || '';
    const fontSize = Math.max(14 / globalScale, 5);
    const smallFontSize = Math.max(11 / globalScale, 4);
    const baseNodeSize = node.size || 8;
    const isHovered = hoveredNode?.id === node.id;
    const isSelected = selectedNode?.id === node.id;
    const isLoading = loadingNodeIds.has(node.id);

    // 쏘옥 애니메이션: 부모 위치에서 목표 위치로 튀어나오는 효과
    let scale = 1;
    let opacity = 1;
    let drawX = node.x;
    let drawY = node.y;

    if (node.createdAt) {
      const elapsed = Date.now() - node.createdAt;
      const duration = 280; // 0.28초 (30% 빠르게)
      if (elapsed < duration) {
        const t = elapsed / duration;

        // easeOutBack: 튀어나오는 효과 (overshooting)
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const easeOutBack = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

        // 위치 보간: sourceX/Y에서 실제 위치로 이동
        if (node.sourceX !== undefined && node.sourceY !== undefined) {
          drawX = node.sourceX + (node.x - node.sourceX) * easeOutBack;
          drawY = node.sourceY + (node.y - node.sourceY) * easeOutBack;
        }

        // 크기: 0에서 시작해서 살짝 커졌다가 정상 크기로
        scale = easeOutBack;

        // 페이드인 효과
        opacity = Math.min(1, t * 3);
      }
    }

    // Loading heartbeat animation - 노드 자체가 커졌다 작아지는 효과
    let loadingScale = 1;
    if (isLoading) {
      const t = (Date.now() / 1000) % 1; // 1초 주기 (속도 3/5)
      // 빠르게 커졌다가 천천히 줄어듦
      if (t < 0.3) {
        // 확장: 빠르게
        loadingScale = 1 + 0.35 * (t / 0.3);
      } else {
        // 수축: 천천히
        const shrinkT = (t - 0.3) / 0.7;
        loadingScale = 1.35 - 0.35 * shrinkT * shrinkT; // easeIn
      }
    }

    const nodeSize = baseNodeSize * Math.max(0.1, scale) * loadingScale;

    // 애니메이션 중 투명도 적용
    ctx.globalAlpha = opacity;

    // Glow effect (stronger when hovered, selected, or loading)
    ctx.beginPath();
    ctx.arc(drawX, drawY, nodeSize + (isHovered || isSelected ? 6 : 4), 0, 2 * Math.PI);
    const gradient = ctx.createRadialGradient(drawX, drawY, nodeSize, drawX, drawY, nodeSize + (isHovered || isSelected ? 15 : 10));
    gradient.addColorStop(0, node.color + (isHovered || isSelected ? '80' : '60'));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Node circle
    ctx.beginPath();
    ctx.arc(drawX, drawY, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = node.color || '#6366f1';
    ctx.fill();

    // 투명도 복원
    ctx.globalAlpha = 1;


    // Hovered or selected border
    if (isHovered || isSelected) {
      ctx.strokeStyle = isSelected ? '#818cf8' : '#ffffff';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.arc(drawX, drawY, nodeSize, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Label (node name)
    ctx.font = `${node.type === 'word' ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(label, drawX, drawY + nodeSize + 4);

    // Meaning text below label (for all nodes with meaning)
    let yOffset = drawY + nodeSize + fontSize + 6;

    if (node.meaningKo) {
      ctx.font = `${smallFontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(node.meaningKo, drawX, yOffset);
      yOffset += smallFontSize + 2;
    } else if (node.meaning) {
      // Show English meaning if no Korean available
      ctx.font = `${smallFontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      // Truncate long meanings
      const maxLen = 20;
      const displayMeaning = node.meaning.length > maxLen
        ? node.meaning.substring(0, maxLen) + '...'
        : node.meaning;
      ctx.fillText(displayMeaning, drawX, yOffset);
    }
  }, [hoveredNode, selectedNode, loadingNodeIds]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-slate-900 rounded-xl overflow-hidden">
      {/* Error Message */}
      {errorMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-3 bg-red-900/90 border border-red-700 rounded-lg text-red-200 text-sm">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-2 p-1 hover:bg-red-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 px-3 py-2 bg-slate-800/80 rounded-lg text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.word }} />
          <span className="text-slate-300">단어</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.root }} />
          <span className="text-slate-300">어근</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.component }} />
          <span className="text-slate-300">접사</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.derivative }} />
          <span className="text-slate-300">파생어</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.synonym }} />
          <span className="text-slate-300">동의어</span>
        </div>
      </div>

      {nodes.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          단어를 검색하여 어원 탐색 시작
        </div>
      )}

      {/* Detail Panel */}
      <div
        className={`absolute top-0 right-0 ${isComparing ? 'w-[700px]' : 'w-96'} h-full bg-slate-800/95 backdrop-blur-sm border-l border-slate-700 overflow-y-auto z-20 transition-all duration-300 ease-out ${
          selectedNode?.etymology ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedNode?.etymology && (
          <>
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between z-10">
            <h2 className="text-xl font-bold text-white capitalize">{selectedNode.label}</h2>
            <div className="flex items-center gap-2">
              {selectedNode.type === 'word' && !isComparing && (
                <button
                  onClick={handleRefreshEtymology}
                  disabled={refreshLoading}
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                  title="새 설명 생성"
                >
                  <RefreshCw className={`w-5 h-5 text-slate-400 ${refreshLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedNode(null);
                  setIsComparing(false);
                  setPrevEtymology(null);
                }}
                className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Comparison Mode */}
          {isComparing && prevEtymology ? (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Previous Etymology */}
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                  <h3 className="text-sm font-semibold text-amber-400 mb-3">이전 설명</h3>
                  {prevEtymology.definition && (
                    <div className="mb-4">
                      <p className="text-base font-medium text-white mb-1">
                        {prevEtymology.definition.brief}
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {prevEtymology.definition.detailed}
                      </p>
                    </div>
                  )}
                  {prevEtymology.origin && (
                    <div className="text-xs text-slate-400">
                      <span className="text-amber-400">{prevEtymology.origin.language}</span>
                      {' '}→ {prevEtymology.origin.root}
                    </div>
                  )}
                </div>

                {/* New Etymology */}
                <div className="bg-slate-900/50 rounded-lg p-4 border border-indigo-500">
                  <h3 className="text-sm font-semibold text-indigo-400 mb-3">새 설명</h3>
                  {selectedNode.etymology.definition && (
                    <div className="mb-4">
                      <p className="text-base font-medium text-white mb-1">
                        {selectedNode.etymology.definition.brief}
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {selectedNode.etymology.definition.detailed}
                      </p>
                    </div>
                  )}
                  {selectedNode.etymology.origin && (
                    <div className="text-xs text-slate-400">
                      <span className="text-amber-400">{selectedNode.etymology.origin.language}</span>
                      {' '}→ {selectedNode.etymology.origin.root}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-3 mt-6">
                <button
                  onClick={handleApplyEtymology}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  새 설명 적용
                </button>
                <button
                  onClick={handleRevertEtymology}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            /* Normal Detail View */
            <div className="p-4 space-y-6">
              {/* Definition */}
              {selectedNode.etymology.definition && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">의미</h3>
                  <p className="text-lg font-medium text-white mb-2">
                    {selectedNode.etymology.definition.brief}
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {selectedNode.etymology.definition.detailed}
                  </p>
                  {selectedNode.etymology.definition.nuance && (
                    <p className="text-sm text-slate-400 mt-2 italic">
                      💡 {selectedNode.etymology.definition.nuance}
                    </p>
                  )}
                </section>
              )}

              {/* Examples - 일반 단어 또는 접미사/접두사 */}
              {selectedNode.etymology.examples && selectedNode.etymology.examples.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">
                    {(selectedNode.etymology as any).type ? '예시 단어' : '예문'}
                  </h3>
                  <div className="space-y-3">
                    {selectedNode.etymology.examples.map((example: any, i: number) => (
                      <div key={i} className="bg-slate-900/50 rounded-lg p-3">
                        {/* 접미사/접두사: word, base, meaning, explanation */}
                        {example.word ? (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-white font-medium">{example.word}</span>
                              <span className="text-slate-500 text-sm">← {example.base}</span>
                            </div>
                            <p className="text-emerald-400 text-sm">{example.meaning}</p>
                            <p className="text-slate-400 text-xs mt-1">{example.explanation}</p>
                          </>
                        ) : (
                          /* 일반 단어: english, translation */
                          <>
                            <p className="text-slate-200 text-sm">{example.english}</p>
                            <p className="text-slate-400 text-sm mt-1">{example.translation}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Etymology */}
              <section>
                <h3 className="text-sm font-semibold text-indigo-400 mb-2">어원</h3>
                {selectedNode.etymology.origin && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
                        {selectedNode.etymology.origin.language}
                      </span>
                      {/* 접미사/접두사: originalForm, 일반 단어: root */}
                      <span className="text-white font-medium">
                        {(selectedNode.etymology.origin as any).originalForm || selectedNode.etymology.origin.root}
                      </span>
                    </div>
                    {/* 접미사/접두사: origin.originalMeaning */}
                    {(selectedNode.etymology.origin as any).originalMeaning && (
                      <p className="text-sm text-slate-400">{(selectedNode.etymology.origin as any).originalMeaning}</p>
                    )}
                    {selectedNode.etymology.origin.rootMeaning && (
                      <p className="text-sm text-slate-400">{selectedNode.etymology.origin.rootMeaning}</p>
                    )}
                    {selectedNode.etymology.origin.components && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedNode.etymology.origin.components.map((comp, i) => (
                          <div key={i} className="bg-purple-500/20 px-2 py-1 rounded text-sm">
                            <span className="text-purple-300 font-medium">{comp.part}</span>
                            <span className="text-slate-400 ml-1">
                              ({comp.meaningLocalized || comp.meaning})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Related Suffixes/Prefixes - 접미사/접두사 전용 */}
              {((selectedNode.etymology as any).relatedSuffixes || (selectedNode.etymology as any).relatedPrefixes) && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">관련 접사</h3>
                  <div className="space-y-2">
                    {((selectedNode.etymology as any).relatedSuffixes || (selectedNode.etymology as any).relatedPrefixes || []).map((related: any, i: number) => (
                      <div key={i} className="bg-slate-900/50 rounded-lg p-3">
                        <span className="text-cyan-400 font-medium">{related.suffix || related.prefix}</span>
                        <p className="text-slate-400 text-sm mt-1">{related.difference}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Evolution */}
              {selectedNode.etymology.evolution && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">의미 변화</h3>
                  <p className="text-sm text-cyan-400 mb-2">
                    {typeof selectedNode.etymology.evolution === 'string'
                      ? selectedNode.etymology.evolution
                      : selectedNode.etymology.evolution.path}
                  </p>
                  {typeof selectedNode.etymology.evolution === 'object' && selectedNode.etymology.evolution.explanation && (
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {selectedNode.etymology.evolution.explanation}
                    </p>
                  )}
                </section>
              )}

              {/* Polysemy - Semantic Evolution */}
              {selectedNode.etymology.senses && selectedNode.etymology.senses.length >= 2 && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-3">의미 분화</h3>
                  {/* Root indicator */}
                  <div className="flex items-center gap-2 mb-3 p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                    <span className="font-mono text-amber-400 font-medium">
                      {selectedNode.etymology.origin?.root}
                    </span>
                    <span className="text-slate-400 text-xs">
                      ({selectedNode.etymology.origin?.rootMeaning || selectedNode.etymology.originalMeaning})
                    </span>
                  </div>
                  {/* Senses list */}
                  <div className="space-y-2 ml-2 border-l-2 border-slate-600 pl-3">
                    {selectedNode.etymology.senses.map((sense, idx) => (
                      <div key={idx} className="bg-slate-900/50 rounded-lg p-3 relative">
                        {/* Branch connector */}
                        <div className="absolute -left-[14px] top-1/2 w-3 h-0.5 bg-slate-600" />
                        {/* Domain badge */}
                        <span className="inline-block px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded mb-2">
                          {sense.domain}
                        </span>
                        {/* Meaning */}
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-white font-medium">{sense.meaning}</span>
                          <span className="text-slate-400 text-xs">({sense.english})</span>
                        </div>
                        {/* Metaphorical extension */}
                        <p className="text-xs text-amber-300/80 italic">
                          ↳ {sense.metaphoricalExtension}
                        </p>
                        {/* Example */}
                        {sense.example && (
                          <div className="mt-2 pt-2 border-t border-slate-700 text-xs">
                            <p className="text-slate-300">&quot;{sense.example.english}&quot;</p>
                            <p className="text-slate-500">{sense.example.translation}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Synonyms */}
              {selectedNode.etymology.synonyms && selectedNode.etymology.synonyms.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">동의어</h3>
                  <div className="space-y-2">
                    {selectedNode.etymology.synonyms.map((synonym, i) => (
                      <div key={i} className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/30">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-purple-300 font-medium">{synonym.word}</span>
                          <span className="text-slate-400 text-sm">{synonym.meaning}</span>
                        </div>
                        <p className="text-xs text-slate-400 italic">{synonym.nuance}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Historical Context */}
              {selectedNode.etymology.historicalContext && (
                <section>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-2">역사적 배경</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {selectedNode.etymology.historicalContext}
                  </p>
                </section>
              )}
            </div>
          )}
          </>
        )}
      </div>

      <ForceGraph2D
        ref={graphRef}
        graphData={{ nodes, links }}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const size = node.size || 8;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
          ctx.fill();
        }}
        onNodeClick={(node) => {
          console.log('[onNodeClick]', node?.id);
          handleNodeClick(node);
        }}
        onNodeHover={(node) => {
          console.log('[onNodeHover]', node?.id);
          setHoveredNode(node as GraphNode | null);
        }}
        onNodeDrag={(node) => {
          const nodeId = node?.id as string;
          if (!nodeId) return;

          console.log('[onNodeDrag]', nodeId, node?.x, node?.y);
          // Initialize drag state on first drag event
          if (!dragStateRef.current || dragStateRef.current.nodeId !== nodeId) {
            // Access d3's internal link array which has source/target mutated to node objects
            const d3LinkForce = graphRef.current?.d3Force?.('link');
            const d3Links = d3LinkForce?.links?.() || links;
            const connectedIds = getConnectedDescendants(nodeId, d3Links);
            const connectedNodesMap = new Map<string, { startX: number; startY: number; node: any }>();

            console.log('[Drag Start] node:', nodeId, 'connectedIds:', [...connectedIds], 'd3Links:', d3Links.length);

            // Access d3's internal node array which has x/y/fx/fy values
            const d3ForceNodes = graphRef.current?.d3Force?.('charge')?.nodes?.() || nodes;
            d3ForceNodes.forEach((n: any) => {
              if (connectedIds.has(n.id)) {
                // Store original position (keep fx/fy - we'll update them during drag)
                const startX = n.fx ?? n.x ?? 0;
                const startY = n.fy ?? n.y ?? 0;
                connectedNodesMap.set(n.id, {
                  startX,
                  startY,
                  node: n
                });
                console.log('[Drag Start] connected node:', n.id, 'startX:', startX, 'startY:', startY);
              }
            });

            dragStateRef.current = {
              nodeId: nodeId,
              startX: node.x ?? 0,
              startY: node.y ?? 0,
              connectedNodes: connectedNodesMap,
            };
          }

          // Calculate delta from start position
          const deltaX = (node.x ?? 0) - dragStateRef.current.startX;
          const deltaY = (node.y ?? 0) - dragStateRef.current.startY;

          console.log('[Drag] deltaX:', deltaX, 'deltaY:', deltaY);

          // Move all connected nodes by the same delta
          // Use fx/fy to force position (prevents d3 simulation from overriding)
          dragStateRef.current.connectedNodes.forEach((data) => {
            const newX = data.startX + deltaX;
            const newY = data.startY + deltaY;
            data.node.x = newX;
            data.node.y = newY;
            data.node.fx = newX;
            data.node.fy = newY;
          });
        }}
        onNodeDragEnd={(node) => {
          // Fix position of dragged node
          node.fx = node.x;
          node.fy = node.y;

          // Fix positions of all connected nodes
          if (dragStateRef.current && dragStateRef.current.nodeId === node.id) {
            dragStateRef.current.connectedNodes.forEach((data) => {
              data.node.fx = data.node.x;
              data.node.fy = data.node.y;
            });
          }

          // Clear drag state
          dragStateRef.current = null;
        }}
        onEngineStop={() => {
          // Fix all node positions when simulation stops
          // d3 mutates x/y in place on the same node objects in the nodes array
          nodes.forEach((n: any) => {
            if (n.x !== undefined && n.y !== undefined) {
              n.fx = n.x;
              n.fy = n.y;
            }
          });
        }}
        linkColor={() => '#475569'}
        linkWidth={2}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => '#818cf8'}
        d3VelocityDecay={0.6}
        d3AlphaDecay={0.1}
        cooldownTicks={50}
        warmupTicks={20}
        cooldownTime={800}
        enableNodeDrag={true}
        autoPauseRedraw={false}
        minZoom={0.5}
        maxZoom={3}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
      />
    </div>
  );
}
