import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { supabase } from "../../src/lib/supabase";
import { SemaphoreBadge } from "../../src/components/SemaphoreBadge";
import { OrgSelector } from "../../src/components/OrgSelector";
import { AcademicNotice } from "../../src/components/AcademicNotice";
import { colors } from "../../src/theme/colors";
import { formatReadingAge, type PlotStatus } from "@agropulse/contracts";

interface PlotItem {
  plot_id: string;
  name: string;
  organization_id: string;
  status: PlotStatus;
  moisture_pct: number | null;
  recorded_at: string | null;
  threshold_min: number;
  threshold_max: number;
}

export default function PlotsListScreen() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const [plots, setPlots] = useState<PlotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchPlots = useCallback(async () => {
    if (!activeOrg) return;

    try {
      const { data, error } = await supabase
        .from("plot_statuses")
        .select("*")
        .eq("organization_id", activeOrg.id)
        .order("name");

      if (error) {
        console.error("Error fetching plot statuses:", error.message);
      } else if (data) {
        setPlots(data as PlotItem[]);
      }
    } catch (err) {
      console.error("Exception fetching plot statuses:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefreshed(new Date());
    }
  }, [activeOrg]);

  useEffect(() => {
    setLoading(true);
    fetchPlots();

    // Subscribe to Realtime readings to update plot status on new telemetry
    const channel = supabase
      .channel("plots-realtime-readings")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "readings" },
        () => {
          fetchPlots();
        },
      )
      .subscribe();

    // Refresh every 10s to update stale ages
    const interval = setInterval(fetchPlots, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchPlots]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlots();
  };

  const renderPlotCard = ({ item }: { item: PlotItem }) => {
    const ageText = formatReadingAge(item.recorded_at, lastRefreshed);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/plot/${item.plot_id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.plotName}>{item.name}</Text>
          <SemaphoreBadge status={item.status} size="small" />
        </View>

        <View style={styles.readingRow}>
          <View>
            <Text style={styles.readingLabel}>Humedad Actual</Text>
            <Text style={styles.readingValue}>
              {item.moisture_pct !== null ? `${item.moisture_pct.toFixed(1)}%` : "Sin lecturas"}
            </Text>
          </View>
          <View style={styles.ageContainer}>
            <Text style={styles.ageLabel}>Antigüedad</Text>
            <Text style={styles.ageValue}>{ageText}</Text>
          </View>
        </View>

        {/* Moisture progress bar */}
        {item.moisture_pct !== null && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.min(100, Math.max(0, (item.moisture_pct / 60) * 100))}%`,
                  backgroundColor:
                    item.status === "dry"
                      ? colors.status.dry
                      : item.status === "optimal"
                        ? colors.status.optimal
                        : item.status === "stale"
                          ? colors.status.stale
                          : colors.status.wet,
                },
              ]}
            />
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.thresholdText}>
            Umbrales: {item.threshold_min}% - {item.threshold_max}%
          </Text>
          <Text style={styles.viewDetailText}>Ver detalle →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando lotes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={plots}
        keyExtractor={(item) => item.plot_id}
        renderItem={renderPlotCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <OrgSelector />
            <Text style={styles.sectionTitle}>
              Lotes Monitoreados ({plots.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No hay lotes disponibles para este establecimiento.
            </Text>
          </View>
        }
        ListFooterComponent={<AcademicNotice />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ageContainer: {
    alignItems: "flex-end",
  },
  ageLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  ageValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardFooter: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  centerContainer: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: 20,
    padding: 24,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  header: {
    marginBottom: 12,
  },
  listContent: {
    padding: 16,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
  plotName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  progressBar: {
    borderRadius: 3,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 3,
    height: 6,
    marginVertical: 10,
    overflow: "hidden",
    width: "100%",
  },
  readingLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  readingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  readingValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  thresholdText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  viewDetailText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
});
