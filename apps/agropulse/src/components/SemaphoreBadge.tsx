import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { PlotStatus } from "@agropulse/contracts";
import { colors, statusColors, statusLabels } from "../theme/colors";

interface SemaphoreBadgeProps {
  status: PlotStatus;
  size?: "small" | "medium" | "large";
}

export function SemaphoreBadge({ status, size = "medium" }: SemaphoreBadgeProps) {
  const color = statusColors[status] || colors.status.stale;
  const label = statusLabels[status] || "Desconocido";

  return (
    <View
      style={[
        styles.badge,
        size === "small" && styles.badgeSmall,
        size === "large" && styles.badgeLarge,
        { backgroundColor: `${color}1A`, borderColor: `${color}4D` },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.text,
          size === "small" && styles.textSmall,
          size === "large" && styles.textLarge,
          { color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLarge: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeSmall: {
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    marginRight: 6,
    width: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
  textLarge: {
    fontSize: 14,
  },
  textSmall: {
    fontSize: 10,
  },
});
