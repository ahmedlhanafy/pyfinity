import { useState, useCallback } from 'react';
import type { StatusResponse, ScheduleData, Period, Unit, HvacMode } from '../types';
import { ft, timeToMin } from '../utils';
import { saveSchedule as apiSaveSchedule } from '../api';
import Timeline from './Timeline';
import PeriodCard from './PeriodCard';
import MiniDial from './MiniDial';

interface ScheduleViewProps {
  status: StatusResponse | null;
  unit: Unit;
  scheduleData: ScheduleData;
  onScheduleChange: (data: ScheduleData) => void;
}

export default function ScheduleView({ status, unit, scheduleData, onScheduleChange }: ScheduleViewProps) {
  const [viewDay, setViewDay] = useState<'weekday' | 'weekend'>('weekday');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [miniMode, setMiniMode] = useState<HvacMode>('heat');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const periods = [...(scheduleData[viewDay] || [])].sort(
    (a, b) => timeToMin(a.start) - timeToMin(b.start)
  );

  const selectedPeriod = periods[selectedIdx] || null;

  const updatePeriod = useCallback((idx: number, update: Partial<Period>) => {
    const sorted = [...scheduleData[viewDay]].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
    const target = sorted[idx];
    const newPeriods = scheduleData[viewDay].map(p =>
      p.period === target.period && p.start === target.start ? { ...p, ...update } : p
    );
    onScheduleChange({ ...scheduleData, [viewDay]: newPeriods });
    setSaveState('idle');
  }, [scheduleData, viewDay, onScheduleChange]);

  const handleDelete = useCallback((idx: number) => {
    if (periods.length <= 1) return;
    const target = periods[idx];
    const newPeriods = scheduleData[viewDay].filter(
      p => !(p.period === target.period && p.start === target.start)
    );
    onScheduleChange({ ...scheduleData, [viewDay]: newPeriods });
    setSelectedIdx(0);
    setSaveState('idle');
  }, [periods, scheduleData, viewDay, onScheduleChange]);

  const handleDividerDrag = useCallback((idx: number, newStart: string) => {
    updatePeriod(idx, { start: newStart });
  }, [updatePeriod]);

  const handleMiniTempChange = useCallback((temp: number) => {
    if (selectedPeriod) {
      updatePeriod(selectedIdx, { [miniMode]: temp });
    }
  }, [selectedIdx, selectedPeriod, miniMode, updatePeriod]);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      await apiSaveSchedule({ weekday: scheduleData.weekday, weekend: scheduleData.weekend });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }, [scheduleData]);

  return (
    <div className="schedule-view">
      <div className="sched-top">
        {/* Left: timeline + info */}
        <div className="sched-left">
          <div className="sched-day-tabs">
            <button
              className={`sched-day-tab${viewDay === 'weekday' ? ' active' : ''}`}
              onClick={() => { setViewDay('weekday'); setSelectedIdx(0); }}
            >Weekday</button>
            <button
              className={`sched-day-tab${viewDay === 'weekend' ? ' active' : ''}`}
              onClick={() => { setViewDay('weekend'); setSelectedIdx(0); }}
            >Weekend</button>
          </div>

          <div className="timeline-wrap">
            <Timeline
              periods={periods}
              selectedIdx={selectedIdx}
              unit={unit}
              onSelect={setSelectedIdx}
              onDelete={handleDelete}
              onDividerDrag={handleDividerDrag}
            />
          </div>

          <div className="sched-next">
            Next: <strong>{status?.next_transition || '--'}</strong>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
            <div className="weather-card" style={{ flex: 1, padding: 16 }}>
              <span className="label" style={{ marginBottom: 0, fontSize: 9 }}>Indoor</span>
              <div style={{ fontSize: 24, fontWeight: 300 }}>{ft(status?.indoor_temp ?? null, unit)}</div>
            </div>
            <div className="weather-card" style={{ flex: 1, padding: 16 }}>
              <span className="label" style={{ marginBottom: 0, fontSize: 9 }}>Outside</span>
              <div style={{ fontSize: 24, fontWeight: 300 }}>{ft(status?.outdoor_temp ?? null, unit)}</div>
            </div>
            <div className="weather-card" style={{ flex: 1, padding: 16 }}>
              <span className="label" style={{ marginBottom: 0, fontSize: 9 }}>Active Period</span>
              <div style={{ fontSize: 24, fontWeight: 300 }}>
                {status?.active_period ? status.active_period.charAt(0).toUpperCase() + status.active_period.slice(1) : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: editor */}
        <div className="sched-right">
          <span className="label">Periods</span>
          <div className="sched-editor">
            {periods.map((p, i) => (
              <PeriodCard
                key={`${p.period}-${p.start}`}
                period={p}
                isSelected={i === selectedIdx}
                unit={unit}
                onClick={() => setSelectedIdx(i)}
              />
            ))}
          </div>

          {selectedPeriod && (
            <div className="mini-dial-wrap">
              <div className="mini-dial-tabs">
                <button
                  className={`mini-dial-tab${miniMode === 'heat' ? ' active' : ''}`}
                  onClick={() => setMiniMode('heat')}
                >Heat</button>
                <button
                  className={`mini-dial-tab${miniMode === 'cool' ? ' active' : ''}`}
                  onClick={() => setMiniMode('cool')}
                >Cool</button>
              </div>
              <MiniDial
                temp={selectedPeriod[miniMode]}
                mode={miniMode}
                unit={unit}
                min={miniMode === 'heat' ? 55 : 60}
                max={miniMode === 'heat' ? 85 : 90}
                onTempChange={handleMiniTempChange}
              />
            </div>
          )}

          <button
            className={`sched-save-btn${saveState === 'saved' ? ' saved' : ''}`}
            onClick={handleSave}
          >
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
