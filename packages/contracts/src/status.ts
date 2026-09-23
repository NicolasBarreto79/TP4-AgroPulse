import { PlotStatus } from "./domain.js";
import { STALE_THRESHOLD_MINUTES } from "./constants.js";

export function calculatePlotStatus(
  latestReading: { moisture_pct: number; recorded_at: string | Date } | null | undefined,
  thresholdMin: number,
  thresholdMax: number,
  referenceTime: Date = new Date()
): PlotStatus {
  if (!latestReading) {
    return "stale";
  }

  const recordedAtMs =
    typeof latestReading.recorded_at === "string"
      ? Date.parse(latestReading.recorded_at)
      : latestReading.recorded_at.getTime();

  if (isNaN(recordedAtMs)) {
    return "stale";
  }

  const diffMinutes = (referenceTime.getTime() - recordedAtMs) / (1000 * 60);
  if (diffMinutes > STALE_THRESHOLD_MINUTES) {
    return "stale";
  }

  if (latestReading.moisture_pct < thresholdMin) {
    return "dry";
  }

  if (latestReading.moisture_pct <= thresholdMax) {
    return "optimal";
  }

  return "wet";
}

export function formatReadingAge(
  recordedAt: string | Date | null | undefined,
  referenceTime: Date = new Date()
): string {
  if (!recordedAt) return "Sin datos";
  const ms = typeof recordedAt === "string" ? Date.parse(recordedAt) : recordedAt.getTime();
  if (isNaN(ms)) return "Fecha inválida";

  const diffSeconds = Math.max(0, Math.floor((referenceTime.getTime() - ms) / 1000));
  if (diffSeconds < 60) return `hace ${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays}d`;
}
