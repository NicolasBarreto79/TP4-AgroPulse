import { Kafka, Partitioners } from "kafkajs";
import { createClient } from "@supabase/supabase-js";
import { TOPIC_IRRIGATION_COMMANDS } from "@agropulse/contracts";

const brokers = (process.env.REDPANDA_BROKERS || "localhost:19092")
  .split(",")
  .map((b) => b.trim());

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 500);

const supabase = createClient(supabaseUrl, serviceRoleKey || "dummy-key", {
  auth: { autoRefreshToken: false, persistSession: false },
});

const kafka = new Kafka({
  clientId: "agropulse-command-publisher",
  brokers,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

async function sweepExpiredDeadlines(): Promise<void> {
  const now = new Date().toISOString();

  // Only target outbox rows that have NOT been published yet
  const { data: unpublishedOutbox, error: outboxErr } = await supabase
    .from("command_outbox")
    .select("command_id")
    .is("published_at", null)
    .is("expired_at", null);

  if (outboxErr || !unpublishedOutbox || unpublishedOutbox.length === 0) {
    return;
  }

  const unpublishedCommandIds = unpublishedOutbox.map((r) => r.command_id);

  // Find commands pending whose dispatch deadline has expired without publication
  const { data: expiredCommands, error } = await supabase
    .from("irrigation_commands")
    .select("id, client_request_id, valve_id, dispatch_deadline_at")
    .in("id", unpublishedCommandIds)
    .eq("status", "pending")
    .lt("dispatch_deadline_at", now);

  if (error || !expiredCommands || expiredCommands.length === 0) {
    return;
  }

  for (const cmd of expiredCommands) {
    // Atomic CAS to failed
    const { data: updated } = await supabase
      .from("irrigation_commands")
      .update({
        status: "failed",
        failure_reason: "dispatch_timeout",
        updated_at: now,
      })
      .eq("id", cmd.id)
      .eq("status", "pending")
      .select()
      .single();

    if (updated) {
      // Expire outbox record
      await supabase
        .from("command_outbox")
        .update({ expired_at: now })
        .eq("command_id", cmd.id)
        .is("published_at", null);

      console.warn(
        JSON.stringify({
          level: "warn",
          service: "command-publisher",
          action: "dispatch_timeout",
          command_id: cmd.id,
          valve_id: cmd.valve_id,
          dispatch_deadline_at: cmd.dispatch_deadline_at,
        }),
      );
    }
  }
}

async function processOutbox(): Promise<void> {
  // Query un-published, un-expired outbox entries
  const { data: outboxRows, error } = await supabase
    .from("command_outbox")
    .select("id, command_id, topic, payload, attempt_count")
    .is("published_at", null)
    .is("expired_at", null)
    .lte("available_at", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(10);

  if (error || !outboxRows || outboxRows.length === 0) {
    return;
  }

  for (const row of outboxRows) {
    try {
      const topic = row.topic || TOPIC_IRRIGATION_COMMANDS;
      await producer.send({
        topic,
        messages: [
          {
            key: row.command_id,
            value: JSON.stringify(row.payload),
          },
        ],
      });

      const publishedAt = new Date().toISOString();
      await supabase
        .from("command_outbox")
        .update({
          published_at: publishedAt,
          attempt_count: row.attempt_count + 1,
        })
        .eq("id", row.id);

      console.log(
        JSON.stringify({
          level: "info",
          service: "command-publisher",
          action: "published",
          topic,
          command_id: row.command_id,
          published_at: publishedAt,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "command-publisher",
          action: "publish_failed",
          command_id: row.command_id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      await supabase
        .from("command_outbox")
        .update({
          attempt_count: row.attempt_count + 1,
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", row.id);
    }
  }
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify({
      level: "info",
      service: "command-publisher",
      status: "connecting",
      brokers,
      supabaseUrl,
    }),
  );

  await producer.connect();
  console.log(
    JSON.stringify({
      level: "info",
      service: "command-publisher",
      status: "connected",
    }),
  );

  setInterval(async () => {
    try {
      await processOutbox();
      await sweepExpiredDeadlines();
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "command-publisher",
          action: "poll_cycle_error",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }, pollIntervalMs);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "command-publisher",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
