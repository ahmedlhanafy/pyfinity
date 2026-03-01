import { useCallback } from 'react';
import type { StatusResponse, ScheduleData, ControlMode, Unit } from '../types';
import { setMode } from '../api';
import ScheduleView from './ScheduleView';
import RingConfig from './RingConfig';

interface ModeViewProps {
  status: StatusResponse | null;
  unit: Unit;
  controlMode: ControlMode;
  scheduleData: ScheduleData | null;
  onControlModeChange: (mode: ControlMode) => void;
  onScheduleChange: (data: ScheduleData) => void;
}

const MODE_OPTIONS: { key: ControlMode; label: string }[] = [
  { key: 'manual', label: 'Manual' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'ring', label: 'Follow Ring' },
];

export default function ModeView({
  status, unit, controlMode, scheduleData,
  onControlModeChange, onScheduleChange,
}: ModeViewProps) {
  const handleModeChange = useCallback((mode: ControlMode) => {
    onControlModeChange(mode);
    setMode(mode).catch(() => {});
  }, [onControlModeChange]);

  return (
    <div className="mode-view">
      <div className="mode-pills">
        {MODE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`mode-pill${controlMode === opt.key ? ' active' : ''}`}
            onClick={() => handleModeChange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mode-content">
        {controlMode === 'manual' && (
          <div className="mode-manual-info">
            <div className="mode-info-card">
              <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Manual Mode</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                You're in manual mode. Adjust the temperature from the Home tab.
                The thermostat will hold your set temperature until you change it.
              </p>
            </div>
          </div>
        )}

        {controlMode === 'schedule' && scheduleData && (
          <ScheduleView
            status={status}
            unit={unit}
            scheduleData={scheduleData}
            onScheduleChange={onScheduleChange}
          />
        )}

        {controlMode === 'ring' && (
          <div className="mode-ring-content">
            <RingConfig unit={unit} />
          </div>
        )}
      </div>
    </div>
  );
}
