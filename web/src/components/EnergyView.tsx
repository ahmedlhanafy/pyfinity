import { useState, useEffect } from 'react';
import type { EnergyDay, Settings } from '../types';
import { getEnergy } from '../api';
import EnergyChart from './EnergyChart';

interface EnergyViewProps {
  settings: Settings;
}

type EnergyRange = 'day' | 'week' | 'year';

const RANGE_OPTIONS: { key: EnergyRange; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'year', label: 'Year' },
];

export default function EnergyView({ settings }: EnergyViewProps) {
  const [range, setRange] = useState<EnergyRange>('week');
  const [data, setData] = useState<EnergyDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getEnergy(range)
      .then(res => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="energy-view">
      <div className="energy-range-pills">
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`mode-pill${range === opt.key ? ' active' : ''}`}
            onClick={() => setRange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      ) : (
        <EnergyChart
          data={data}
          range={range}
          costPerKwh={settings.cost_per_kwh}
        />
      )}
    </div>
  );
}
