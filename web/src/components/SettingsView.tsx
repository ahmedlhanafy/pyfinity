import { useState, useEffect, useCallback, useRef } from 'react';
import type { Unit, Theme, RingStatus } from '../types';
import { getSettings, saveSettings, getRingStatus } from '../api';

interface SettingsViewProps {
  unit: Unit;
  theme: Theme;
  isConnected: boolean;
  onUnitChange: (unit: Unit) => void;
  onThemeChange: (theme: Theme) => void;
}

export default function SettingsView({
  unit, theme, isConnected, onUnitChange, onThemeChange,
}: SettingsViewProps) {
  const [costPerKwh, setCostPerKwh] = useState(0.12);
  const [ringStatus, setRingStatus] = useState<RingStatus>({ mode: null, connected: false });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

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
