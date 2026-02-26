import type { StatusResponse, ScheduleData, Period, HvacMode } from './types';

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
  return res.json();
}

export async function setTemp(
  mode: HvacMode,
  temp: number,
  switchToManual?: boolean,
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, temp, switch_to_manual: switchToManual }),
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
}): Promise<{ ok: boolean }> {
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save schedule failed: ${res.status}`);
  return res.json();
}

export async function setScheduleMode(
  mode: 'manual' | 'schedule',
): Promise<{ ok: boolean; mode: string }> {
  const res = await fetch('/api/schedule/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error(`Set schedule mode failed: ${res.status}`);
  return res.json();
}
