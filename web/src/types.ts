export type ControlMode = 'manual' | 'schedule' | 'ring';
export type ActiveTab = 'home' | 'mode' | 'energy';
export type Unit = 'F' | 'C';
export type HvacMode = 'heat' | 'cool';
export type Theme = 'dark' | 'light';

export interface StatusResponse {
  indoor_temp: number | null;
  outdoor_temp: number | null;
  weather_source?: 'api' | 'bus';
  heat_setpoint: number | null;
  cool_setpoint: number | null;
  energy_yesterday: number | null;
  energy_2days: number | null;
  energy_ytd: number | null;
  control_mode: ControlMode;
  active_period: string | null;
  active_period_heat: number | null;
  active_period_cool: number | null;
  next_transition: string | null;
  ring_mode: string | null;
}

export interface Period {
  period: string;
  start: string;
  heat: number;
  cool: number;
}

export interface RingMapping {
  disarmed: string;
  home: string;
  away: string;
}

export interface ScheduleData {
  mode: ControlMode;
  weekday: Period[];
  weekend: Period[];
  ring: RingConfig;
  ring_enabled?: boolean;
  ring_mapping?: RingMapping;
}

export interface RingModeTemps {
  heat: number;
  cool: number;
}

export interface RingConfig {
  disarmed: RingModeTemps;
  home: RingModeTemps;
  away: RingModeTemps;
}

export interface RingStatus {
  mode: 'disarmed' | 'home' | 'away' | null;
  connected: boolean;
}

export interface EnergyDay {
  date: string;
  hp_heat: number;
  cooling: number;
  elec_heat: number;
  fan: number;
  reheat: number;
}

export interface EnergyResponse {
  range: 'day' | 'week' | 'year';
  data: EnergyDay[];
}

export interface Settings {
  unit: Unit;
  theme: Theme;
  cost_per_kwh: number;
  city?: string;
  openweather_api_key?: string;
}
