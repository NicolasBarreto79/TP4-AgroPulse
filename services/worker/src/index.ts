import { Kafka } from "kafkajs";
import { createClient } from "@supabase/supabase-js";
import {
  TOPIC_SOIL_MOISTURE,
  TOPIC_IRRIGATION_COMMANDS,
  validateSoilMoistureReading,
  validateIrrigationCommandPayload,
} from "@agropulse/contracts";

const brokers = (process.env.REDPANDA_BROKERS || "localhost:19092")
  .split(",")
  .map((b) => b.trim());

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const forceCommandFailure = process.env.FORCE_COMMAND_FAILURE === "true";

if (!serviceRoleKey || serviceRoleKey.includes("replace-with")) {
  console.warn(
    JSON.stringify({
      level: "warn",
      service: "worker",
      message: "SUPABASE_SERVICE_ROLE_KEY not configured or placeholder detected",
    }),
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey || "dummy-key", {
  auth: { autoRefreshToken: false, persistSession: false },
});

const kafka = new Kafka({
  clientId: "agropulse-worker",
  brokers,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: "agropulse-worker-group" });

// In-memory cache for station -> organization mapping
const stationOrgCache = new Map<string, string>();

async function getStationOrgId(stationId: string): Promise<string | null> {
  if (stationOrgCache.has(stationId)) {
    return stationOrgCache.get(stationId)!;
  }

  const { data, error } = await supabase
    .from("stations")
    .select("id, organization_id")
    .eq("id", stationId)
    .single();

  if (error || !data) {
    return null;
  }

  stationOrgCache.set(stationId, data.organization_id);
  return data.organization_id;
}

async function handleSoilMoisture(messageValue: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(messageValue);
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "discard_reading",
        reason: "invalid_json",
        raw: messageValue,
      }),
    );
    return;
  }

  const validation = validateSoilMoistureReading(parsed);
  if (!validation.success) {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "discard_reading",
        reason: validation.error,
        raw: parsed,
      }),
    );
    return;
  }

  const reading = validation.data;
  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      action: "consumed",
      topic: TOPIC_SOIL_MOISTURE,
      station_id: reading.station_id,
      moisture_pct: reading.moisture_pct,
      recorded_at: reading.recorded_at,
    }),
  );

  const orgId = await getStationOrgId(reading.station_id);
  if (!orgId) {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "discard_reading",
        reason: "unknown_station",
        station_id: reading.station_id,
      }),
    );
    return;
  }

  // Insert reading into database
  const { error: insertError } = await supabase.from("readings").insert({
    organization_id: orgId,
    station_id: reading.station_id,
    moisture_pct: reading.moisture_pct,
    temperature_c: reading.temperature_c,
    recorded_at: reading.recorded_at,
  });

  if (insertError) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "worker",
        action: "insert_reading_failed",
        station_id: reading.station_id,
        error: insertError.message,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      action: "upsert reading",
      station_id: reading.station_id,
      moisture_pct: reading.moisture_pct,
      recorded_at: reading.recorded_at,
    }),
  );

  // Check plot threshold and generate low_moisture alert if dry
  try {
    const { data: stationData } = await supabase
      .from("stations")
      .select("plot_id, plots(name, threshold_min)")
      .eq("id", reading.station_id)
      .single();

    if (stationData && stationData.plots) {
      const plotData: any = Array.isArray(stationData.plots) ? stationData.plots[0] : stationData.plots;
      if (plotData && typeof plotData.threshold_min === "number" && reading.moisture_pct < plotData.threshold_min) {
        const { data: openAlerts } = await supabase
          .from("alerts")
          .select("id")
          .eq("station_id", reading.station_id)
          .eq("kind", "low_moisture")
          .eq("status", "open")
          .limit(1);

        if (!openAlerts || openAlerts.length === 0) {
          await supabase.from("alerts").insert({
            organization_id: orgId,
            plot_id: stationData.plot_id,
            station_id: reading.station_id,
            kind: "low_moisture",
            status: "open",
            message: `Estrés hídrico en ${plotData.name}: Humedad ${reading.moisture_pct.toFixed(1)}% por debajo del umbral mínimo (${plotData.threshold_min}%).`,
          });
        }
      }
    }
  } catch (alertErr) {
    // Non-fatal
  }
}

async function handleIrrigationCommand(messageValue: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(messageValue);
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "discard_command",
        reason: "invalid_json",
      }),
    );
    return;
  }

  const validation = validateIrrigationCommandPayload(parsed);
  if (!validation.success) {
    console.warn(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "discard_command",
        reason: validation.error,
      }),
    );
    return;
  }

  const cmd = validation.data;
  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      action: "consumed_command",
      command_id: cmd.command_id,
      valve_id: cmd.valve_id,
      action_type: cmd.action,
    }),
  );

  // Simulated actuator delay (1 - 1.5 seconds)
  await new Promise((resolve) => setTimeout(resolve, 1200));

  if (forceCommandFailure) {
    // Deterministic failure test mode (RF-15 / RF-24 / defense)
    const { error } = await supabase
      .from("irrigation_commands")
      .update({
        status: "failed",
        failure_reason: "valve_timeout",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cmd.command_id)
      .eq("status", "pending");

    console.log(
      JSON.stringify({
        level: "warn",
        service: "worker",
        action: "command_forced_failed",
        command_id: cmd.command_id,
        error: error?.message,
      }),
    );
    return;
  }

  // CAS: atomic update only from 'pending'
  const now = new Date().toISOString();
  const { data: updatedCommand, error: cmdError } = await supabase
    .from("irrigation_commands")
    .update({
      status: "applied",
      applied_at: now,
      updated_at: now,
    })
    .eq("id", cmd.command_id)
    .eq("status", "pending")
    .select()
    .single();

  if (cmdError || !updatedCommand) {
    console.log(
      JSON.stringify({
        level: "info",
        service: "worker",
        action: "command_skipped_or_not_pending",
        command_id: cmd.command_id,
      }),
    );
    return;
  }

  // Update valve state
  const { error: valveError } = await supabase
    .from("valves")
    .update({
      status: cmd.action,
      updated_at: now,
    })
    .eq("id", cmd.valve_id);

  if (valveError) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "worker",
        action: "valve_update_failed",
        valve_id: cmd.valve_id,
        error: valveError.message,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      action: "applied",
      command_id: cmd.command_id,
      valve_id: cmd.valve_id,
      valve_status: cmd.action,
    }),
  );
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      status: "connecting",
      brokers,
      supabaseUrl,
    }),
  );

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_SOIL_MOISTURE, fromBeginning: false });
  await consumer.subscribe({ topic: TOPIC_IRRIGATION_COMMANDS, fromBeginning: false });

  console.log(
    JSON.stringify({
      level: "info",
      service: "worker",
      status: "connected_and_subscribed",
      topics: [TOPIC_SOIL_MOISTURE, TOPIC_IRRIGATION_COMMANDS],
    }),
  );

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const text = message.value.toString("utf-8");

      if (topic === TOPIC_SOIL_MOISTURE) {
        await handleSoilMoisture(text);
      } else if (topic === TOPIC_IRRIGATION_COMMANDS) {
        await handleIrrigationCommand(text);
      }
    },
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "worker",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
