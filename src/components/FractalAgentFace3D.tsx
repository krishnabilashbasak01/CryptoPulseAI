/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Activity,
  Zap,
  Radio,
  Eye,
  Scan,
  ShieldCheck,
  Sparkles,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';

interface FractalAgentFace3DProps {
  isCrossed: boolean;
  crossType?: 'HIGH_CROSSED' | 'LOW_CROSSED' | 'INSIDE_RANGE';
  levelDescription?: string;
  selectedSymbol: string;
  timeframe: string;
  compact?: boolean;
}

// 3D Point definition
type Point3D = [number, number, number];

// Android Face 3D Mesh Vertices (Normalized -1 to 1 space)
const FACE_VERTICES: Record<string, Point3D> = {
  // Cranium & Crown
  crown: [0, 1.45, -0.2],
  crownL: [-0.6, 1.35, -0.1],
  crownR: [0.6, 1.35, -0.1],
  foreheadTop: [0, 1.15, 0.45],
  foreheadL: [-0.7, 1.05, 0.4],
  foreheadR: [0.7, 1.05, 0.4],

  // Temples & Head Sides
  templeL: [-1.05, 0.75, 0.05],
  templeR: [1.05, 0.75, 0.05],
  sideHeadL: [-1.15, 0.2, -0.25],
  sideHeadR: [1.15, 0.2, -0.25],

  // Brow & Forehead Center
  browCenter: [0, 0.65, 0.85],
  browInnerL: [-0.35, 0.65, 0.8],
  browInnerR: [0.35, 0.65, 0.8],
  browOuterL: [-0.85, 0.6, 0.6],
  browOuterR: [0.85, 0.6, 0.6],

  // Eyes (Outer Sockets)
  eyeOuterL: [-0.8, 0.35, 0.65],
  eyeInnerL: [-0.25, 0.35, 0.8],
  eyeTopL: [-0.52, 0.48, 0.75],
  eyeBottomL: [-0.52, 0.22, 0.75],

  eyeOuterR: [0.8, 0.35, 0.65],
  eyeInnerR: [0.25, 0.35, 0.8],
  eyeTopR: [0.52, 0.48, 0.75],
  eyeBottomR: [0.52, 0.22, 0.75],

  // Eye Pupils (Internal focal points)
  pupilL: [-0.52, 0.35, 0.77],
  pupilR: [0.52, 0.35, 0.77],

  // Nose Bridge & Tip
  noseBridge: [0, 0.4, 0.95],
  noseTip: [0, -0.05, 1.15],
  noseBaseL: [-0.25, -0.15, 0.9],
  noseBaseR: [0.25, -0.15, 0.9],

  // Cheeks
  cheekL: [-0.95, 0.05, 0.55],
  cheekR: [0.95, 0.05, 0.55],
  cheekLowerL: [-0.75, -0.4, 0.65],
  cheekLowerR: [0.75, -0.4, 0.65],

  // Mouth & Acoustic Voice Grille
  mouthTop: [0, -0.38, 0.95],
  mouthBottom: [0, -0.58, 0.9],
  mouthL: [-0.45, -0.48, 0.8],
  mouthR: [0.45, -0.48, 0.8],

  // Jaw & Chin
  chinTop: [0, -0.85, 0.9],
  chinTip: [0, -1.2, 0.85],
  chinL: [-0.35, -1.15, 0.75],
  chinR: [0.35, -1.15, 0.75],
  jawCornerL: [-0.9, -0.55, 0.05],
  jawCornerR: [0.9, -0.55, 0.05],

  // Back of Skull & Neck mount
  backL: [-0.85, 0.5, -0.8],
  backR: [0.85, 0.5, -0.8],
  neckCenter: [0, -1.35, -0.2],
};

