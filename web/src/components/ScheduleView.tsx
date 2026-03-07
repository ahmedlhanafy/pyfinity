import { useState, useCallback, useRef, useEffect } from 'react';
import type { StatusResponse, ScheduleData, Period, Unit, HvacMode } from '../types';
import { ft, timeToMin, minToTime, PERIOD_COLORS } from '../utils';
import { saveSchedule as apiSaveSchedule } from '../api';
import Timeline from './Timeline';
import MiniDial from './MiniDial';
import { displayTemp, unitLabel } from '../utils';

const SLOT_PALETTE = [
  { name: 'Wake', key: 'wake', heat: 68, cool: 75 },
  { name: 'Home', key: 'home', heat: 68, cool: 75 },
  { name: 'Away', key: 'away', heat: 62, cool: 78 },
  { name: 'Sleep', key: 'sleep', heat: 65, cool: 76 },
];

interface ScheduleViewProps {
  status: StatusResponse | null;
  unit: Unit;
  scheduleData: ScheduleData;
  onScheduleChange: (data: ScheduleData) => void;
}

export default function ScheduleView({ status, unit, scheduleData, onScheduleChange }: ScheduleViewProps) {
  const [viewDay, setViewDay] = useState<'weekday' | 'weekend'>('weekday');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [editingIdx, setEditingIdx] = useState(-1); // which timeline period has the modal open
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null); // palette slot editing
  const [miniMode, setMiniMode] = useState<HvacMode>('heat');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const periods = [...(scheduleData[viewDay] || [])].sort(
    (a, b) => timeToMin(a.start) - timeToMin(b.start)
  );

  const editingPeriod = periods[editingIdx] || null;

  // Auto-save: debounce 1s after any change
  const autoSave = useCallback((data?: ScheduleData) => {
    const d = data ?? scheduleData;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiSaveSchedule({
        weekday: d.weekday, weekend: d.weekend,
        ring_enabled: d.ring_enabled, ring_mapping: d.ring_mapping,
      }).catch(() => {});
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
    autoSave(updated);
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
    if (editingSlotKey) {
      // Update ALL instances of this slot type across both weekday and weekend
      const updateSlots = (slots: Period[]) =>
        slots.map(p => p.period === editingSlotKey ? { ...p, [miniMode]: temp } : p);
      const updated = {
        ...scheduleData,
        weekday: updateSlots(scheduleData.weekday),
        weekend: updateSlots(scheduleData.weekend),
      };
      onScheduleChange(updated);
      autoSave(updated);
    } else if (editingPeriod) {
      updatePeriod(editingIdx, { [miniMode]: temp });
    }
  }, [editingIdx, editingPeriod, editingSlotKey, miniMode, updatePeriod, scheduleData, onScheduleChange, autoSave]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingIdx(-1); setEditingSlotKey(null); }
    };
    if (editingIdx >= 0 || editingSlotKey) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [editingIdx, editingSlotKey]);

  const handlePaletteClick = useCallback((slotKey: string) => {
    setEditingSlotKey(slotKey);
    setEditingIdx(-1);
    setMiniMode('heat');
  }, []);

  // Quick-add from palette: find a gap to insert at
  const handlePaletteAdd = useCallback((slotKey: string) => {
    const starts = periods.map(p => timeToMin(p.start)).sort((a, b) => a - b);
    // Find the largest gap between existing slots
    let bestMin = 720; // default: noon
    let bestGap = 0;
    for (let i = 0; i < starts.length; i++) {
      const next = i < starts.length - 1 ? starts[i + 1] : 1440;
      const gap = next - starts[i];
      if (gap > bestGap) {
        bestGap = gap;
        bestMin = Math.round((starts[i] + next) / 2);
      }
    }
    // Snap to 15 min
    bestMin = Math.round(bestMin / 15) * 15;
    bestMin = Math.max(0, Math.min(1425, bestMin));
    handleAddSlot(minToTime(bestMin), slotKey);
  }, [periods, handleAddSlot]);


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

        {/* Right: slot palette */}
        <div className="sched-right">
          <span className="label">Slots</span>
          <div className="slot-palette">
            {SLOT_PALETTE.map((slot) => {
              const color = PERIOD_COLORS[slot.key] ?? '#888';
              // Get live temps from the first instance in current day's schedule
              const liveSlot = periods.find(p => p.period === slot.key);
              const heat = liveSlot?.heat ?? slot.heat;
              const cool = liveSlot?.cool ?? slot.cool;
              return (
                <div
                  key={slot.key}
                  className="slot-palette-item"
                  draggable
                  onClick={() => handlePaletteClick(slot.key)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', slot.key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <span className="sched-period-dot" style={{ background: color }} />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{slot.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {displayTemp(heat, unit)}{unitLabel(unit)} / {displayTemp(cool, unit)}{unitLabel(unit)}
                  </span>
                  <span
                    className="slot-palette-add"
                    onClick={(e) => { e.stopPropagation(); handlePaletteAdd(slot.key); }}
                  >+</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit modal — blur backdrop, centered mini dial */}
      {(editingIdx >= 0 && editingPeriod || editingSlotKey) && (() => {
        // Determine what we're editing
        const slotDef = editingSlotKey ? SLOT_PALETTE.find(s => s.key === editingSlotKey) : null;
        const liveSlot = editingSlotKey ? periods.find(p => p.period === editingSlotKey) : null;
        const modalLabel = editingSlotKey
          ? (slotDef?.name ?? editingSlotKey)
          : `${editingPeriod!.period.charAt(0).toUpperCase() + editingPeriod!.period.slice(1)} — ${editingPeriod!.start}`;
        const modalTemp = editingSlotKey
          ? (liveSlot?.[miniMode] ?? (slotDef?.[miniMode] ?? 68))
          : editingPeriod![miniMode];

        return (
          <div
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => { setEditingIdx(-1); setEditingSlotKey(null); }}
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
              <span className="label" style={{ marginBottom: 0 }}>{modalLabel}</span>

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
                temp={modalTemp}
                mode={miniMode}
                unit={unit}
                min={miniMode === 'heat' ? 55 : 60}
                max={miniMode === 'heat' ? 85 : 90}
                onTempChange={handleMiniTempChange}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
