export const TEMP_MIN = 50;
export const TEMP_MAX = 85;
export const ARC_START_DEG = 135;
export const ARC_SWEEP_DEG = 270;
export const HEAT_COLORS = ['#FFD700', '#FFAA00', '#FF8C00', '#FF6B00', '#FF5722'];
export const COOL_COLORS = ['#B8E8FC', '#7EC8E3', '#5B9BD5', '#4472C4', '#3B5BDB'];
export const PERIOD_COLORS: Record<string, string> = {
  wake: '#FFD700',
  home: '#2AF598',
  away: '#9D7BFF',
  sleep: '#6B5CE7',
};

export function fToC(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

export function displayTemp(f: number | null, unit: 'F' | 'C'): string {
  if (f == null) return '--';
  return String(unit === 'F' ? f : fToC(f));
}

export function unitLabel(unit: 'F' | 'C'): string {
  return unit === 'F' ? '\u00B0F' : '\u00B0C';
}

export function ft(v: number | null, unit: 'F' | 'C'): string {
  return v != null ? `${displayTemp(v, unit)}${unitLabel(unit)}` : '--';
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function tempToAngle(temp: number): number {
  return ARC_START_DEG + ((temp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * ARC_SWEEP_DEG;
}

export function angleToTemp(angleDeg: number): number {
  let rel = angleDeg - ARC_START_DEG;
  if (rel < 0) rel += 360;
  if (rel > ARC_SWEEP_DEG)
    rel = rel > ARC_SWEEP_DEG + 45 ? 0 : ARC_SWEEP_DEG;
  return Math.round(TEMP_MIN + (rel / ARC_SWEEP_DEG) * (TEMP_MAX - TEMP_MIN));
}

export function parseHex(hex: string): [number, number, number] {
  const h = parseInt(hex.slice(1), 16);
  return [(h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff];
}

export function lerpColor(
  a: string | number[],
  b: string | number[],
  t: number,
): string {
  const [ar, ag, ab] = typeof a === 'string' ? parseHex(a) : a;
  const [br, bg, bb] = typeof b === 'string' ? parseHex(b) : b;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}
