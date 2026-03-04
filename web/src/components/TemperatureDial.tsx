import { useRef, useEffect, useCallback, useState } from 'react';
import type { Unit, HvacMode } from '../types';
import { useDialTick } from '../haptics';
import {
  TEMP_MIN,
  TEMP_MAX,
  ARC_START_DEG,
  ARC_SWEEP_DEG,
  HEAT_COLORS,
  COOL_COLORS,
  parseHex,
  tempToAngle,
  angleToTemp,
  displayTemp,
  unitLabel,
} from '../utils';

interface TemperatureDialProps {
  temp: number | null;
  mode: HvacMode;
  isPending: boolean;
  statusText: string;
  unit: Unit;
  onTempChange: (temp: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

// Internal canvas resolution (always draws at this size)
const BASE = 260;
const BASE_CX = 130;
const BASE_CY = 130;
const BASE_R = 110;
const LINE_W = 22;
const SEGMENTS = 100;
const THUMB_BASE = 28;
const ANIM_DURATION = 400;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function getColorStops(colors: string[]): [number, number, number][] {
  return colors.map((c) => parseHex(c));
}

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
  displayColors: [number, number, number][],
  size: number,
) {
  const scale = size / BASE;
  const cx = BASE_CX * scale;
  const cy = BASE_CY * scale;
  const r = BASE_R * scale;
  const lineW = LINE_W * scale;

  const startRad = (ARC_START_DEG * Math.PI) / 180;
  const sweepRad = (ARC_SWEEP_DEG * Math.PI) / 180;
  const segAngle = sweepRad / SEGMENTS;

  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineWidth = lineW;

  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = startRad + i * segAngle;
    const a1 = a0 + segAngle + 0.005;
    const color = displayColors[i];
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.stroke();
  }
}

export default function TemperatureDial({
  temp,
  mode,
  isPending,
  statusText,
  unit,
  onTempChange,
  onDragStart,
  onDragEnd,
}: TemperatureDialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayColorsRef = useRef<[number, number, number][]>([]);
  const animFrameRef = useRef<number>(0);
  const prevModeRef = useRef<HvacMode>(mode);
  const [dragging, setDragging] = useState(false);
  const [dialSize, setDialSize] = useState(BASE);
  const dialTick = useDialTick();

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) {
        const w = wrapRef.current.clientWidth;
        if (w > 0 && w !== dialSize) setDialSize(w);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = dialSize / BASE;
  const cx = BASE_CX * scale;
  const cy = BASE_CY * scale;
  const r = BASE_R * scale;
  const thumbSize = THUMB_BASE * scale;

  // Build target colors for current mode
  const targetStops = mode === 'heat' ? getColorStops(HEAT_COLORS) : getColorStops(COOL_COLORS);
  const buildSegmentColors = useCallback(
    (stops: [number, number, number][]): [number, number, number][] => {
      return Array.from({ length: SEGMENTS }, (_, i) =>
        interpolateGradient(stops, i / (SEGMENTS - 1)),
      );
    },
    [],
  );

  if (displayColorsRef.current.length === 0) {
    displayColorsRef.current = buildSegmentColors(targetStops);
  }

  // Animate gradient on mode change
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;

    const fromColors = displayColorsRef.current.slice();
    const toStops = mode === 'heat' ? getColorStops(HEAT_COLORS) : getColorStops(COOL_COLORS);
    const toColors = buildSegmentColors(toStops);
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = easeInOutQuad(Math.min(elapsed / ANIM_DURATION, 1));

      const current: [number, number, number][] = fromColors.map((from, i) => {
        const to = toColors[i];
        return [
          Math.round(from[0] + (to[0] - from[0]) * t),
          Math.round(from[1] + (to[1] - from[1]) * t),
          Math.round(from[2] + (to[2] - from[2]) * t),
        ];
      });
      displayColorsRef.current = current;

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawArc(ctx, current, dialSize);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [mode, buildSegmentColors, dialSize]);

  // Draw arc on mount, temp change, or resize
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    displayColorsRef.current = buildSegmentColors(targetStops);
    drawArc(ctx, displayColorsRef.current, dialSize);
  }, [temp, buildSegmentColors, targetStops, dialSize]);

  // Compute angle from pointer event relative to dial center
  const angleFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const dx = clientX - (rect.left + cx);
      const dy = clientY - (rect.top + cy);
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      return deg;
    },
    [cx, cy],
  );

  const tempFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const deg = angleFromEvent(clientX, clientY);
      let t = angleToTemp(deg);
      t = Math.max(TEMP_MIN, Math.min(TEMP_MAX, t));
      return t;
    },
    [angleFromEvent],
  );

  const handleArcClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).classList.contains('dial-thumb')) return;
      const t = tempFromEvent(e.clientX, e.clientY);
      onTempChange(t);
    },
    [tempFromEvent, onTempChange],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setDragging(true);
      onDragStart();

      let lastT = temp ?? 0;
      const onMove = (ev: MouseEvent | TouchEvent) => {
        const px = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
        const py = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
        const t = tempFromEvent(px, py);
        if (t !== lastT) dialTick();
        lastT = t;
        onTempChange(t);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        setDragging(false);
        onDragEnd();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    },
    [tempFromEvent, onTempChange, onDragStart, onDragEnd],
  );

  // Thumb position
  let thumbX = cx;
  let thumbY = cy;
  if (temp != null) {
    const angle = (tempToAngle(temp) * Math.PI) / 180;
    thumbX = cx + r * Math.cos(angle);
    thumbY = cy + r * Math.sin(angle);
  }

  return (
    <div
      ref={wrapRef}
      className="dial-container"
      onClick={handleArcClick}
    >
      <canvas
        ref={canvasRef}
        className="dial-canvas"
        width={dialSize}
        height={dialSize}
        style={{ width: dialSize, height: dialSize }}
      />

      <div className="dial-center">
        <div className="temp-large">
          <span>{displayTemp(temp, unit)}</span>
          <span className="unit">{unitLabel(unit)}</span>
        </div>
        <div className="dial-status">{statusText}</div>
      </div>

      {temp != null && (
        <>
          <div
            className={`dial-thumb${isPending ? ' pending' : ''}`}
            style={{
              width: thumbSize,
              height: thumbSize,
              left: thumbX - thumbSize / 2,
              top: thumbY - thumbSize / 2,
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          />
          <div
            className={`dial-tooltip${dragging ? ' visible' : ''}`}
            style={{
              left: thumbX,
              top: thumbY - thumbSize / 2 - 2,
            }}
          >
            {displayTemp(temp, unit)}{unitLabel(unit)}
          </div>
        </>
      )}
    </div>
  );
}
