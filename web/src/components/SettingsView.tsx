import { useState, useEffect, useCallback, useRef } from 'react';
import type { Unit, Theme, RingStatus, ScheduleData, RingMapping } from '../types';
import { getSettings, saveSettings, getRingStatus, saveSchedule as apiSaveSchedule } from '../api';
import { PERIOD_COLORS } from '../utils';

const SLOT_OPTIONS = [
  { name: 'Wake', key: 'wake' },
  { name: 'Home', key: 'home' },
  { name: 'Away', key: 'away' },
  { name: 'Sleep', key: 'sleep' },
];

const RING_MODES: { key: keyof RingMapping; label: string }[] = [
  { key: 'disarmed', label: 'Disarmed' },
  { key: 'home', label: 'Home' },
  { key: 'away', label: 'Away' },
];

const DEFAULT_RING_MAPPING: RingMapping = {
  disarmed: 'home',
  home: 'home',
  away: 'away',
};

interface SettingsViewProps {
  unit: Unit;
  theme: Theme;
  isConnected: boolean;
  scheduleData: ScheduleData | null;
  onUnitChange: (unit: Unit) => void;
  onThemeChange: (theme: Theme) => void;
  onScheduleChange: (data: ScheduleData) => void;
}

export default function SettingsView({
  unit, theme, isConnected, scheduleData, onUnitChange, onThemeChange, onScheduleChange,
}: SettingsViewProps) {
  const [costPerKwh, setCostPerKwh] = useState(0.12);
  const [ringStatus, setRingStatus] = useState<RingStatus>({ mode: null, connected: false });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const ringSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const ringEnabled = scheduleData?.ring_enabled ?? false;
  const ringMapping = scheduleData?.ring_mapping ?? DEFAULT_RING_MAPPING;

  useEffect(() => {
    getSettings().then(s => {
      setCostPerKwh(s.cost_per_kwh);
    }).catch(() => {});
    getRingStatus().then(setRingStatus).catch(() => {});
  }, []);

  const handleUnitChange = useCallback((u: Unit) => {
    onUnitChange(u);
    saveSettings({ unit: u }).catch(() => {});
  }, [onUnitChange]);

  const handleThemeChange = useCallback((t: Theme) => {
    onThemeChange(t);
    saveSettings({ theme: t }).catch(() => {});
  }, [onThemeChange]);

  const handleCostChange = useCallback((value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setCostPerKwh(num);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveSettings({ cost_per_kwh: num }).catch(() => {});
      }, 1000);
    }
  }, []);

  const saveRingFields = useCallback((updated: ScheduleData) => {
    if (ringSaveTimer.current) clearTimeout(ringSaveTimer.current);
    ringSaveTimer.current = setTimeout(() => {
      apiSaveSchedule({
        weekday: updated.weekday, weekend: updated.weekend,
        ring_enabled: updated.ring_enabled, ring_mapping: updated.ring_mapping,
      }).catch(() => {});
    }, 1000);
  }, []);

  const handleRingToggle = useCallback(() => {
    if (!scheduleData) return;
    const updated = { ...scheduleData, ring_enabled: !ringEnabled };
    onScheduleChange(updated);
    saveRingFields(updated);
  }, [scheduleData, ringEnabled, onScheduleChange, saveRingFields]);

  const handleRingMappingChange = useCallback((ringMode: keyof RingMapping, slot: string) => {
    if (!scheduleData) return;
    const newMapping = { ...ringMapping, [ringMode]: slot };
    const updated = { ...scheduleData, ring_mapping: newMapping };
    onScheduleChange(updated);
    saveRingFields(updated);
  }, [scheduleData, ringMapping, onScheduleChange, saveRingFields]);

  return (
    <div className="settings-view">
      <div className="settings-section">
        <span className="label">Temperature Unit</span>
        <div className="settings-row">
          <div className="unit-toggle">
            <button
              className={`unit-btn${unit === 'F' ? ' active' : ''}`}
              onClick={() => handleUnitChange('F')}
            >°F</button>
            <button
              className={`unit-btn${unit === 'C' ? ' active' : ''}`}
              onClick={() => handleUnitChange('C')}
            >°C</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <span className="label">Theme</span>
        <div className="settings-row">
          <div className="unit-toggle">
            <button
              className={`unit-btn${theme === 'dark' ? ' active' : ''}`}
              onClick={() => handleThemeChange('dark')}
            >Dark</button>
            <button
              className={`unit-btn${theme === 'light' ? ' active' : ''}`}
              onClick={() => handleThemeChange('light')}
            >Light</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <span className="label">Energy Cost</span>
        <div className="settings-row">
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>$/kWh</span>
          <input
            type="number"
            className="settings-input"
            value={costPerKwh}
            step={0.01}
            min={0}
            onChange={e => handleCostChange(e.target.value)}
          />
        </div>
      </div>

      {/* Ring Integration */}
      <div className="settings-section">
        <div className="ring-integration-header">
          <span className="label" style={{ marginBottom: 0 }}>Ring Integration</span>
          <button
            className={`toggle-switch small${ringEnabled ? ' on' : ''}`}
            onClick={handleRingToggle}
            style={{ marginLeft: 'auto' }}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        {ringEnabled && (
          <div className="ring-mapping-list" style={{ marginTop: 8 }}>
            {RING_MODES.map(rm => {
              const mappedSlot = ringMapping[rm.key];
              const dotColor = PERIOD_COLORS[mappedSlot] ?? '#888';
              return (
                <div key={rm.key} className="ring-mapping-row">
                  <span className="ring-mapping-label">
                    {rm.label}
                    {ringStatus.mode === rm.key && (
                      <span className="ring-active-dot" />
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: dotColor }} />
                    <select
                      className="ring-mapping-select"
                      value={mappedSlot}
                      onChange={(e) => handleRingMappingChange(rm.key, e.target.value)}
                    >
                      {SLOT_OPTIONS.map(s => (
                        <option key={s.key} value={s.key}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="settings-section">
        <span className="label">Connections</span>
        <div className="settings-info-list">
          <div className="info-item">
            <span className="info-label">Thermostat</span>
            <span className="info-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`status-dot ${isConnected ? 'ok' : 'err'}`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Ring Alarm</span>
            <span className="info-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`status-dot ${ringStatus.connected ? 'ok' : 'err'}`} />
              {ringStatus.connected ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <span className="label">Device</span>
        <div className="settings-info-list">
          <div className="info-item">
            <span className="info-label">Model</span>
            <span className="info-val">SYSTXCCITN01</span>
          </div>
          <div className="info-item">
            <span className="info-label">Interface</span>
            <span className="info-val">RS-485 ABCD Bus</span>
          </div>
        </div>
      </div>
    </div>
  );
}
