import { useEffect, useState } from 'react';
import type { Unit, Theme } from '../types';

interface TopBarProps {
  unit: Unit;
  theme: Theme;
  scheduleMode: 'manual' | 'schedule';
  isConnected: boolean;
  onUnitChange: (unit: Unit) => void;
  onThemeChange: (theme: Theme) => void;
  onScheduleModeChange: (mode: 'manual' | 'schedule') => void;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TopBar({
  unit,
  theme,
  scheduleMode,
  isConnected,
  onUnitChange,
  onThemeChange,
  onScheduleModeChange,
}: TopBarProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;

  return (
    <div className="top-bar">
      <div className="top-left">
        <div className="live-clock">{h}:{m}</div>
        <div className="live-clock-date">{dateStr}</div>
      </div>
      <div className="top-center">
        <div className="pill-mode-toggle">
          <div
            className={`pill-mt${scheduleMode === 'manual' ? ' active' : ''}`}
            onClick={() => onScheduleModeChange('manual')}
          >Manual</div>
          <div
            className={`pill-mt${scheduleMode === 'schedule' ? ' active' : ''}`}
            onClick={() => onScheduleModeChange('schedule')}
          >Schedule</div>
        </div>
      </div>
      <div className="top-right">
        <span className="conn-indicator">
          <span className={`status-dot ${isConnected ? 'ok' : 'err'}`} />
        </span>
        <div className="unit-toggle">
          <button
            className={`unit-btn${unit === 'F' ? ' active' : ''}`}
            onClick={() => onUnitChange('F')}
          >°F</button>
          <button
            className={`unit-btn${unit === 'C' ? ' active' : ''}`}
            onClick={() => onUnitChange('C')}
          >°C</button>
        </div>
        <button
          className="theme-btn"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
