import { ValveStatus } from "./domain.js";
import { MIN_COMMAND_DURATION_MINUTES, MAX_COMMAND_DURATION_MINUTES } from "./constants.js";

export interface IrrigationCommandPayload {
  command_id: string;
  client_request_id: string;
  valve_id: string;
  action: ValveStatus;
  duration_minutes: number | null;
}

export function isIrrigationCommandPayload(data: unknown): data is IrrigationCommandPayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.command_id !== "string" || d.command_id.trim().length === 0) return false;
  if (typeof d.client_request_id !== "string" || d.client_request_id.trim().length === 0) return false;
  if (typeof d.valve_id !== "string" || d.valve_id.trim().length === 0) return false;
  if (d.action !== "open" && d.action !== "closed") return false;
  if (d.action === "open") {
    if (
      typeof d.duration_minutes !== "number" ||
      d.duration_minutes < MIN_COMMAND_DURATION_MINUTES ||
      d.duration_minutes > MAX_COMMAND_DURATION_MINUTES
    ) {
      return false;
    }
  } else {
    if (d.duration_minutes !== null && d.duration_minutes !== undefined) return false;
  }
  return true;
}

export function validateIrrigationCommandPayload(data: unknown):
  | { success: true; data: IrrigationCommandPayload }
  | { success: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { success: false, error: "Payload must be a non-null object" };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.command_id !== "string" || d.command_id.trim().length === 0) {
    return { success: false, error: "command_id must be a non-empty string UUID" };
  }
  if (typeof d.client_request_id !== "string" || d.client_request_id.trim().length === 0) {
    return { success: false, error: "client_request_id must be a non-empty string UUID" };
  }
  if (typeof d.valve_id !== "string" || d.valve_id.trim().length === 0) {
    return { success: false, error: "valve_id must be a non-empty string UUID" };
  }
  if (d.action !== "open" && d.action !== "closed") {
    return { success: false, error: "action must be 'open' or 'closed'" };
  }
  if (d.action === "open") {
    if (
      typeof d.duration_minutes !== "number" ||
      d.duration_minutes < MIN_COMMAND_DURATION_MINUTES ||
      d.duration_minutes > MAX_COMMAND_DURATION_MINUTES
    ) {
      return {
        success: false,
        error: `duration_minutes must be between ${MIN_COMMAND_DURATION_MINUTES} and ${MAX_COMMAND_DURATION_MINUTES} for open action`,
      };
    }
  } else {
    if (d.duration_minutes !== null && d.duration_minutes !== undefined) {
      return {
        success: false,
        error: "duration_minutes must be null or undefined when action is 'closed'",
      };
    }
  }
  return {
    success: true,
    data: {
      command_id: d.command_id,
      client_request_id: d.client_request_id,
      valve_id: d.valve_id,
      action: d.action,
      duration_minutes: d.action === "open" ? (d.duration_minutes as number) : null,
    },
  };
}
