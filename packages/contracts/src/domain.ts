export type MembershipRole = "producer" | "operator" | "advisor";
export type PlotStatus = "stale" | "dry" | "optimal" | "wet";
export type ValveStatus = "closed" | "open";
export type IrrigationCommandStatus = "pending" | "applied" | "failed" | "cancelled";
export type CommandStatus = IrrigationCommandStatus;
export type AlertKind = "low_moisture" | "station_stale";
export type AlertStatus = "open" | "resolved";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Membership {
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: string;
}

export interface Plot {
  id: string;
  organization_id: string;
  name: string;
  geom: unknown;
  threshold_min: number;
  threshold_max: number;
  created_at: string;
}

export interface Station {
  id: string;
  organization_id: string;
  plot_id: string;
  name: string;
  is_enabled: boolean;
  created_at: string;
}

export interface Reading {
  id: number;
  organization_id: string;
  station_id: string;
  moisture_pct: number;
  temperature_c?: number | null;
  recorded_at: string;
  created_at?: string;
}

export interface Valve {
  id: string;
  organization_id: string;
  plot_id: string;
  name: string;
  status: ValveStatus;
  updated_at: string;
}

export interface IrrigationCommand {
  id: string;
  organization_id: string;
  valve_id: string;
  requested_by: string;
  client_request_id: string;
  action: ValveStatus;
  duration_minutes: number | null;
  status: IrrigationCommandStatus;
  failure_reason: string | null;
  accepted_at: string;
  dispatch_deadline_at: string;
  applied_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  plot_id: string | null;
  station_id: string | null;
  kind: AlertKind;
  status: AlertStatus;
  message: string;
  created_at: string;
  resolved_at: string | null;
}
