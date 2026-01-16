'use client';

import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphNode, GraphEdge } from '@/types/word';

// Dynamically import react-force-graph to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
});

interface WordGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
}

interface GraphData {
  nodes: Array<{
    id: string;
    word: string;
    etymology: GraphNode['etymology'];
    order: number;
    val: number;
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
}

export default function WordGraph({ nodes, edges, onNodeClick }: WordGraphProps) {
  const graphData: GraphData = useMemo(() => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      word: node.word,
      etymology: node.etymology,
      order: node.order,
      val: 1,
    })),
    links: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
  }), [nodes, edges]);

  const handleNodeClick = useCallback(
    (node: GraphData['nodes'][0]) => {
      if (onNodeClick) {
        onNodeClick({
          id: node.id,
          word: node.word,
          etymology: node.etymology,
          order: node.order,
        });
      }
    },
    [onNodeClick]
  );

  const nodeLabel = useCallback((node: GraphData['nodes'][0]) => {
    const etymology = node.etymology;
    if (etymology?.origin) {
      return `${node.word}\n(${etymology.origin.language}: ${etymology.origin.root})`;
    }
    return node.word;
  }, []);

  const nodeColor = useCallback((node: GraphData['nodes'][0]) => {
    const language = node.etymology?.origin?.language?.toLowerCase();
    const colors: Record<string, string> = {
      latin: '#e11d48',
      greek: '#0ea5e9',
      'old english': '#16a34a',
      french: '#8b5cf6',
      german: '#f59e0b',
    };
    return colors[language || ''] || '#64748b';
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-500">
        No words in this session yet.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-slate-900">
      <ForceGraph2D
        graphData={graphData}
        nodeLabel={nodeLabel}
        nodeColor={nodeColor}
        nodeRelSize={8}
        linkColor={() => '#475569'}
        linkWidth={2}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = (node as GraphData['nodes'][0]).word;
          const fontSize = 14 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, node.x || 0, node.y || 0);
        }}
        nodeCanvasObjectMode={() => 'after'}
        width={800}
        height={400}
        backgroundColor="#0f172a"
      />
    </div>
  );
}
