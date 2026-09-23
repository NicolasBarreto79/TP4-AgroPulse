export const TOPIC_SOIL_MOISTURE = "soil.moisture" as const;
export const TOPIC_WEATHER_TICK = "weather.tick" as const;
export const TOPIC_IRRIGATION_COMMANDS = "irrigation.commands" as const;

export const DEFAULT_THRESHOLD_MIN = 25;
export const DEFAULT_THRESHOLD_MAX = 45;
export const STALE_THRESHOLD_MINUTES = 15;
export const MAX_COMMAND_DURATION_MINUTES = 120;
export const MIN_COMMAND_DURATION_MINUTES = 1;
export const COMMAND_TIMEOUT_SECONDS = 5;
