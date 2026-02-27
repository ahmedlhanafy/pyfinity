import { useState, useRef, useCallback } from 'react';
import type { StatusResponse, Unit, HvacMode } from '../types';
import { ft, displayTemp, unitLabel } from '../utils';
import { setTemp } from '../api';
import TemperatureDial from './TemperatureDial';

interface ManualViewProps {
  status: StatusResponse | null;
  unit: Unit;
  mode: HvacMode;
  onModeChange: (mode: HvacMode) => void;
  onManualInteraction: () => void;
}

const BOUNDS = {
  heat: { min: 55, max: 85 },
  cool: { min: 60, max: 90 },
};

const PRESETS = [
  { name: 'Cozy', temp: 72 },
  { name: 'Home', temp: 68 },
  { name: 'Away', temp: 62 },
  { name: 'Sleep', temp: 65 },
];

const DEBOUNCE_MS = 2000;

export default function ManualView({ status, unit, mode, onModeChange, onManualInteraction }: ManualViewProps) {
  const [dialTemp, setDialTemp] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');
  const [activePreset, setActivePreset] = useState<number | null>(68);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { min, max } = BOUNDS[mode];

  // Clamp temp to current mode bounds
  const clamp = (t: number) => Math.max(min, Math.min(max, t));

  const serverTemp = mode === 'heat' ? status?.heat_setpoint : status?.cool_setpoint;
  const displayedTemp = (isDragging || isPending || isApplying) ? dialTemp : (dialTemp ?? serverTemp ?? null);

  const effectiveStatus = (isDragging || isPending || isApplying) ? statusText : (
    status ? (mode === 'heat' ? `Heating to ${ft(serverTemp ?? null, unit)}` : `Cooling to ${ft(serverTemp ?? null, unit)}`) : 'Connecting...'
  );

  const doSend = useCallback(async (temp: number) => {
    setIsPending(false);
    setIsApplying(true);
    setStatusText(`Applying ${displayTemp(temp, unit)}${unitLabel(unit)} (~30s)`);
    try {
      const res = await setTemp(mode, temp, true);
      if (!res.ok) {
        setStatusText('Error setting temperature');
        setIsApplying(false);
      }
      // Keep isApplying=true — it'll clear when the next poll shows the new value
      // or after a timeout
      setTimeout(() => setIsApplying(false), 35000);
    } catch {
      setStatusText('Connection error');
      setIsApplying(false);
    }
  }, [mode, unit]);

  const handleTempChange = useCallback((temp: number) => {
    const clamped = clamp(temp);
    setDialTemp(clamped);
    setStatusText(`Set to ${displayTemp(clamped, unit)}${unitLabel(unit)}`);
    setActivePreset(null);
    setIsPending(true);
    setIsApplying(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSend(clamped), DEBOUNCE_MS);
  }, [unit, doSend, min, max]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    onManualInteraction();
  }, [onManualInteraction]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePreset = useCallback((temp: number) => {
    const clamped = clamp(temp);
    setDialTemp(clamped);
    setActivePreset(temp);
    setIsPending(true);
    setIsApplying(false);
    setStatusText(`Set to ${displayTemp(clamped, unit)}${unitLabel(unit)}`);
    onManualInteraction();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSend(clamped), DEBOUNCE_MS);
  }, [unit, doSend, onManualInteraction, min, max]);

  return (
    <div className="manual-view">
      {/* Left column */}
      <div className="col">
        <div>
          <span className="label">Carrier Infinity Touch</span>
          <h2 style={{ fontWeight: 400, fontSize: 18, marginBottom: 20 }}>
            Indoor {ft(status?.indoor_temp ?? null, unit)}
          </h2>
          <div className="weather-card">
            <span className="label" style={{ marginBottom: 0 }}>Outside</span>
            <div className="weather-value">{ft(status?.outdoor_temp ?? null, unit)}</div>
          </div>
        </div>
        <div className="info-list">
          <div className="info-item">
            <span className="info-label">Heat Setpoint</span>
            <span className="info-val">{ft(status?.heat_setpoint ?? null, unit)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Cool Setpoint</span>
            <span className="info-val">{ft(status?.cool_setpoint ?? null, unit)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Yesterday Energy</span>
            <span className="info-val">{status?.energy_yesterday != null ? `${status.energy_yesterday} kWh` : '--'}</span>
          </div>
        </div>
      </div>

      {/* Center column */}
      <div className="col col-center">
        <span className="label" style={{ position: 'absolute', top: 0 }}>Target Temperature</span>
        <TemperatureDial
          temp={displayedTemp}
          mode={mode}
          isPending={isPending || isApplying}
          statusText={effectiveStatus}
          unit={unit}
          onTempChange={handleTempChange}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <div className="pill-control">
          <div
            className={`pill-segment${mode === 'cool' ? ' active' : ''}`}
            data-mode="cool"
            onClick={() => onModeChange('cool')}
          >Cool</div>
          <div
            className={`pill-segment${mode === 'heat' ? ' active' : ''}`}
            data-mode="heat"
            onClick={() => onModeChange('heat')}
          >Heat</div>
        </div>
      </div>

      {/* Right column */}
      <div className="col">
        <div>
          <span className="label">System Status</span>
          <div className="info-list" style={{ marginTop: 12 }}>
            <div className="info-item">
              <span className="info-label">Mode</span>
              <span className="info-val">{mode === 'heat' ? 'Heat' : 'Cool'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Model</span>
              <span className="info-val">SYSTXCCITN01</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Presets</span>
          {PRESETS.map(p => (
            <button
              key={p.temp}
              className={`preset-btn${activePreset === p.temp ? ' active' : ''}`}
              onClick={() => handlePreset(p.temp)}
            >
              <span>{p.name}</span>
              <span className="preset-temp">{displayTemp(p.temp, unit)}{unitLabel(unit)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
