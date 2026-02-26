import { useState, useEffect, useCallback } from 'react';
import type { StatusResponse, ScheduleData, Unit, HvacMode } from './types';
import { getStatus, getSchedule, setScheduleMode } from './api';
import TopBar from './components/TopBar';
import ManualView from './components/ManualView';
import ScheduleView from './components/ScheduleView';
import './App.css';

const POLL_INTERVAL = 15000;

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [unit, setUnit] = useState<Unit>('F');
  const [mode, setMode] = useState<HvacMode>('heat');
  const [scheduleMode, setScheduleModeState] = useState<'manual' | 'schedule'>('manual');
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Poll status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await getStatus();
        if (active) {
          setStatus(s);
          setIsConnected(true);
          // Sync schedule mode from server
          if (s.schedule_mode) {
            setScheduleModeState(s.schedule_mode);
          }
        }
      } catch {
        if (active) setIsConnected(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Fetch schedule on mount
  useEffect(() => {
    getSchedule().then(setScheduleData).catch(() => {});
  }, []);

  const handleScheduleModeChange = useCallback(async (newMode: 'manual' | 'schedule') => {
    setScheduleModeState(newMode);
    try {
      await setScheduleMode(newMode);
    } catch {}
  }, []);

  const handleManualInteraction = useCallback(() => {
    if (scheduleMode === 'schedule') {
      setScheduleModeState('manual');
      setScheduleMode('manual').catch(() => {});
    }
  }, [scheduleMode]);

  return (
    <div className="control-panel">
      <TopBar
        unit={unit}
        scheduleMode={scheduleMode}
        isConnected={isConnected}
        onUnitChange={setUnit}
        onScheduleModeChange={handleScheduleModeChange}
      />
      <div className="view-content">
        {scheduleMode === 'manual' ? (
          <ManualView
            status={status}
            unit={unit}
            mode={mode}
            onModeChange={setMode}
            onManualInteraction={handleManualInteraction}
          />
        ) : scheduleData ? (
          <ScheduleView
            status={status}
            unit={unit}
            scheduleData={scheduleData}
            onScheduleChange={setScheduleData}
          />
        ) : null}
      </div>
    </div>
  );
}
