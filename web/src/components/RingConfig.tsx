import { useState, useEffect, useCallback, useRef } from 'react';
import { LockOpen, House, SignOut } from '@phosphor-icons/react';
import type { RingConfig as RingConfigType, RingStatus, Unit, HvacMode } from '../types';
import { getRingConfig, getRingStatus, saveRingConfig } from '../api';
import { displayTemp, unitLabel } from '../utils';
import MiniDial from './MiniDial';

interface RingConfigProps {
  unit: Unit;
}

const RING_MODES = [
  { key: 'disarmed' as const, label: 'Disarmed', icon: LockOpen },
  { key: 'home' as const, label: 'Home', icon: House },
  { key: 'away' as const, label: 'Away', icon: SignOut },
];

export default function RingConfig({ unit }: RingConfigProps) {
  const [config, setConfig] = useState<RingConfigType | null>(null);
  const [ringStatus, setRingStatus] = useState<RingStatus>({ mode: null, connected: false });
  const [editingMode, setEditingMode] = useState<keyof RingConfigType | null>(null);
  const [editingField, setEditingField] = useState<HvacMode>('heat');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    getRingConfig().then(setConfig).catch(() => {});
    getRingStatus().then(setRingStatus).catch(() => {});
    const id = setInterval(() => {
      getRingStatus().then(setRingStatus).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingMode(null);
    };
    if (editingMode) {
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [editingMode]);

  const updateTemp = useCallback((mode: keyof RingConfigType, field: 'heat' | 'cool', value: number) => {
    if (!config) return;
    const updated = {
      ...config,
      [mode]: { ...config[mode], [field]: value },
    };
    setConfig(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveRingConfig(updated).catch(() => {});
    }, 1000);
  }, [config]);

  const handleTempClick = useCallback((mode: keyof RingConfigType, field: HvacMode) => {
    setEditingMode(mode);
    setEditingField(field);
  }, []);

  const handleMiniTempChange = useCallback((temp: number) => {
    if (editingMode) {
      updateTemp(editingMode, editingField, temp);
    }
  }, [editingMode, editingField, updateTemp]);

  if (!config) return null;

  const editingLabel = editingMode
    ? RING_MODES.find(r => r.key === editingMode)?.label
    : '';

  return (
    <div className="ring-config">
      <div className="ring-status-bar">
        <span className={`status-dot ${ringStatus.connected ? 'ok' : 'err'}`} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {ringStatus.connected
            ? `Ring: ${ringStatus.mode ? ringStatus.mode.charAt(0).toUpperCase() + ringStatus.mode.slice(1) : 'Connected'}`
            : 'Ring: Disconnected'}
        </span>
      </div>

      <div className="ring-modes">
        {RING_MODES.map(rm => {
          const Icon = rm.icon;
          const isActive = ringStatus.mode === rm.key;
          return (
            <div key={rm.key} className={`ring-mode-card${isActive ? ' active' : ''}`}>
              <div className="ring-mode-header">
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="ring-mode-label">{rm.label}</span>
                {isActive && <span className="ring-active-badge">Active</span>}
              </div>
              <div className="ring-temps">
                <div className="ring-temp-row">
                  <span className="ring-temp-label">Heat</span>
                  <span
                    className="ring-temp-value clickable"
                    onClick={() => handleTempClick(rm.key, 'heat')}
                  >
                    {displayTemp(config[rm.key].heat, unit)}{unitLabel(unit)}
                  </span>
                </div>
                <div className="ring-temp-row">
                  <span className="ring-temp-label">Cool</span>
                  <span
                    className="ring-temp-value clickable"
                    onClick={() => handleTempClick(rm.key, 'cool')}
                  >
                    {displayTemp(config[rm.key].cool, unit)}{unitLabel(unit)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal with mini dial */}
      {editingMode && config && (
        <div
          className="ring-modal-backdrop"
          onClick={() => setEditingMode(null)}
        >
          <div
            className="ring-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="label" style={{ marginBottom: 0 }}>
              {editingLabel} — {editingField === 'heat' ? 'Heat' : 'Cool'}
            </span>

            <div className="mini-dial-tabs">
              <button
                className={`mini-dial-tab${editingField === 'heat' ? ' active' : ''}`}
                onClick={() => setEditingField('heat')}
              >Heat</button>
              <button
                className={`mini-dial-tab${editingField === 'cool' ? ' active' : ''}`}
                onClick={() => setEditingField('cool')}
              >Cool</button>
            </div>

            <MiniDial
              temp={config[editingMode][editingField]}
              mode={editingField}
              unit={unit}
              min={editingField === 'heat' ? 55 : 60}
              max={editingField === 'heat' ? 85 : 90}
              onTempChange={handleMiniTempChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
