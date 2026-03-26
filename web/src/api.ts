import type {
  StatusResponse,
  ScheduleData,
  Period,
  HvacMode,
  ControlMode,
  RingStatus,
  RingConfig,
  EnergyResponse,
  Settings,
} from './types';

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  return res.json();
}

export async function setTemp(
  mode: HvacMode,
  temp: number,
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, temp }),
  });
  if (!res.ok) throw new Error(`Set temp failed: ${res.status}`);
  return res.json();
}

export async function getSchedule(): Promise<ScheduleData> {
  const res = await fetch('/api/schedule');
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return res.json();
}

export async function saveSchedule(data: {
  weekday: Period[];
  weekend: Period[];
  ring_enabled?: boolean;
  ring_mapping?: { disarmed: string; home: string; away: string };
}): Promise<{ ok: boolean }> {
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save schedule failed: ${res.status}`);
  return res.json();
}

export async function setMode(
  mode: ControlMode,
): Promise<{ ok: boolean; mode: string }> {
  const res = await fetch('/api/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`Set mode failed: ${res.status}`);
  return res.json();
}

export async function getRingStatus(): Promise<RingStatus> {
  const res = await fetch('/api/ring/status');
  if (!res.ok) throw new Error(`Ring status failed: ${res.status}`);
  return res.json();
}

export async function getRingConfig(): Promise<RingConfig> {
  const res = await fetch('/api/ring/config');
  if (!res.ok) throw new Error(`Ring config failed: ${res.status}`);
  return res.json();
}

export async function saveRingConfig(
  config: RingConfig,
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/ring/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Save ring config failed: ${res.status}`);
  return res.json();
}

export async function getEnergy(
  range: 'day' | 'week' | 'year',
): Promise<EnergyResponse> {
  const res = await fetch(`/api/energy?range=${range}`);
  if (!res.ok) throw new Error(`Energy fetch failed: ${res.status}`);
  return res.json();
}

export async function getSettings(): Promise<Settings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`);
  return res.json();
}

export async function refreshWeather(): Promise<{ ok: boolean; temp?: number }> {
  const res = await fetch('/api/weather/refresh', { method: 'POST' });
  if (!res.ok) throw new Error(`Weather refresh failed: ${res.status}`);
  return res.json();
}

export async function saveSettings(
  settings: Partial<Settings>,
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Save settings failed: ${res.status}`);
  return res.json();
}
