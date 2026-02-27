import { useRef, useEffect, useState, useCallback } from 'react';
import type { Period } from '../types';
import { PERIOD_COLORS, timeToMin, minToTime } from '../utils';

interface TimelineProps {
  periods: Period[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDividerDrag: (idx: number, newStart: string) => void;
  onAddSlot: (atTime: string, slotName: string) => void;
}

const TOTAL_MIN = 24 * 60;
const STEP = 15;
const SNAP_THRESHOLD = 8;
const BAR_H = 48;
const ZONE_TOP = 24;

const SLOT_PRESETS = ['Wake', 'Home', 'Away', 'Sleep'];

function snapWithMagnet(m: number): number {
  const stepped = Math.round(m / STEP) * STEP;
  const nearestHour = Math.round(stepped / 60) * 60;
  if (Math.abs(stepped - nearestHour) <= SNAP_THRESHOLD) return nearestHour;
  return stepped;
}

interface Block {
  period: Period;
  idx: number;
  startMin: number;
  endMin: number;
  isWrap?: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export default function Timeline({
  periods,
  selectedIdx,
  onSelect,
  onDelete,
  onDividerDrag,
  onAddSlot,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [dragTime, setDragTime] = useState<string | null>(null);
  const [dragPct, setDragPct] = useState(0);
  const [hoverDividerIdx, setHoverDividerIdx] = useState<number | null>(null);
  const [addMenuIdx, setAddMenuIdx] = useState<number | null>(null);
  const [addMenuTime, setAddMenuTime] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Close add menu on click outside — use a timeout so the menu click isn't caught
  useEffect(() => {
    if (addMenuIdx === null) return;
    const handler = (e: MouseEvent) => {
      // Don't close if clicking inside the menu
      const target = e.target as HTMLElement;
      if (target.closest('[data-slot-menu]')) return;
      setAddMenuIdx(null);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [addMenuIdx]);

  // Build blocks
  const blocks: Block[] = [];
  const firstStart = timeToMin(periods[0]?.start ?? '00:00');
  const hasWrap = firstStart > 0 && periods.length > 0;

  if (hasWrap) {
    blocks.push({
      period: periods[periods.length - 1], idx: periods.length - 1,
      startMin: 0, endMin: firstStart, isWrap: true, isFirst: true, isLast: false,
    });
  }
  for (let i = 0; i < periods.length; i++) {
    const startMin = timeToMin(periods[i].start);
    const endMin = i < periods.length - 1 ? timeToMin(periods[i + 1].start) : TOTAL_MIN;
    blocks.push({
      period: periods[i], idx: i, startMin, endMin,
      isFirst: !hasWrap && i === 0, isLast: !hasWrap && i === periods.length - 1,
    });
  }
  // If wrap exists, the wrap block is first and the actual last period's main block is last
  if (hasWrap && blocks.length > 1) {
    blocks[blocks.length - 1].isLast = true;
  }

  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / TOTAL_MIN) * 100;

  // Build dividers — one for each period's start time (including the first one if it has a wrap)
  const dividers: { idx: number; pct: number }[] = [];
  for (let i = 0; i < periods.length; i++) {
    const startMin = timeToMin(periods[i].start);
    // Always show a divider except if it's the only period
    if (periods.length > 1) {
      dividers.push({ idx: i, pct: (startMin / TOTAL_MIN) * 100 });
    }
  }

  const handleDividerStart = useCallback(
    (dividerIdx: number, e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAddMenuIdx(null);
      const barRect = barRef.current?.getBoundingClientRect();
      if (!barRect) return;

      // Find neighbors for clamping
      const sorted = periods.map((p, i) => ({ idx: i, min: timeToMin(p.start) })).sort((a, b) => a.min - b.min);
      const pos = sorted.findIndex(s => s.idx === dividerIdx);
      const prevMin = pos > 0 ? sorted[pos - 1].min : (sorted.length > 1 ? sorted[sorted.length - 1].min - TOTAL_MIN : 0);
      const nextMin = pos < sorted.length - 1 ? sorted[pos + 1].min : TOTAL_MIN;
      const minMin = (prevMin < 0 ? 0 : prevMin) + STEP;
      const maxMin = nextMin - STEP;

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
        const pct = Math.max(0, Math.min(1, (cx - barRect.left) / barRect.width));
        let m = snapWithMagnet(Math.round(pct * TOTAL_MIN));
        m = Math.max(minMin, Math.min(maxMin, m));
        const time = minToTime(m);
        setDragTime(time);
        setDragPct((m / TOTAL_MIN) * 100);
        onDividerDrag(dividerIdx, time);
      };

      const onUp = () => {
        setDragTime(null);
        setHoverDividerIdx(null);
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
    [periods, onDividerDrag],
  );

  const handlePlusClick = useCallback(
    (dividerIdx: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Find midpoint before this divider
      const sorted = periods.map((p, i) => ({ idx: i, min: timeToMin(p.start) })).sort((a, b) => a.min - b.min);
      const pos = sorted.findIndex(s => s.idx === dividerIdx);
      const thisMin = sorted[pos].min;
      const prevMin = pos > 0 ? sorted[pos - 1].min : 0;
      const midMin = snapWithMagnet(Math.round((prevMin + thisMin) / 2));
      setAddMenuTime(minToTime(midMin));
      setAddMenuIdx(dividerIdx);
    },
    [periods],
  );

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    if (e.target === barRef.current) onSelect(-1);
  }, [onSelect]);

  return (
    <>
      <div ref={barRef} className="timeline-bar" style={{ overflow: 'visible' }} onClick={handleBarClick}>
        {/* Blocks */}
        {blocks.map((b) => {
          const widthPct = ((b.endMin - b.startMin) / TOTAL_MIN) * 100;
          const showLabel = widthPct > 6;
          const isSelected = !b.isWrap && b.idx === selectedIdx;

          const borderRadius = [
            b.isFirst ? '10px' : '0', b.isLast ? '10px' : '0',
            b.isLast ? '10px' : '0', b.isFirst ? '10px' : '0',
          ].join(' ');

          return (
            <div
              key={b.isWrap ? `wrap-${b.idx}` : `block-${b.idx}`}
              className="timeline-block"
              data-period={b.period.period}
              style={{ width: `${widthPct}%`, flexShrink: 0, borderRadius }}
              onClick={(e) => { e.stopPropagation(); !b.isWrap && onSelect(b.idx); }}
            >
              {showLabel && b.period.period.toUpperCase()}
              {isSelected && periods.length > 1 && (
                <span
                  style={{
                    position: 'absolute', top: 4, right: 6,
                    fontSize: 14, lineHeight: 1,
                    color: 'rgba(0,0,0,0.35)', cursor: 'pointer',
                    padding: '2px 4px', zIndex: 10,
                  }}
                  onClick={(e) => { e.stopPropagation(); onDelete(b.idx); }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'rgba(0,0,0,0.7)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(0,0,0,0.35)'; }}
                >
                  &times;
                </span>
              )}
            </div>
          );
        })}

        {/* Divider zones — one for each period start */}
        {dividers.map(({ idx, pct }) => (
          <div
            key={`divzone-${idx}`}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: -ZONE_TOP,
              height: ZONE_TOP + BAR_H + 8,
              width: 36,
              transform: 'translateX(-50%)',
              zIndex: 8, cursor: 'col-resize',
            }}
            onMouseEnter={() => setHoverDividerIdx(idx)}
            onMouseLeave={() => { if (!dragTime && addMenuIdx !== idx) setHoverDividerIdx(null); }}
            onMouseDown={(e) => {
              // Don't start drag if clicking the + button or menu
              const target = e.target as HTMLElement;
              if (target.closest('[data-plus-btn]') || target.closest('[data-slot-menu]')) return;
              handleDividerStart(idx, e);
            }}
            onTouchStart={(e) => handleDividerStart(idx, e)}
          >
            {/* Handle bar — only visible on hover */}
            {(hoverDividerIdx === idx || dragTime !== null) && (
              <div
                style={{
                  position: 'absolute',
                  top: ZONE_TOP + BAR_H / 2,
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: hoverDividerIdx === idx ? 5 : 3,
                  height: hoverDividerIdx === idx ? 30 : 22,
                  borderRadius: 2,
                  background: hoverDividerIdx === idx ? '#fff' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                  boxShadow: hoverDividerIdx === idx ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* + button — only on hover, not during drag */}
            {hoverDividerIdx === idx && !dragTime && addMenuIdx !== idx && (
              <div
                data-plus-btn
                style={{
                  position: 'absolute', top: 0, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--color-aurora-green)', color: '#000',
                  fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(42,245,152,0.4)',
                  lineHeight: 1, zIndex: 12,
                }}
                onMouseDown={(e) => handlePlusClick(idx, e)}
              >
                +
              </div>
            )}

            {/* Slot picker menu */}
            {addMenuIdx === idx && (
              <div
                data-slot-menu
                style={{
                  position: 'absolute', top: -4, left: '50%',
                  transform: 'translate(-50%, -100%)',
                  background: 'rgba(17,17,17,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, padding: 4,
                  display: 'flex', flexDirection: 'column', gap: 2,
                  minWidth: 110,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 30,
                }}
              >
                {SLOT_PRESETS.map((name) => {
                  const color = PERIOD_COLORS[name.toLowerCase()] ?? '#888';
                  return (
                    <div
                      key={name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8,
                        cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onAddSlot(addMenuTime, name.toLowerCase());
                        setAddMenuIdx(null);
                        setHoverDividerIdx(null);
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
                      {name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Time tooltip */}
        {dragTime && (
          <div
            style={{
              position: 'absolute', left: `${dragPct}%`, top: -44,
              transform: 'translateX(-50%)',
              background: 'var(--color-surface-active)', color: '#fff',
              padding: '5px 12px', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              letterSpacing: 1, whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.15)',
              zIndex: 20, pointerEvents: 'none',
            }}
          >
            {dragTime}
          </div>
        )}

        <div className="timeline-now" style={{ left: `${nowPct}%` }} />
      </div>

      <div className="timeline-hours">
        {[0, 4, 8, 12, 16, 20, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </>
  );
}
