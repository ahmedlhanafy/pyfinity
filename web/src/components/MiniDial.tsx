import { useRef, useEffect, useCallback } from 'react';
import type { Unit, HvacMode } from '../types';
import {
  ARC_START_DEG,
  ARC_SWEEP_DEG,
  HEAT_COLORS,
  COOL_COLORS,
  parseHex,
  tempToAngle,
  angleToTemp,
  displayTemp,
} from '../utils';

interface MiniDialProps {
  temp: number;
  mode: HvacMode;
  unit: Unit;
  min: number;
  max: number;
  onTempChange: (temp: number) => void;
}

const SIZE = 160;
const CX = 80;
const CY = 80;
const R = 65;
const LINE_W = 14;
const SEGMENTS = 60;
const THUMB_SIZE = 20;

function interpolateGradient(
  stops: [number, number, number][],
  t: number,
): [number, number, number] {
  const pos = t * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  const frac = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  colors: string[],
) {
  const startRad = (ARC_START_DEG * Math.PI) / 180;
  const sweepRad = (ARC_SWEEP_DEG * Math.PI) / 180;
  const segAngle = sweepRad / SEGMENTS;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.lineCap = 'round';
  ctx.lineWidth = LINE_W;

  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = startRad + i * segAngle;
    const a1 = a0 + segAngle + 0.005;
    ctx.beginPath();
    ctx.arc(CX, CY, R, a0, a1);
    ctx.strokeStyle = colors[i];
    ctx.stroke();
  }
}

export default function MiniDial({
  temp,
  mode,
  unit,
  min,
  max,
  onTempChange,
}: MiniDialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Build segment colors
  const stops = (mode === 'heat' ? HEAT_COLORS : COOL_COLORS).map((c) => parseHex(c));
  const segColors = Array.from({ length: SEGMENTS }, (_, i) => {
    const [r, g, b] = interpolateGradient(stops, i / (SEGMENTS - 1));
    return `rgb(${r},${g},${b})`;
  });

  // Draw on mount / mode / temp change
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawArc(ctx, segColors);
  });

  const tempFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return temp;
      const dx = clientX - (rect.left + CX);
      const dy = clientY - (rect.top + CY);
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      let t = angleToTemp(deg);
      t = Math.max(min, Math.min(max, t));
      return t;
    },
    [temp, min, max],
  );

  const handleArcClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).classList.contains('mini-dial-thumb')) return;
      onTempChange(tempFromEvent(e.clientX, e.clientY));
    },
    [tempFromEvent, onTempChange],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();

      let lastT = temp;
      const onMove = (ev: MouseEvent | TouchEvent) => {
        const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
        const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
        const t = tempFromEvent(cx, cy);
        if (t !== lastT && navigator.vibrate) navigator.vibrate(4);
        lastT = t;
        onTempChange(t);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    },
    [tempFromEvent, onTempChange],
  );

  // Thumb position
  const angle = (tempToAngle(temp) * Math.PI) / 180;
  const thumbX = CX + R * Math.cos(angle);
  const thumbY = CY + R * Math.sin(angle);

  const label = mode === 'heat' ? 'Heat' : 'Cool';

  return (
    <div
      ref={wrapRef}
      className="mini-dial-container"
      onClick={handleArcClick}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, position: 'absolute' }}
      />

      <div className="mini-dial-center">
        <div className="mini-dial-temp">{displayTemp(temp, unit)}</div>
        <div className="mini-dial-label">
          {label} {unit === 'F' ? '°F' : '°C'}
        </div>
      </div>

      <div
        className="mini-dial-thumb"
        style={{
          left: thumbX - THUMB_SIZE / 2,
          top: thumbY - THUMB_SIZE / 2,
        }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      />
    </div>
  );
}