// Edge lines connecting vertices
const FACE_EDGES: Array<[string, string]> = [
  // Crown & Forehead
  ['crown', 'crownL'],
  ['crown', 'crownR'],
  ['crownL', 'foreheadL'],
  ['crownR', 'foreheadR'],
  ['crown', 'foreheadTop'],
  ['foreheadTop', 'foreheadL'],
  ['foreheadTop', 'foreheadR'],
  ['foreheadTop', 'browCenter'],
  ['foreheadL', 'browOuterL'],
  ['foreheadR', 'browOuterR'],
  ['foreheadL', 'templeL'],
  ['foreheadR', 'templeR'],

  // Brows
  ['browOuterL', 'browInnerL'],
  ['browInnerL', 'browCenter'],
  ['browCenter', 'browInnerR'],
  ['browInnerR', 'browOuterR'],

  // Eye Sockets Left
  ['browInnerL', 'eyeTopL'],
  ['eyeTopL', 'eyeOuterL'],
  ['eyeOuterL', 'eyeBottomL'],
  ['eyeBottomL', 'eyeInnerL'],
  ['eyeInnerL', 'eyeTopL'],

  // Eye Sockets Right
  ['browInnerR', 'eyeTopR'],
  ['eyeTopR', 'eyeOuterR'],
  ['eyeOuterR', 'eyeBottomR'],
  ['eyeBottomR', 'eyeInnerR'],
  ['eyeInnerR', 'eyeTopR'],

  // Nose Structure
  ['browCenter', 'noseBridge'],
  ['noseBridge', 'noseTip'],
  ['noseTip', 'noseBaseL'],
  ['noseTip', 'noseBaseR'],
  ['eyeInnerL', 'noseBridge'],
  ['eyeInnerR', 'noseBridge'],
  ['noseBaseL', 'noseBaseR'],

  // Cheeks & Face Contour
  ['templeL', 'sideHeadL'],
  ['templeR', 'sideHeadR'],
  ['eyeOuterL', 'cheekL'],
  ['eyeOuterR', 'cheekR'],
  ['cheekL', 'cheekLowerL'],
  ['cheekR', 'cheekLowerR'],
  ['cheekL', 'jawCornerL'],
  ['cheekR', 'jawCornerR'],
  ['sideHeadL', 'jawCornerL'],
  ['sideHeadR', 'jawCornerR'],

  // Mouth / Acoustic Grille
  ['noseTip', 'mouthTop'],
  ['mouthTop', 'mouthL'],
  ['mouthTop', 'mouthR'],
  ['mouthL', 'mouthBottom'],
  ['mouthR', 'mouthBottom'],
  ['mouthL', 'mouthR'], // Horizontal separator

  // Jaw & Chin
  ['mouthBottom', 'chinTop'],
  ['chinTop', 'chinL'],
  ['chinTop', 'chinR'],
  ['chinL', 'chinTip'],
  ['chinR', 'chinTip'],
  ['cheekLowerL', 'chinL'],
  ['cheekLowerR', 'chinR'],
  ['jawCornerL', 'chinL'],
  ['jawCornerR', 'chinR'],
  ['chinTip', 'neckCenter'],
  ['jawCornerL', 'neckCenter'],
  ['jawCornerR', 'neckCenter'],
];

