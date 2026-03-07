import { useState, useEffect, useCallback } from 'react';
import type { StatusResponse, ScheduleData, Unit, HvacMode, Theme, ControlMode, ActiveTab, Settings } from './types';
import { getStatus, getSchedule, getSettings } from './api';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import MobileTabBar from './components/MobileTabBar';
import HomeView from './components/HomeView';
import ModeView from './components/ModeView';
import EnergyView from './components/EnergyView';
import SettingsView from './components/SettingsView';
import './App.css';

const POLL_INTERVAL = 15000;

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [unit, setUnit] = useState<Unit>('F');
  const [mode, setMode] = useState<HvacMode>('heat');
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('manual');
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [settings, setSettings] = useState<Settings>({ unit: 'F', theme: 'dark', cost_per_kwh: 0.12 });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      setUnit(s.unit as Unit);
      setTheme(s.theme as Theme);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await getStatus();
        if (active) {
          setStatus(s);
          setIsConnected(true);
          if (s.control_mode) setControlMode(s.control_mode);
        }
      } catch {
        if (active) setIsConnected(false);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    getSchedule().then(setScheduleData).catch(() => {});
  }, []);

  const handleControlModeChange = useCallback((newMode: ControlMode) => {
    setControlMode(newMode);
  }, []);

  const handleUnitChange = useCallback((u: Unit) => {
    setUnit(u);
    setSettings(prev => ({ ...prev, unit: u }));
  }, []);

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t);
    setSettings(prev => ({ ...prev, theme: t }));
  }, []);

  // Mobile tab includes settings as a tab
  const mobileTab = showSettings ? 'settings' as const : activeTab;
  const handleMobileTab = useCallback((tab: 'home' | 'mode' | 'energy' | 'settings') => {
    if (tab === 'settings') {
      setShowSettings(true);
    } else {
      setShowSettings(false);
      setActiveTab(tab);
    }
  }, []);

  return (
    <div className="control-panel">
      <TopBar
        isConnected={isConnected}
        showSettings={showSettings}
        onSettingsClick={() => setShowSettings(!showSettings)}
      />

      {showSettings ? (
        <div className="view-content">
          <SettingsView
            unit={unit}
            theme={theme}
            isConnected={isConnected}
            scheduleData={scheduleData}
            onUnitChange={handleUnitChange}
            onThemeChange={handleThemeChange}
            onScheduleChange={setScheduleData}
          />
        </div>
      ) : (
        <>
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="view-content">
            {activeTab === 'home' && (
              <HomeView
                status={status}
                unit={unit}
                mode={mode}
                controlMode={controlMode}
                scheduleData={scheduleData}
                onModeChange={setMode}
              />
            )}
            {activeTab === 'mode' && (
              <ModeView
                status={status}
                unit={unit}
                controlMode={controlMode}
                scheduleData={scheduleData}
                onControlModeChange={handleControlModeChange}
                onScheduleChange={setScheduleData}
              />
            )}
            {activeTab === 'energy' && (
              <EnergyView settings={settings} />
            )}
          </div>
        </>
      )}

      <MobileTabBar activeTab={mobileTab} onTabChange={handleMobileTab} />
    </div>
  );
}
