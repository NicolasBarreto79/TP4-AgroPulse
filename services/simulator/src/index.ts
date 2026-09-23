import { Kafka, Partitioners } from "kafkajs";
import {
  TOPIC_SOIL_MOISTURE,
  TOPIC_WEATHER_TICK,
  type SoilMoistureReading,
  type WeatherTick,
} from "@agropulse/contracts";

const brokers = (process.env.REDPANDA_BROKERS || "localhost:19092")
  .split(",")
  .map((b) => b.trim());

const simulateMonteA = process.env.SIMULATE_MONTE_A === "true";
const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS || 5000);

const kafka = new Kafka({
  clientId: "agropulse-simulator",
  brokers,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

interface SimulatedStation {
  id: string;
  name: string;
  baseMoisture: number;
  baseTemp: number;
  enabled: boolean;
}

const stations: SimulatedStation[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Station Costa 1",
    baseMoisture: 35.0, // Optimal (25 - 45)
    baseTemp: 22.5,
    enabled: true,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    name: "Station Costa 2",
    baseMoisture: 18.0, // Dry (< 25)
    baseTemp: 23.5,
    enabled: true,
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    name: "Station Monte A",
    baseMoisture: 32.0,
    baseTemp: 21.0,
    enabled: simulateMonteA, // Disabled by default to demonstrate Stale state (> 15 min)
  },
];

function generateJitter(range: number): number {
  return (Math.random() - 0.5) * 2 * range;
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify({
      level: "info",
      service: "simulator",
      status: "connecting",
      brokers,
      stations: stations.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })),
    }),
  );

  await producer.connect();
  console.log(
    JSON.stringify({
      level: "info",
      service: "simulator",
      status: "connected",
    }),
  );

  const tick = async () => {
    const now = new Date().toISOString();

    for (const station of stations) {
      if (!station.enabled) continue;

      const moisture = Math.round((station.baseMoisture + generateJitter(0.8)) * 10) / 10;
      const temperature = Math.round((station.baseTemp + generateJitter(0.5)) * 10) / 10;

      const moistureReading: SoilMoistureReading = {
        station_id: station.id,
        moisture_pct: moisture,
        temperature_c: temperature,
        recorded_at: now,
      };

      try {
        await producer.send({
          topic: TOPIC_SOIL_MOISTURE,
          messages: [
            {
              key: station.id,
              value: JSON.stringify(moistureReading),
            },
          ],
        });

        console.log(
          JSON.stringify({
            level: "info",
            action: "produced",
            topic: TOPIC_SOIL_MOISTURE,
            station_id: station.id,
            station_name: station.name,
            moisture_pct: moisture,
            temperature_c: temperature,
            recorded_at: now,
          }),
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            action: "produce_failed",
            station_id: station.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  };

  // Initial tick followed by interval
  await tick();
  setInterval(() => {
    void tick();
  }, tickIntervalMs);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "simulator",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