export const FractalAgentFace3D: React.FC<FractalAgentFace3DProps> = ({
  isCrossed,
  crossType = 'INSIDE_RANGE',
  levelDescription = 'Scanning 4H Fractal Levels',
  selectedSymbol,
  timeframe,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // User interactive rotation control
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [manualRotation, setManualRotation] = useState<{ yaw: number; pitch: number }>({
    yaw: 0,
    pitch: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating particles
  const particles = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      x: (Math.random() - 0.5) * 3.5,
      y: (Math.random() - 0.5) * 3.5,
      z: (Math.random() - 0.5) * 2.5,
      speed: 0.015 + Math.random() * 0.02,
      radius: 1 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  // Mouse move tracking for natural eye/head look-at
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5;

    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setManualRotation((prev) => ({
        yaw: prev.yaw + dx * 0.01,
        pitch: Math.max(-0.6, Math.min(0.6, prev.pitch + dy * 0.01)),
      }));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      setManualRotation({
        yaw: nx * 0.6,
        pitch: -ny * 0.4,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.02;

      // Handle High-DPI Canvas scaling
      const width = canvas.clientWidth || 240;
      const height = canvas.clientHeight || 200;
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const focalLength = compact ? 130 : 160;
      const cameraDistance = 3.8;

      // Head Animation:
      // When crossed/active, head scans faster and more alertly
      const baseSpeed = isCrossed ? 0.04 : 0.018;
      const naturalYaw = Math.sin(time * baseSpeed) * (isCrossed ? 0.35 : 0.18);
      const naturalPitch = Math.cos(time * baseSpeed * 0.7) * (isCrossed ? 0.18 : 0.08);

      const totalYaw = naturalYaw + manualRotation.yaw;
      const totalPitch = naturalPitch + manualRotation.pitch;
      const totalRoll = Math.sin(time * 0.015) * 0.04;

      // Color scheme based on agent state
      const isHighSweep = crossType === 'HIGH_CROSSED';
      const isLowSweep = crossType === 'LOW_CROSSED';

      const primaryColor = isCrossed
        ? isHighSweep
          ? '#f43f5e' // Rose/Red alert for 4H High Sweep (Short watch)
          : '#10b981' // Emerald alert for 4H Low Sweep (Long watch)
        : '#0ea5e9'; // Cool Sky-cyan for Standby

      const secondaryColor = isCrossed ? '#38bdf8' : '#6366f1';
      const glowColor = isCrossed ? primaryColor : '#06b6d4';

      // 3D Rotation helper
      const project = (point: Point3D): { u: number; v: number; z: number; scale: number } => {
        let [x, y, z] = point;

        // Yaw (Y axis)
        const cosY = Math.cos(totalYaw);
        const sinY = Math.sin(totalYaw);
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;

        // Pitch (X axis)
        const cosP = Math.cos(totalPitch);
        const sinP = Math.sin(totalPitch);
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;

        // Roll (Z axis)
        const cosR = Math.cos(totalRoll);
        const sinR = Math.sin(totalRoll);
        const x3 = x1 * cosR - y2 * sinR;
        const y3 = x1 * sinR + y2 * cosR;

        // Perspective division
        const zDepth = cameraDistance - z2;
        const scale = focalLength / Math.max(0.5, zDepth);
        const u = centerX + x3 * scale;
        const v = centerY - y3 * scale; // inverted Y for screen coords

        return { u, v, z: z2, scale };
      };

      // 1. Draw Orbiting 3D Cybernetic Rings (Radar Gyroscope)
      const ringCount = 2;
      for (let r = 0; r < ringCount; r++) {
        ctx.beginPath();
        const ringAngle = time * (isCrossed ? 1.5 : 0.6) + (r * Math.PI) / ringCount;
        const ringRadius = 1.65 + r * 0.15;
        const segments = 32;

        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const rx = Math.cos(theta) * ringRadius;
          const ry = Math.sin(theta) * ringRadius * 0.35;
          const rz = Math.sin(theta + ringAngle) * 0.9;
          const pt = project([rx, ry, rz]);

          if (i === 0) ctx.moveTo(pt.u, pt.v);
          else ctx.lineTo(pt.u, pt.v);
        }

        ctx.strokeStyle = isCrossed ? `${primaryColor}40` : `${secondaryColor}25`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 2. Draw Floating 3D Data Particles
      particles.forEach((p, idx) => {
        const orbitSpeed = isCrossed ? p.speed * 2.2 : p.speed;
        const angle = time * orbitSpeed + p.phase;
        const px = Math.cos(angle) * (1.8 + Math.sin(p.phase) * 0.4);
        const py = p.y + Math.sin(time * 0.03 + idx) * 0.2;
        const pz = Math.sin(angle) * 1.4;

        const pt = project([px, py, pz]);
        const alpha = Math.max(0.15, Math.min(0.8, (pt.z + 1.2) / 2.4));

        ctx.beginPath();
        ctx.arc(pt.u, pt.v, Math.max(0.8, p.radius * (pt.scale / 120)), 0, Math.PI * 2);
        ctx.fillStyle = isCrossed
          ? `rgba(244, 63, 94, ${alpha})`
          : `rgba(56, 189, 248, ${alpha})`;
        ctx.fill();
      });

      // 3. Project all Face Vertices
      const projectedVertices: Record<string, { u: number; v: number; z: number; scale: number }> =
        {};
      for (const [key, v3d] of Object.entries(FACE_VERTICES)) {
        projectedVertices[key] = project(v3d);
      }

      // 4. Draw 3D Face Wireframe Edges
      ctx.lineWidth = 1.25;
      ctx.shadowBlur = isCrossed ? 8 : 4;
      ctx.shadowColor = glowColor;

      FACE_EDGES.forEach(([v1Key, v2Key]) => {
        const p1 = projectedVertices[v1Key];
        const p2 = projectedVertices[v2Key];
        if (!p1 || !p2) return;

        // Front vs back edge alpha fading
        const avgZ = (p1.z + p2.z) / 2;
        const depthAlpha = Math.max(0.2, Math.min(0.9, (avgZ + 1.2) / 2.2));

        ctx.beginPath();
        ctx.moveTo(p1.u, p1.v);
        ctx.lineTo(p2.u, p2.v);
        ctx.strokeStyle = isCrossed
          ? `rgba(${isHighSweep ? '244, 63, 94' : '16, 185, 129'}, ${depthAlpha})`
          : `rgba(14, 165, 233, ${depthAlpha * 0.8})`;
        ctx.stroke();
      });

      // Reset shadow for subsequent elements
      ctx.shadowBlur = 0;

      // 5. Active Laser Scanning Plane (Traverses up & down the face)
      const scanPhase = (time * (isCrossed ? 1.6 : 0.8)) % 3;
      const scanY = 1.2 - scanPhase; // moves from +1.2 down to -1.8
      const scanLineP1 = project([-1.1, scanY, 0.4]);
      const scanLineP2 = project([1.1, scanY, 0.4]);

      const grad = ctx.createLinearGradient(scanLineP1.u, scanLineP1.v, scanLineP2.u, scanLineP2.v);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.5, isCrossed ? `${primaryColor}cc` : 'rgba(56, 189, 248, 0.8)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.beginPath();
      ctx.moveTo(scanLineP1.u, scanLineP1.v);
      ctx.lineTo(scanLineP2.u, scanLineP2.v);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 6. Glowing Cybernetic Eyes with Active Darting pupils
      const pupilL = projectedVertices['pupilL'];
      const pupilR = projectedVertices['pupilR'];

      if (pupilL && pupilR) {
        // Eye Darting Offset (Agent scanning candlesticks)
        const eyeDartX = Math.sin(time * (isCrossed ? 2.5 : 0.8)) * 3;
        const eyeDartY = Math.cos(time * 0.5) * 1.5;

        [pupilL, pupilR].forEach((p) => {
          // Eye Outer Glow Ring
          ctx.beginPath();
          ctx.arc(p.u + eyeDartX, p.v + eyeDartY, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = isCrossed
            ? `rgba(${isHighSweep ? '244, 63, 94' : '16, 185, 129'}, 0.3)`
            : 'rgba(56, 189, 248, 0.25)';
          ctx.fill();

          // Eye Core Pupil (Intense illumination)
          ctx.beginPath();
          ctx.arc(p.u + eyeDartX, p.v + eyeDartY, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 10;
          ctx.shadowColor = primaryColor;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Scanning Reticle Crosshairs if Crossed / Active
          if (isCrossed) {
            ctx.strokeStyle = `${primaryColor}aa`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.u + eyeDartX - 7, p.v + eyeDartY);
            ctx.lineTo(p.u + eyeDartX + 7, p.v + eyeDartY);
            ctx.moveTo(p.u + eyeDartX, p.v + eyeDartY - 7);
            ctx.lineTo(p.u + eyeDartX, p.v + eyeDartY + 7);
            ctx.stroke();
          }
        });
      }

      // 7. Acoustic Voice / Thinking Modulator Grille
      const mouthL = projectedVertices['mouthL'];
      const mouthR = projectedVertices['mouthR'];
      if (mouthL && mouthR) {
        const barCount = 5;
        for (let b = 0; b < barCount; b++) {
          const tFrac = b / (barCount - 1);
          const bx = mouthL.u + (mouthR.u - mouthL.u) * tFrac;
          const by = mouthL.v + (mouthR.v - mouthL.v) * tFrac;
          const barHeight = 2 + Math.abs(Math.sin(time * 3 + b)) * (isCrossed ? 5 : 2.5);

          ctx.beginPath();
          ctx.moveTo(bx, by - barHeight);
          ctx.lineTo(bx, by + barHeight);
          ctx.strokeStyle = isCrossed ? primaryColor : '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isCrossed, crossType, manualRotation, compact, particles]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsDragging(false);
      }}
      className={`relative select-none overflow-hidden rounded-xl border transition-all duration-300 ${
        isCrossed
          ? 'bg-gradient-to-b from-rose-950/40 via-slate-950/90 to-slate-900 border-rose-500/60 shadow-xl shadow-rose-950/30'
          : 'bg-gradient-to-b from-sky-950/30 via-slate-950/90 to-slate-900 border-sky-800/50 shadow-lg shadow-sky-950/20'
      }`}
    >
      {/* Background Hologram Hex Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#0284c7_1px,transparent_1px)] [background-size:16px_16px] opacity-15 pointer-events-none" />

      {/* Top Telemetry Header */}
      <div className="relative z-10 flex items-center justify-between p-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isCrossed ? 'bg-rose-500 animate-ping' : 'bg-sky-400 animate-pulse'
            }`}
          />
          <span className="text-xs font-mono font-bold text-white tracking-wider flex items-center gap-1.5">
            <span>WF-4H SWEEP AGENT</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
              v6.2
            </span>
          </span>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isCrossed
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse'
                : 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
            }`}
          >
            {isCrossed ? (
              <>
                <Zap className="w-3 h-3 text-rose-400" />
                <span>SWEEP TRIGGERED</span>
              </>
            ) : (
              <>
                <Radio className="w-3 h-3 text-sky-400 animate-spin" />
                <span>STANDBY HUNTING</span>
              </>
            )}
          </span>

          <button
            type="button"
            onClick={() => setManualRotation({ yaw: 0, pitch: 0 })}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Reset Head Orientation"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 3D Canvas Canvas Viewport */}
      <div className="relative flex items-center justify-center p-1">
        <canvas
          ref={canvasRef}
          className="w-full h-44 cursor-grab active:cursor-grabbing"
          style={{ width: '100%', height: '176px' }}
        />

        {/* Dynamic HUD Overlays */}
        <div className="absolute top-2 left-3 pointer-events-none text-[9px] font-mono text-slate-400/90 space-y-0.5">
          <div className="flex items-center gap-1">
            <Scan className="w-2.5 h-2.5 text-sky-400" />
            <span>PAIR: {selectedSymbol}</span>
          </div>
          <div>TF: 4H + {timeframe}</div>
          <div className="text-slate-500">ENGINE: PINE SCRIPT v6</div>
        </div>

        <div className="absolute top-2 right-3 pointer-events-none text-right text-[9px] font-mono text-slate-400/90 space-y-0.5">
          <div className="flex items-center justify-end gap-1">
            <Activity className="w-2.5 h-2.5 text-emerald-400" />
            <span>FPS: 60 · 0ms</span>
          </div>
          <div className="text-emerald-400 font-semibold">MATH: 100% DETERMINISTIC</div>
          <div className="text-slate-500">AI TOKENS: 0 CR</div>
        </div>

        {/* Interactive Mouse Hint */}
        {isHovered && !isDragging && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none px-2 py-0.5 rounded bg-black/70 border border-slate-700 text-[9px] font-mono text-slate-300 animate-fade-in">
            Move mouse to direct gaze · Drag to tilt in 3D
          </div>
        )}
      </div>

      {/* Active Thought / Diagnostic Stream */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/70 text-[11px] font-mono space-y-1.5">
        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 font-sans font-semibold text-xs text-slate-200">
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>Agent Cognitive Stream</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {isCrossed ? 'PRIORITY: REAL-TIME' : 'POLLING: ACTIVE'}
          </span>
        </div>

        <div
          className={`p-2 rounded border text-[11px] leading-relaxed ${
            isCrossed
              ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}
        >
          {isCrossed ? (
            <div className="flex items-start gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400 mt-1 shrink-0 animate-ping" />
              <div>
                <strong className="text-white">Active Sweep Alert:</strong> {levelDescription}.
                Scanning latest {timeframe} candles for reversal engulfing candle pattern to issue trade signal!
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1 shrink-0" />
              <div>
                <strong>Standby Watch:</strong> Price is oscillating inside 4H Williams Fractal boundary ($
                {levelDescription}). Agent is continuously monitoring liquidity frontiers.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
