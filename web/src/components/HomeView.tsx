import { useState, useRef, useCallback } from 'react';
import type { StatusResponse, ScheduleData, Unit, HvacMode, ControlMode } from '../types';
import { ft, displayTemp, unitLabel } from '../utils';
import { setTemp } from '../api';
import TemperatureDial from './TemperatureDial';

interface HomeViewProps {
  status: StatusResponse | null;
  unit: Unit;
  mode: HvacMode;
  controlMode: ControlMode;
  scheduleData: ScheduleData | null;
  onModeChange: (mode: HvacMode) => void;
}

const BOUNDS = {
  heat: { min: 55, max: 85 },
  cool: { min: 60, max: 90 },
};

const DEBOUNCE_MS = 2000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function modeLabel(controlMode: ControlMode, status: StatusResponse | null, sched: ScheduleData | null): string {
  if (controlMode === 'schedule') {
    // Check if Ring integration is overriding
    if (sched?.ring_enabled && status?.ring_mode) {
      const mapping = sched.ring_mapping ?? {};
      const mapped = mapping[status.ring_mode as keyof typeof mapping];
      if (mapped && mapped !== 'none') {
        return `Ring ${cap(status.ring_mode)} → ${cap(mapped)}`;
      }
    }
    const period = status?.active_period;
    return period ? `Schedule — ${cap(period)}` : 'Schedule';
  }
  if (controlMode === 'ring') {
    const ringMode = status?.ring_mode;
    return ringMode ? `Ring — ${cap(ringMode)}` : 'Ring';
  }
  return 'Manual';
}

export default function HomeView({ status, unit, mode, controlMode, scheduleData, onModeChange }: HomeViewProps) {
  const [dialTemp, setDialTemp] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { min, max } = BOUNDS[mode];
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
      const res = await setTemp(mode, temp);
      if (!res.ok) {
        setStatusText('Error setting temperature');
        setIsApplying(false);
      }
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
    setIsPending(true);
    setIsApplying(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSend(clamped), DEBOUNCE_MS);
  }, [unit, doSend, min, max]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

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
        <span className="mode-label">{modeLabel(controlMode, status, scheduleData)}</span>
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

      {/* Right column — system info (no presets) */}
      <div className="col">
        <div>
          <span className="label">System Status</span>
          <div className="info-list" style={{ marginTop: 12 }}>
            <div className="info-item">
              <span className="info-label">Mode</span>
              <span className="info-val">{mode === 'heat' ? 'Heat' : 'Cool'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Control</span>
              <span className="info-val">{modeLabel(controlMode, status, scheduleData)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Model</span>
              <span className="info-val">SYSTXCCITN01</span>
            </div>
          </div>
        </div>
        <div>
          <span className="label">Energy (YTD)</span>
          <div className="info-list" style={{ marginTop: 12 }}>
            <div className="info-item">
              <span className="info-label">Total</span>
              <span className="info-val">{status?.energy_ytd != null ? `${status.energy_ytd} kWh` : '--'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
