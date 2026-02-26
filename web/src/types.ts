export interface StatusResponse {
  indoor_temp: number | null;
  outdoor_temp: number | null;
  heat_setpoint: number | null;
  cool_setpoint: number | null;
  energy_yesterday: number | null;
  energy_2days: number | null;
  energy_ytd: number | null;
  schedule_mode: 'manual' | 'schedule';
  active_period: string | null;
  active_period_heat: number | null;
  active_period_cool: number | null;
  next_transition: string | null;
}

export interface Period {
  period: string;
  start: string;
  heat: number;
  cool: number;
}

export interface ScheduleData {
  mode: 'manual' | 'schedule';
  weekday: Period[];
  weekend: Period[];
}

export type Unit = 'F' | 'C';
export type HvacMode = 'heat' | 'cool';
