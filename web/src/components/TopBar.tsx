import { useEffect, useState } from 'react';
import { GearSix, ArrowLeft } from '@phosphor-icons/react';

interface TopBarProps {
  isConnected: boolean;
  showSettings: boolean;
  onSettingsClick: () => void;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TopBar({ isConnected, showSettings, onSettingsClick }: TopBarProps) {
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
        {showSettings ? (
          <span className="label" style={{ marginBottom: 0, fontSize: 13, letterSpacing: 1 }}>Settings</span>
        ) : (
          <>
            <div className="live-clock">{h}:{m}</div>
            <div className="live-clock-date">{dateStr}</div>
          </>
        )}
      </div>
      <div className="top-right">
        <span className="conn-indicator">
          <span className={`status-dot ${isConnected ? 'ok' : 'err'}`} />
        </span>
        <button className="settings-btn" onClick={onSettingsClick} title={showSettings ? 'Back' : 'Settings'}>
          {showSettings ? <ArrowLeft size={18} weight="regular" /> : <GearSix size={18} weight="regular" />}
        </button>
      </div>
    </div>
  );
}
