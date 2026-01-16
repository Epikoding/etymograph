'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
});

interface GraphNode {
  id: string;
  label: string;
  type: 'word' | 'component' | 'derivative' | 'root';
  meaning?: string;
  meaningKo?: string;
  language?: string;
  color?: string;
  size?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface EtymologyGraphProps {
  initialWord?: string;
  onWordSelect?: (word: string) => void;
}

const COLORS = {
  word: '#6366f1',
  component: '#a855f7',
  derivative: '#06b6d4',
  root: '#f59e0b',
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

export default function EtymologyGraph({ initialWord, onWordSelect }: EtymologyGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const loadedWordsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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

  // Load initial word
  useEffect(() => {
    if (!initialWord) return;

    // Reset graph
    setNodes([]);
    setLinks([]);
    loadedWordsRef.current = new Set();
    setSelectedNode(null);

    const timer = setTimeout(() => {
      loadWord(initialWord);
    }, 50);

    return () => clearTimeout(timer);
  }, [initialWord]);

  const loadWord = async (word: string) => {
    if (loadedWordsRef.current.has(word)) return;
    loadedWordsRef.current.add(word);

    setLoading(true);
    try {
      const wordData = await api.searchWord(word);
      const etymology = wordData.etymology;

      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      const wordNodeId = `word-${word}`;
      newNodes.push({
        id: wordNodeId,
        label: word,
        type: 'word',
        meaning: etymology?.modernMeaning,
        color: COLORS.word,
        size: 14,
      });

      if (etymology?.origin?.components) {
        etymology.origin.components.forEach((comp: { part: string; meaning: string }) => {
          const compId = `comp-${word}-${comp.part}`;
          const langColor = COLORS[etymology.origin.language.toLowerCase() as keyof typeof COLORS] || COLORS.component;
          const koreanMeaning = getKoreanMeaning(comp.meaning);

          newNodes.push({
            id: compId,
            label: comp.part,
            type: 'component',
            meaning: comp.meaning,
            meaningKo: koreanMeaning,
            language: etymology.origin.language,
            color: langColor,
            size: 10,
          });
          newLinks.push({
            source: wordNodeId,
            target: compId,
          });
        });

        if (etymology.origin.root) {
          const rootId = `root-${word}-${etymology.origin.root}`;
          newNodes.push({
            id: rootId,
            label: etymology.origin.root,
            type: 'root',
            meaning: etymology.originalMeaning,
            language: etymology.origin.language,
            color: COLORS.root,
            size: 12,
          });
          newLinks.push({
            source: wordNodeId,
            target: rootId,
          });
        }
      }

      setNodes(prev => [...prev, ...newNodes]);
      setLinks(prev => [...prev, ...newLinks]);
    } catch (error) {
      console.error('Failed to fetch word:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDerivatives = async (nodeId: string, word: string) => {
    const derivKey = `deriv-${word}`;
    if (loadedWordsRef.current.has(derivKey)) return;
    loadedWordsRef.current.add(derivKey);

    setLoading(true);
    try {
      const wordData = await api.getDerivatives(word);
      const derivatives = wordData.derivatives || [];

      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      derivatives.forEach((deriv: string) => {
        const derivId = `deriv-${word}-${deriv}`;
        newNodes.push({
          id: derivId,
          label: deriv,
          type: 'derivative',
          color: COLORS.derivative,
          size: 8,
        });
        newLinks.push({
          source: nodeId,
          target: derivId,
        });
      });

      setNodes(prev => [...prev, ...newNodes]);
      setLinks(prev => [...prev, ...newLinks]);
    } catch (error) {
      console.error('Failed to fetch derivatives:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);

    if (node.type === 'component') {
      // Use the label directly for derivative lookup
      const word = node.label.replace(/[-–—]/g, '').toLowerCase();
      if (word.length > 1) {
        loadDerivatives(node.id, word);
      }
    } else if (node.type === 'derivative') {
      loadWord(node.label);
      onWordSelect?.(node.label);
    } else if (node.type === 'root') {
      // Root can also expand to derivatives
      const word = node.label.replace(/[-–—]/g, '').toLowerCase();
      if (word.length > 1) {
        loadDerivatives(node.id, word);
      }
    }
  }, [onWordSelect]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Guard against undefined coordinates during initialization
    if (node.x === undefined || node.y === undefined || !isFinite(node.x) || !isFinite(node.y)) {
      return;
    }

    const label = node.label || '';
    const fontSize = Math.max(12 / globalScale, 4);
    const smallFontSize = Math.max(10 / globalScale, 3);
    const nodeSize = node.size || 8;

    // Glow effect
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize + 4, 0, 2 * Math.PI);
    const gradient = ctx.createRadialGradient(node.x, node.y, nodeSize, node.x, node.y, nodeSize + 10);
    gradient.addColorStop(0, node.color + '60');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = node.color || '#6366f1';
    ctx.fill();

    // Selected border
    if (selectedNode?.id === node.id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.font = `${node.type === 'word' ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(label, node.x, node.y + nodeSize + 4);

    // Korean meaning for component nodes
    if (node.meaningKo && node.type === 'component') {
      ctx.font = `${smallFontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(node.meaningKo, node.x, node.y + nodeSize + fontSize + 6);
    }
  }, [selectedNode]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-slate-900 rounded-xl overflow-hidden">
      {loading && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 bg-slate-800/80 rounded-lg text-slate-300 text-sm">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 px-3 py-2 bg-slate-800/80 rounded-lg text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.word }} />
          <span className="text-slate-300">단어</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.latin }} />
          <span className="text-slate-300">어원</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.derivative }} />
          <span className="text-slate-300">파생어</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.root }} />
          <span className="text-slate-300">어근</span>
        </div>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="absolute top-4 left-4 z-10 max-w-sm px-4 py-3 bg-slate-800/90 rounded-lg border border-slate-700">
          <div className="font-semibold text-white text-lg">{selectedNode.label}</div>
          {selectedNode.meaning && (
            <div className="mt-1 text-sm text-slate-300">{selectedNode.meaning}</div>
          )}
          {selectedNode.meaningKo && (
            <div className="mt-1 text-sm text-indigo-300">({selectedNode.meaningKo})</div>
          )}
          {selectedNode.language && (
            <div className="mt-2 text-xs text-slate-400">출처: {selectedNode.language}</div>
          )}
          <div className="mt-2 text-xs text-cyan-400 font-medium">
            {selectedNode.type === 'component' && '👆 클릭하여 파생어 보기'}
            {selectedNode.type === 'derivative' && '👆 클릭하여 이 단어 탐색'}
            {selectedNode.type === 'root' && '👆 클릭하여 파생어 보기'}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 z-10 px-3 py-2 bg-slate-800/80 rounded-lg text-xs text-slate-400">
        노드를 클릭하여 확장
      </div>

      {nodes.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          단어를 검색하여 어원 탐색 시작
        </div>
      )}

      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeClick={handleNodeClick}
        onNodeHover={(node) => setSelectedNode(node as GraphNode | null)}
        linkColor={() => '#475569'}
        linkWidth={2}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => '#818cf8'}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
      />
    </div>
  );
}
