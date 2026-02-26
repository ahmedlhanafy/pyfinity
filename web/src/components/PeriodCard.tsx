import type { Period, Unit } from '../types';
import { PERIOD_COLORS, displayTemp, unitLabel } from '../utils';

interface PeriodCardProps {
  period: Period;
  isSelected: boolean;
  unit: Unit;
  onClick: () => void;
}

export default function PeriodCard({
  period,
  isSelected,
  unit,
  onClick,
}: PeriodCardProps) {
  const color = PERIOD_COLORS[period.period] ?? '#888';
  const name = period.period.charAt(0).toUpperCase() + period.period.slice(1);

  return (
    <div
      className={`sched-period-card${isSelected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <div className="sched-card-header">
        <span className="sched-period-dot" style={{ background: color }} />
        <span className="sched-period-name">{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {period.start}
        </span>
      </div>
      <div className="sched-card-temps">
        <div className="sched-card-temp">
          Heat <strong>{displayTemp(period.heat, unit)}</strong>
          <span className="temp-unit">{unitLabel(unit)}</span>
        </div>
        <div className="sched-card-temp">
          Cool <strong>{displayTemp(period.cool, unit)}</strong>
          <span className="temp-unit">{unitLabel(unit)}</span>
        </div>
      </div>
    </div>
  );
}
