export interface SoilMoistureReading {
  station_id: string;
  moisture_pct: number;
  temperature_c?: number | null;
  recorded_at: string;
}

export interface WeatherTick {
  station_id: string;
  rain_mm?: number | null;
  temperature_c?: number | null;
  recorded_at: string;
}

export function isSoilMoistureReading(data: unknown): data is SoilMoistureReading {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.station_id !== "string" || d.station_id.trim().length === 0) return false;
  if (
    typeof d.moisture_pct !== "number" ||
    isNaN(d.moisture_pct) ||
    d.moisture_pct < 0 ||
    d.moisture_pct > 100
  ) {
    return false;
  }
  if (d.temperature_c !== undefined && d.temperature_c !== null && typeof d.temperature_c !== "number") {
    return false;
  }
  if (typeof d.recorded_at !== "string" || isNaN(Date.parse(d.recorded_at))) return false;
  return true;
}

export function validateSoilMoistureReading(data: unknown):
  | { success: true; data: SoilMoistureReading }
  | { success: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { success: false, error: "Payload must be a non-null object" };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.station_id !== "string" || d.station_id.trim().length === 0) {
    return { success: false, error: "station_id must be a non-empty string UUID" };
  }
  if (
    typeof d.moisture_pct !== "number" ||
    isNaN(d.moisture_pct) ||
    d.moisture_pct < 0 ||
    d.moisture_pct > 100
  ) {
    return { success: false, error: "moisture_pct must be a number between 0 and 100" };
  }
  if (d.temperature_c !== undefined && d.temperature_c !== null && typeof d.temperature_c !== "number") {
    return { success: false, error: "temperature_c must be a number or null/undefined" };
  }
  if (typeof d.recorded_at !== "string" || isNaN(Date.parse(d.recorded_at))) {
    return { success: false, error: "recorded_at must be a valid ISO-8601 timestamp string" };
  }
  return {
    success: true,
    data: {
      station_id: d.station_id,
      moisture_pct: d.moisture_pct,
      temperature_c: typeof d.temperature_c === "number" ? d.temperature_c : null,
      recorded_at: d.recorded_at,
    },
  };
}

export function isWeatherTick(data: unknown): data is WeatherTick {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.station_id !== "string" || d.station_id.trim().length === 0) return false;
  if (d.rain_mm !== undefined && d.rain_mm !== null && typeof d.rain_mm !== "number") return false;
  if (d.temperature_c !== undefined && d.temperature_c !== null && typeof d.temperature_c !== "number") return false;
  if (typeof d.recorded_at !== "string" || isNaN(Date.parse(d.recorded_at))) return false;
  return true;
}

export function validateWeatherTick(data: unknown):
  | { success: true; data: WeatherTick }
  | { success: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return { success: false, error: "Payload must be a non-null object" };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.station_id !== "string" || d.station_id.trim().length === 0) {
    return { success: false, error: "station_id must be a non-empty string UUID" };
  }
  if (d.rain_mm !== undefined && d.rain_mm !== null && (typeof d.rain_mm !== "number" || d.rain_mm < 0)) {
    return { success: false, error: "rain_mm must be a positive number or null/undefined" };
  }
  if (d.temperature_c !== undefined && d.temperature_c !== null && typeof d.temperature_c !== "number") {
    return { success: false, error: "temperature_c must be a number or null/undefined" };
  }
  if (typeof d.recorded_at !== "string" || isNaN(Date.parse(d.recorded_at))) {
    return { success: false, error: "recorded_at must be a valid ISO-8601 timestamp string" };
  }
  return {
    success: true,
    data: {
      station_id: d.station_id,
      rain_mm: typeof d.rain_mm === "number" ? d.rain_mm : null,
      temperature_c: typeof d.temperature_c === "number" ? d.temperature_c : null,
      recorded_at: d.recorded_at,
    },
  };
}
