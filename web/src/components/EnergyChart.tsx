import type { EnergyDay } from '../types';

interface EnergyChartProps {
  data: EnergyDay[];
  range: 'day' | 'week' | 'year';
  costPerKwh: number;
}

const CATEGORIES = [
  { key: 'hp_heat' as const, label: 'HP Heat', color: '#FF8C00' },
  { key: 'elec_heat' as const, label: 'Elec Heat', color: '#FFD700' },
  { key: 'cooling' as const, label: 'Cooling', color: '#5B9BD5' },
  { key: 'fan' as const, label: 'Fan', color: '#2AF598' },
  { key: 'reheat' as const, label: 'Reheat', color: '#9D7BFF' },
];

function formatDate(date: string, range: 'day' | 'week' | 'year'): string {
  if (range === 'year') {
    // Handles "2025", "2026-YTD", "2026-02" formats
    if (date.includes('YTD')) return date;
    if (date.length === 4) return date;
    if (date.length === 7) {
      const [, month] = date.split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(month) - 1] || date;
    }
    return date;
  }
  const d = new Date(date + 'T12:00:00');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

export default function EnergyChart({ data, range, costPerKwh }: EnergyChartProps) {
  if (data.length === 0) {
    return (
      <div className="energy-chart-empty">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No energy data available</p>
      </div>
    );
  }

  // Calculate totals
  const totalKwh = data.reduce((sum, d) =>
    sum + d.hp_heat + d.cooling + d.elec_heat + d.fan + d.reheat, 0);
  const totalCost = totalKwh * costPerKwh;

  // Max bar height reference
  const maxPerBar = Math.max(...data.map(d =>
    d.hp_heat + d.cooling + d.elec_heat + d.fan + d.reheat), 1);

  return (
    <div className="energy-chart">
      {/* Summary */}
      <div className="energy-summary">
        <div className="energy-summary-item">
          <span className="energy-summary-value">{totalKwh}</span>
          <span className="energy-summary-label">kWh</span>
        </div>
        <div className="energy-summary-item">
          <span className="energy-summary-value">${totalCost.toFixed(2)}</span>
          <span className="energy-summary-label">est. cost</span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="energy-bars">
        {data.map((d, i) => {
          const total = d.hp_heat + d.cooling + d.elec_heat + d.fan + d.reheat;
          const heightPct = (total / maxPerBar) * 100;
          return (
            <div key={d.date || i} className="energy-bar-col">
              <div className="energy-bar-stack" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                {CATEGORIES.map(cat => {
                  const val = d[cat.key];
                  if (val <= 0) return null;
                  const pct = (val / total) * 100;
                  return (
                    <div
                      key={cat.key}
                      className="energy-bar-segment"
                      style={{ height: `${pct}%`, background: cat.color }}
                      title={`${cat.label}: ${val} kWh`}
                    />
                  );
                })}
              </div>
              <span className="energy-bar-total">{total}</span>
              <span className="energy-bar-label">{formatDate(d.date, range)}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="energy-legend">
        {CATEGORIES.map(cat => (
          <div key={cat.key} className="energy-legend-item">
            <span className="energy-legend-dot" style={{ background: cat.color }} />
            <span>{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
