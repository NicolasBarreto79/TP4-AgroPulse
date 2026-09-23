import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Svg, { Path, Line, Circle, Text as SvgText, Rect } from "react-native-svg";
import { colors } from "../theme/colors";

export interface DataPoint {
  recorded_at: string;
  moisture_pct: number;
}

interface HumidityChartProps {
  data: DataPoint[];
  thresholdMin?: number;
  thresholdMax?: number;
  height?: number;
}

export function HumidityChart({
  data,
  thresholdMin = 25,
  thresholdMax = 45,
  height = 180,
}: HumidityChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 64; // Padding around card
  const chartHeight = height;

  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 28;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>Sin registros de humedad recientes (6 horas)</Text>
      </View>
    );
  }

  // Sort chronological
  const sorted = [...data].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const minVal = 0;
  const maxVal = 60; // Max Y-scale for clear visualization of 0-60%

  const getY = (val: number) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return paddingTop + plotHeight - ((clamped - minVal) / (maxVal - minVal)) * plotHeight;
  };

  const getX = (index: number) => {
    if (sorted.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (sorted.length - 1)) * plotWidth;
  };

  // Build SVG Path
  const pathD = sorted.reduce((acc, point, i) => {
    const x = getX(i);
    const y = getY(point.moisture_pct);
    if (i === 0) return `M ${x} ${y}`;
    return `${acc} L ${x} ${y}`;
  }, "");

  const minThresholdY = getY(thresholdMin);
  const maxThresholdY = getY(thresholdMax);

  // Format time for first, middle, last points
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Background Grid Lines */}
        {[0, 20, 40, 60].map((tickVal) => {
          const y = getY(tickVal);
          return (
            <React.Fragment key={tickVal}>
              <Line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <SvgText
                x={paddingLeft - 6}
                y={y + 4}
                fill={colors.textMuted}
                fontSize={10}
                textAnchor="end"
              >
                {`${tickVal}%`}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Optimal Range Shaded Band */}
        <Rect
          x={paddingLeft}
          y={maxThresholdY}
          width={plotWidth}
          height={Math.max(0, minThresholdY - maxThresholdY)}
          fill="#E8F5E9"
          opacity={0.6}
        />

        {/* Min Threshold Line (Seco threshold) */}
        <Line
          x1={paddingLeft}
          y1={minThresholdY}
          x2={chartWidth - paddingRight}
          y2={minThresholdY}
          stroke={colors.status.dry}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />
        <SvgText
          x={chartWidth - paddingRight}
          y={minThresholdY - 4}
          fill={colors.status.dry}
          fontSize={10}
          fontWeight="bold"
          textAnchor="end"
        >
          {`Mín ${thresholdMin}%`}
        </SvgText>

        {/* Max Threshold Line */}
        <Line
          x1={paddingLeft}
          y1={maxThresholdY}
          x2={chartWidth - paddingRight}
          y2={maxThresholdY}
          stroke={colors.status.optimal}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />
        <SvgText
          x={chartWidth - paddingRight}
          y={maxThresholdY - 4}
          fill={colors.status.optimal}
          fontSize={10}
          fontWeight="bold"
          textAnchor="end"
        >
          {`Máx ${thresholdMax}%`}
        </SvgText>

        {/* The Moisture Series Path */}
        <Path d={pathD} fill="none" stroke={colors.primary} strokeWidth={2.5} />

        {/* Data points dots */}
        {sorted.map((point, i) => {
          const x = getX(i);
          const y = getY(point.moisture_pct);
          const isLatest = i === sorted.length - 1;
          const dotColor =
            point.moisture_pct < thresholdMin
              ? colors.status.dry
              : point.moisture_pct <= thresholdMax
                ? colors.status.optimal
                : colors.status.wet;

          return (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={isLatest ? 5 : 3.5}
              fill={dotColor}
              stroke={colors.white}
              strokeWidth={isLatest ? 2 : 1}
            />
          );
        })}

        {/* X-axis time labels */}
        {sorted.length > 0 && sorted[0] && (
          <>
            <SvgText
              x={getX(0)}
              y={chartHeight - 8}
              fill={colors.textMuted}
              fontSize={10}
              textAnchor="start"
            >
              {formatTime(sorted[0].recorded_at)}
            </SvgText>
            {sorted.length > 2 && sorted[Math.floor(sorted.length / 2)] && (
              <SvgText
                x={getX(Math.floor(sorted.length / 2))}
                y={chartHeight - 8}
                fill={colors.textMuted}
                fontSize={10}
                textAnchor="middle"
              >
                {formatTime(sorted[Math.floor(sorted.length / 2)]!.recorded_at)}
              </SvgText>
            )}
            {sorted[sorted.length - 1] && (
              <SvgText
                x={getX(sorted.length - 1)}
                y={chartHeight - 8}
                fill={colors.textMuted}
                fontSize={10}
                textAnchor="end"
              >
                {formatTime(sorted[sorted.length - 1]!.recorded_at)}
              </SvgText>
            )}
          </>
        )}
      </Svg>

      {/* Legend / Status indicator */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.status.dry }]} />
          <Text style={styles.legendText}>Bajo ({`<`}{thresholdMin}%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.status.optimal }]} />
          <Text style={styles.legendText}>Óptimo ({thresholdMin}-{thresholdMax}%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.status.wet }]} />
          <Text style={styles.legendText}>Húmedo ({`>`}{thresholdMax}%)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
  },
  emptyContainer: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    justifyContent: "center",
    padding: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
    width: "100%",
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 4,
    width: 8,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
});
