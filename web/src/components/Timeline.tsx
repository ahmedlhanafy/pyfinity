import { useRef, useEffect, useState, useCallback } from 'react';
import type { Period, Unit } from '../types';
import { PERIOD_COLORS, timeToMin, minToTime } from '../utils';

interface TimelineProps {
  periods: Period[];
  selectedIdx: number;
  unit: Unit;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDividerDrag: (idx: number, newStart: string) => void;
}

const TOTAL_MIN = 24 * 60;
const HOUR_LABELS = [0, 4, 8, 12, 16, 20, 24];
const SNAP = 15; // snap to 15-minute increments

function snap15(m: number): number {
  return Math.round(m / SNAP) * SNAP;
}

export default function Timeline({
  periods,
  selectedIdx,
  unit: _unit,
  onSelect,
  onDelete,
  onDividerDrag,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Update now indicator every 60s
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Compute block positions (percentage of 24h)
  const blocks = periods.map((p, i) => {
    const startMin = timeToMin(p.start);
    const endMin = i < periods.length - 1 ? timeToMin(periods[i + 1].start) : TOTAL_MIN;
    // Handle wrap-around for last period
    const duration = endMin > startMin ? endMin - startMin : TOTAL_MIN - startMin + endMin;
    return {
      period: p,
      idx: i,
      startPct: (startMin / TOTAL_MIN) * 100,
      widthPct: (duration / TOTAL_MIN) * 100,
    };
  });

  // If first period doesn't start at 00:00, prepend a wrapped block for the last period
  const firstStart = timeToMin(periods[0]?.start ?? '00:00');
  const wrapBlock =
    firstStart > 0 && periods.length > 0
      ? {
          period: periods[periods.length - 1],
          idx: periods.length - 1,
          startPct: 0,
          widthPct: (firstStart / TOTAL_MIN) * 100,
          isWrap: true,
        }
      : null;

  // Now indicator position
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowPct = (nowMin / TOTAL_MIN) * 100;

  // Divider drag handler
  const handleDividerStart = useCallback(
    (dividerIdx: number, e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const barRect = barRef.current?.getBoundingClientRect();
      if (!barRect) return;

      // Compute clamping bounds: between previous period start + 15 and next period start - 15
      const prevStart = timeToMin(periods[dividerIdx - 1]?.start ?? '00:00');
      const nextStart =
        dividerIdx < periods.length - 1
          ? timeToMin(periods[dividerIdx + 1].start)
          : TOTAL_MIN;
      const minMin = prevStart + SNAP;
      const maxMin = nextStart - SNAP;

      const onMove = (ev: MouseEvent | TouchEvent) => {
        const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
        const relX = cx - barRect.left;
        const pct = Math.max(0, Math.min(1, relX / barRect.width));
        let m = snap15(Math.round(pct * TOTAL_MIN));
        m = Math.max(minMin, Math.min(maxMin, m));
        onDividerDrag(dividerIdx, minToTime(m));
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
    [periods, onDividerDrag],
  );

  const renderBlock = (
    b: { period: Period; idx: number; startPct: number; widthPct: number; isWrap?: boolean },
  ) => {
    const color = PERIOD_COLORS[b.period.period] ?? '#888';
    const showLabel = b.widthPct > 6;
    const isSelected = b.idx === selectedIdx;

    return (
      <div
        key={b.isWrap ? `wrap-${b.idx}` : `block-${b.idx}`}
        className={`timeline-block${isSelected ? ' selected' : ''}`}
        data-period={b.period.period}
        style={{
          position: 'absolute',
          left: `${b.startPct}%`,
          width: `${b.widthPct}%`,
          height: '100%',
          backgroundColor: color,
          opacity: isSelected ? 1 : 0.7,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onClick={() => onSelect(b.idx)}
        onMouseEnter={() => setHoverIdx(b.idx)}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {showLabel && (
          <span
            style={{
              position: 'absolute',
              left: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#fff',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {b.period.period}
          </span>
        )}

        {/* Delete button on hover */}
        {periods.length > 1 && hoverIdx === b.idx && (
          <button
            className={`block-delete${periods.length <= 1 ? ' no-delete' : ''}`}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.5)',
              color: '#fff',
              fontSize: 10,
              lineHeight: '16px',
              textAlign: 'center',
              cursor: 'pointer',
              padding: 0,
              zIndex: 3,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(b.idx);
            }}
          >
            X
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="timeline-wrap">
      <div
        ref={barRef}
        className="timeline-bar"
        style={{ position: 'relative', height: 48, borderRadius: 8, overflow: 'hidden' }}
      >
        {/* Wrap-around block */}
        {wrapBlock && renderBlock(wrapBlock)}

        {/* Period blocks */}
        {blocks.map((b) => renderBlock(b))}

        {/* Divider handles (not before first period) */}
        {periods.slice(1).map((p, i) => {
          const idx = i + 1;
          const pct = (timeToMin(p.start) / TOTAL_MIN) * 100;
          return (
            <div
              key={`div-${idx}`}
              className="timeline-divider"
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                width: 12,
                height: '100%',
                transform: 'translateX(-50%)',
                cursor: 'col-resize',
                zIndex: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseDown={(e) => handleDividerStart(idx, e)}
              onTouchStart={(e) => handleDividerStart(idx, e)}
            >
              <div
                style={{
                  width: 3,
                  height: 24,
                  borderRadius: 2,
                  background: 'rgba(255,255,255,0.8)',
                }}
              />
            </div>
          );
        })}

        {/* Now indicator */}
        <div
          className="timeline-now"
          style={{
            position: 'absolute',
            left: `${nowPct}%`,
            top: 0,
            width: 2,
            height: '100%',
            background: '#fff',
            zIndex: 5,
            pointerEvents: 'none',
            animation: 'pulse-now 2s ease-in-out infinite',
          }}
        />
      </div>

      {/* Hour labels */}
      <div
        className="timeline-hours"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontSize: 10,
          opacity: 0.5,
        }}
      >
        {HOUR_LABELS.map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}
