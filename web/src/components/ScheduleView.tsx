import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [editingIdx, setEditingIdx] = useState(-1); // which period has the modal open
  const [miniMode, setMiniMode] = useState<HvacMode>('heat');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const periods = [...(scheduleData[viewDay] || [])].sort(
    (a, b) => timeToMin(a.start) - timeToMin(b.start)
  );

  const editingPeriod = periods[editingIdx] || null;

  // Auto-save: debounce 1s after any change
  const autoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiSaveSchedule({ weekday: scheduleData.weekday, weekend: scheduleData.weekend }).catch(() => {});
    }, 1000);
  }, [scheduleData]);

  const updatePeriod = useCallback((idx: number, update: Partial<Period>) => {
    const sorted = [...scheduleData[viewDay]].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
    const target = sorted[idx];
    const newSlots = scheduleData[viewDay].map(p =>
      p.period === target.period && p.start === target.start ? { ...p, ...update } : p
    );
    const updated = { ...scheduleData, [viewDay]: newSlots };
    onScheduleChange(updated);
    // Auto-save with the updated data
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiSaveSchedule({ weekday: updated.weekday, weekend: updated.weekend }).catch(() => {});
    }, 1000);
  }, [scheduleData, viewDay, onScheduleChange]);

  const handleDelete = useCallback((idx: number) => {
    if (periods.length <= 1) return;
    const target = periods[idx];
    const newSlots = scheduleData[viewDay].filter(
      p => !(p.period === target.period && p.start === target.start)
    );
    onScheduleChange({ ...scheduleData, [viewDay]: newSlots });
    setSelectedIdx(-1);
    setEditingIdx(-1);
    autoSave();
  }, [periods, scheduleData, viewDay, onScheduleChange, autoSave]);

  const handleDividerDrag = useCallback((idx: number, newStart: string) => {
    updatePeriod(idx, { start: newStart });
  }, [updatePeriod]);

  const handleAddSlot = useCallback((atTime: string, slotName: string) => {
    const newPeriod: Period = { period: slotName, start: atTime, heat: 68, cool: 75 };
    const updated = [...scheduleData[viewDay], newPeriod];
    onScheduleChange({ ...scheduleData, [viewDay]: updated });
    autoSave();
  }, [scheduleData, viewDay, onScheduleChange, autoSave]);

  const handleMiniTempChange = useCallback((temp: number) => {
    if (editingPeriod) {
      updatePeriod(editingIdx, { [miniMode]: temp });
    }
  }, [editingIdx, editingPeriod, miniMode, updatePeriod]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingIdx(-1);
    };
    if (editingIdx >= 0) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [editingIdx]);

  // Click on period card opens the edit modal
  const handleCardClick = useCallback((idx: number) => {
    setSelectedIdx(idx);
    setEditingIdx(idx);
    setMiniMode('heat');
  }, []);

  return (
    <div className="schedule-view" onClick={() => setSelectedIdx(-1)}>
      <div className="sched-top">
        {/* Left: timeline + info */}
        <div className="sched-left">
          <div className="sched-day-tabs">
            <button
              className={`sched-day-tab${viewDay === 'weekday' ? ' active' : ''}`}
              onClick={() => { setViewDay('weekday'); setSelectedIdx(-1); setEditingIdx(-1); }}
            >Weekday</button>
            <button
              className={`sched-day-tab${viewDay === 'weekend' ? ' active' : ''}`}
              onClick={() => { setViewDay('weekend'); setSelectedIdx(-1); setEditingIdx(-1); }}
            >Weekend</button>
          </div>

          <div className="timeline-wrap">
            <Timeline
              periods={periods}
              selectedIdx={selectedIdx}
              onSelect={setSelectedIdx}
              onDelete={handleDelete}
              onDividerDrag={handleDividerDrag}
              onAddSlot={handleAddSlot}
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
              <span className="label" style={{ marginBottom: 0, fontSize: 9 }}>Active Slot</span>
              <div style={{ fontSize: 24, fontWeight: 300 }}>
                {status?.active_period ? status.active_period.charAt(0).toUpperCase() + status.active_period.slice(1) : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: period list */}
        <div className="sched-right">
          <span className="label">Slots</span>
          <div className="sched-editor">
            {periods.map((p, i) => (
              <PeriodCard
                key={`${p.period}-${p.start}`}
                period={p}
                isSelected={i === selectedIdx}
                unit={unit}
                onClick={() => handleCardClick(i)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal — blur backdrop, centered mini dial */}
      {editingIdx >= 0 && editingPeriod && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setEditingIdx(-1)}
        >
          <div
            style={{
              background: 'rgba(17,17,17,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24, padding: '28px 32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              minWidth: 260,
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="label" style={{ marginBottom: 0 }}>
              {editingPeriod.period.charAt(0).toUpperCase() + editingPeriod.period.slice(1)} — {editingPeriod.start}
            </span>

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
              temp={editingPeriod[miniMode]}
              mode={miniMode}
              unit={unit}
              min={miniMode === 'heat' ? 55 : 60}
              max={miniMode === 'heat' ? 85 : 90}
              onTempChange={handleMiniTempChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
