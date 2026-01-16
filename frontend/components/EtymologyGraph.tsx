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

    // Load the word after a small delay to ensure state is cleared
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

      // Main word node
      const wordNodeId = `word-${word}`;
      newNodes.push({
        id: wordNodeId,
        label: word,
        type: 'word',
        meaning: etymology?.modernMeaning,
        color: COLORS.word,
        size: 14,
      });

      // Add etymology components
      if (etymology?.origin?.components) {
        etymology.origin.components.forEach((comp: { part: string; meaning: string }) => {
          const compId = `comp-${word}-${comp.part}`;
          const langColor = COLORS[etymology.origin.language.toLowerCase() as keyof typeof COLORS] || COLORS.component;
          newNodes.push({
            id: compId,
            label: comp.part,
            type: 'component',
            meaning: comp.meaning,
            language: etymology.origin.language,
            color: langColor,
            size: 10,
          });
          newLinks.push({
            source: wordNodeId,
            target: compId,
          });
        });

        // Add root node
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
      // Clean the word (remove special characters like -)
      const cleanWord = node.label.replace(/[-–—]/g, '').toLowerCase();
      if (cleanWord.length > 1) {
        loadDerivatives(node.id, cleanWord);
      }
    } else if (node.type === 'derivative') {
      loadWord(node.label);
      onWordSelect?.(node.label);
    }
  }, [onWordSelect]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.label || '';
    const fontSize = Math.max(12 / globalScale, 4);
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
          <span className="text-slate-300">Word</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.component }} />
          <span className="text-slate-300">Component</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.derivative }} />
          <span className="text-slate-300">Derivative</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.root }} />
          <span className="text-slate-300">Root</span>
        </div>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="absolute top-4 left-4 z-10 max-w-xs px-4 py-3 bg-slate-800/90 rounded-lg border border-slate-700">
          <div className="font-semibold text-white">{selectedNode.label}</div>
          {selectedNode.meaning && (
            <div className="mt-1 text-sm text-slate-300">{selectedNode.meaning}</div>
          )}
          {selectedNode.language && (
            <div className="mt-1 text-xs text-slate-400">Origin: {selectedNode.language}</div>
          )}
          <div className="mt-2 text-xs text-indigo-400">
            {selectedNode.type === 'component' && '→ Click to see derivatives'}
            {selectedNode.type === 'derivative' && '→ Click to explore this word'}
          </div>
        </div>
      )}

      {nodes.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          Search for a word to start exploring
        </div>
      )}

      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeClick={handleNodeClick}
        onNodeHover={(node) => node && setSelectedNode(node as GraphNode)}
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
