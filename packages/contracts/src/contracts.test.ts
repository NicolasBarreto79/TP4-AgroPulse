import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlotStatus,
  formatReadingAge,
  validateSoilMoistureReading,
  validateIrrigationCommandPayload,
  isSoilMoistureReading,
  isIrrigationCommandPayload,
  DEFAULT_THRESHOLD_MIN,
  DEFAULT_THRESHOLD_MAX,
} from "./index.js";

describe("Contracts & Status Helpers", () => {
  describe("calculatePlotStatus", () => {
    const now = new Date("2026-09-23T18:00:00Z");

    it("returns 'stale' when there is no reading", () => {
      assert.equal(calculatePlotStatus(null, DEFAULT_THRESHOLD_MIN, DEFAULT_THRESHOLD_MAX, now), "stale");
      assert.equal(calculatePlotStatus(undefined, DEFAULT_THRESHOLD_MIN, DEFAULT_THRESHOLD_MAX, now), "stale");
    });

    it("returns 'stale' when reading is older than 15 minutes", () => {
      const sixteenMinsAgo = new Date(now.getTime() - 16 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 35, recorded_at: sixteenMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "stale"
      );
    });

    it("returns 'dry' when moisture < min threshold", () => {
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 24.9, recorded_at: fiveMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "dry"
      );
    });

    it("returns 'optimal' on lower boundary (25%)", () => {
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 25, recorded_at: fiveMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "optimal"
      );
    });

    it("returns 'optimal' on upper boundary (45%)", () => {
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 45, recorded_at: fiveMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "optimal"
      );
    });

    it("returns 'wet' when moisture > max threshold", () => {
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 45.1, recorded_at: fiveMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "wet"
      );
    });

    it("prioritizes stale over moisture reading", () => {
      const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
      assert.equal(
        calculatePlotStatus(
          { moisture_pct: 10, recorded_at: twentyMinsAgo },
          DEFAULT_THRESHOLD_MIN,
          DEFAULT_THRESHOLD_MAX,
          now
        ),
        "stale"
      );
    });
  });

  describe("formatReadingAge", () => {
    const now = new Date("2026-09-23T18:00:00Z");

    it("formats seconds correctly", () => {
      const date = new Date(now.getTime() - 45 * 1000).toISOString();
      assert.equal(formatReadingAge(date, now), "hace 45s");
    });

    it("formats minutes correctly", () => {
      const date = new Date(now.getTime() - 12 * 60 * 1000).toISOString();
      assert.equal(formatReadingAge(date, now), "hace 12m");
    });

    it("formats hours correctly", () => {
      const date = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
      assert.equal(formatReadingAge(date, now), "hace 3h");
    });

    it("returns 'Sin datos' for empty values", () => {
      assert.equal(formatReadingAge(null, now), "Sin datos");
      assert.equal(formatReadingAge(undefined, now), "Sin datos");
    });
  });

  describe("validateSoilMoistureReading", () => {
    it("accepts a valid telemetry payload", () => {
      const valid = {
        station_id: "30000000-0000-4000-8000-000000000001",
        moisture_pct: 35.5,
        temperature_c: 22.1,
        recorded_at: "2026-09-23T18:00:00Z",
      };
      assert.equal(isSoilMoistureReading(valid), true);
      const res = validateSoilMoistureReading(valid);
      assert.equal(res.success, true);
    });

    it("rejects moisture out of bounds", () => {
      const invalid = {
        station_id: "30000000-0000-4000-8000-000000000001",
        moisture_pct: 105,
        recorded_at: "2026-09-23T18:00:00Z",
      };
      assert.equal(isSoilMoistureReading(invalid), false);
      const res = validateSoilMoistureReading(invalid);
      assert.equal(res.success, false);
    });

    it("rejects invalid timestamp", () => {
      const invalid = {
        station_id: "30000000-0000-4000-8000-000000000001",
        moisture_pct: 30,
        recorded_at: "not-a-date",
      };
      assert.equal(isSoilMoistureReading(invalid), false);
      const res = validateSoilMoistureReading(invalid);
      assert.equal(res.success, false);
    });
  });

  describe("validateIrrigationCommandPayload", () => {
    it("accepts valid open command with duration", () => {
      const valid = {
        command_id: "c1",
        client_request_id: "r1",
        valve_id: "v1",
        action: "open",
        duration_minutes: 30,
      };
      assert.equal(isIrrigationCommandPayload(valid), true);
      const res = validateIrrigationCommandPayload(valid);
      assert.equal(res.success, true);
    });

    it("accepts valid closed command without duration", () => {
      const valid = {
        command_id: "c1",
        client_request_id: "r1",
        valve_id: "v1",
        action: "closed",
        duration_minutes: null,
      };
      assert.equal(isIrrigationCommandPayload(valid), true);
      const res = validateIrrigationCommandPayload(valid);
      assert.equal(res.success, true);
    });

    it("rejects open command with invalid duration (>120)", () => {
      const invalid = {
        command_id: "c1",
        client_request_id: "r1",
        valve_id: "v1",
        action: "open",
        duration_minutes: 150,
      };
      assert.equal(isIrrigationCommandPayload(invalid), false);
      const res = validateIrrigationCommandPayload(invalid);
      assert.equal(res.success, false);
    });

    it("rejects closed command with non-null duration", () => {
      const invalid = {
        command_id: "c1",
        client_request_id: "r1",
        valve_id: "v1",
        action: "closed",
        duration_minutes: 30,
      };
      assert.equal(isIrrigationCommandPayload(invalid), false);
      const res = validateIrrigationCommandPayload(invalid);
      assert.equal(res.success, false);
    });
  });
});
