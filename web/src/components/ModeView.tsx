import { useCallback } from 'react';
import type { StatusResponse, ScheduleData, ControlMode, Unit } from '../types';
import { setMode } from '../api';
import ScheduleView from './ScheduleView';

interface ModeViewProps {
  status: StatusResponse | null;
  unit: Unit;
  controlMode: ControlMode;
  scheduleData: ScheduleData | null;
  onControlModeChange: (mode: ControlMode) => void;
  onScheduleChange: (data: ScheduleData) => void;
}

export default function ModeView({
  status, unit, controlMode, scheduleData,
  onControlModeChange, onScheduleChange,
}: ModeViewProps) {
  const isScheduleOn = controlMode === 'schedule' || controlMode === 'ring';

  const handleToggle = useCallback(() => {
    const newMode: ControlMode = isScheduleOn ? 'manual' : 'schedule';
    onControlModeChange(newMode);
    setMode(newMode).catch(() => {});
  }, [isScheduleOn, onControlModeChange]);

  return (
    <div className="mode-view">
      <div className="schedule-toggle-bar">
        <span style={{ fontSize: 15, fontWeight: 500 }}>Schedule</span>
        <button
          className={`toggle-switch${isScheduleOn ? ' on' : ''}`}
          onClick={handleToggle}
          aria-label="Toggle schedule"
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      <div className="mode-content">
        {isScheduleOn && scheduleData ? (
          <ScheduleView
            status={status}
            unit={unit}
            scheduleData={scheduleData}
            onScheduleChange={onScheduleChange}
          />
        ) : (
          <div className="mode-manual-info">
            <div className="mode-info-card">
              <h3 style={{ fontWeight: 400, marginBottom: 8 }}>Manual Mode</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                Schedule is off. Adjust the temperature from the Home tab.
                The thermostat will hold your set temperature until you change it.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
