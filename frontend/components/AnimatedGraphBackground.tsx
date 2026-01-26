'use client';

import { useEffect, useRef, useState } from 'react';

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pulsePhase: number;
  label?: string;
}

interface Link {
  source: number;
  target: number;
  opacity: number;
}

const COLORS = [
  '#6366f1', // indigo (word)
  '#a855f7', // purple (component)
  '#06b6d4', // cyan (derivative)
  '#f59e0b', // amber (root)
  '#e11d48', // rose
  '#0ea5e9', // sky
];

const SAMPLE_WORDS = [
  'philosophy', 'etymology', 'transport', 'abstract',
  'telegraph', 'image', 'photograph', 'telephone',
  'democracy', 'astronomy', 'geography', 'psychology',
  'technology', 'morphology', 'chronicle', 'symphony',
  'metropolis', 'hypothesis', 'synthesis', 'analysis',
];

export default function AnimatedGraphBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const linksRef = useRef<Link[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize nodes
    const nodeCount = Math.min(40, Math.floor((dimensions.width * dimensions.height) / 25000));
    const nodes: Node[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const isLabeledNode = i < SAMPLE_WORDS.length && Math.random() > 0.3;
      nodes.push({
        id: i,
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: isLabeledNode ? 6 + Math.random() * 4 : 3 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        pulsePhase: Math.random() * Math.PI * 2,
        label: isLabeledNode ? SAMPLE_WORDS[i] : undefined,
      });
    }
    nodesRef.current = nodes;

    // Initialize links (connect nearby nodes)
    const links: Link[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const connectCount = 1 + Math.floor(Math.random() * 2);
      const distances: { index: number; dist: number }[] = [];

      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          distances.push({ index: j, dist: Math.sqrt(dx * dx + dy * dy) });
        }
      }

      distances.sort((a, b) => a.dist - b.dist);
      for (let k = 0; k < connectCount && k < distances.length; k++) {
        const existing = links.find(
          l => (l.source === i && l.target === distances[k].index) ||
               (l.source === distances[k].index && l.target === i)
        );
        if (!existing && distances[k].dist < 300) {
          links.push({
            source: i,
            target: distances[k].index,
            opacity: 0.15 + Math.random() * 0.15,
          });
        }
      }
    }
    linksRef.current = links;

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    let lastTime = 0;
    const animate = (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 16, 2);
      lastTime = time;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const mouse = mouseRef.current;

      // Update node positions
      nodes.forEach((node) => {
        // Mouse repulsion
        const dx = node.x - mouse.x;
        const dy = node.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150 * 0.5;
          node.vx += (dx / dist) * force * deltaTime;
          node.vy += (dy / dist) * force * deltaTime;
        }

        // Apply velocity
        node.x += node.vx * deltaTime;
        node.y += node.vy * deltaTime;

        // Boundary bounce with padding
        const padding = 50;
        if (node.x < padding) {
          node.x = padding;
          node.vx *= -0.5;
        }
        if (node.x > dimensions.width - padding) {
          node.x = dimensions.width - padding;
          node.vx *= -0.5;
        }
        if (node.y < padding) {
          node.y = padding;
          node.vy *= -0.5;
        }
        if (node.y > dimensions.height - padding) {
          node.y = dimensions.height - padding;
          node.vy *= -0.5;
        }

        // Friction
        node.vx *= 0.99;
        node.vy *= 0.99;

        // Random drift
        node.vx += (Math.random() - 0.5) * 0.02 * deltaTime;
        node.vy += (Math.random() - 0.5) * 0.02 * deltaTime;

        // Update pulse phase
        node.pulsePhase += 0.02 * deltaTime;
      });

      // Draw links
      links.forEach((link) => {
        const source = nodes[link.source];
        const target = nodes[link.target];

        const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
        gradient.addColorStop(0, source.color + '40');
        gradient.addColorStop(1, target.color + '40');

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Animated particles on links
        const particlePos = (time / 3000 + link.opacity) % 1;
        const px = source.x + (target.x - source.x) * particlePos;
        const py = source.y + (target.y - source.y) * particlePos;

        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#818cf880';
        ctx.fill();
      });

      // Draw nodes
      nodes.forEach((node) => {
        const pulse = Math.sin(node.pulsePhase) * 0.3 + 1;
        const glowRadius = node.radius * 2 * pulse;

        // Glow effect
        const gradient = ctx.createRadialGradient(
          node.x, node.y, node.radius * 0.5,
          node.x, node.y, glowRadius
        );
        gradient.addColorStop(0, node.color + '60');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Label
        if (node.label) {
          ctx.font = '11px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + node.radius + 14);
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [dimensions]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="fixed inset-0 -z-10"
      style={{ background: '#0f172a' }}
    />
  );
}
