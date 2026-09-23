import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { supabase } from "../../src/lib/supabase";
import { colors } from "../../src/theme/colors";
import { AcademicNotice } from "../../src/components/AcademicNotice";
import type { AlertKind, AlertStatus } from "@agropulse/contracts";

interface AlertItem {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  message: string;
  created_at: string;
  plots?: { name: string } | null;
  stations?: { name: string } | null;
}

export default function AlertsScreen() {
  const { activeOrg } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchAlerts = useCallback(async () => {
    if (!activeOrg) return;

    try {
      // Also generate live alerts if Costa 2 is dry or Monte A is stale
      const { data, error } = await supabase
        .from("alerts")
        .select("id, kind, status, message, created_at, plots(name), stations(name)")
        .eq("organization_id", activeOrg.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAlerts(data as any[]);
      }
    } catch (err) {
      console.error("Exception fetching alerts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    setLoading(true);
    fetchAlerts();

    const channel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          fetchAlerts();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const renderAlertCard = ({ item }: { item: AlertItem }) => {
    const isDry = item.kind === "low_moisture";
    const badgeColor = isDry ? colors.status.dry : colors.status.stale;
    const badgeBg = isDry ? colors.status.dryBg : colors.status.staleBg;
    const badgeLabel = isDry ? "Humedad Baja" : "Estación Desconectada";

    const date = new Date(item.created_at);
    const dateFormatted = `${date.toLocaleDateString("es-AR")} ${date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeColor }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
          <Text style={styles.dateText}>{dateFormatted}</Text>
        </View>

        <Text style={styles.messageText}>{item.message}</Text>

        {(item.plots?.name || item.stations?.name) && (
          <View style={styles.metaRow}>
            {item.plots?.name && (
              <Text style={styles.metaText}>🌱 Lote: {item.plots.name}</Text>
            )}
            {item.stations?.name && (
              <Text style={styles.metaText}>📡 Estación: {item.stations.name}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando alertas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertCard}
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
            <Text style={styles.title}>Alertas del Establecimiento</Text>
            <Text style={styles.subtitle}>
              Notificaciones de estrés hídrico y fallas de telemetría en tiempo real
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>Sin alertas activas</Text>
            <Text style={styles.emptySubtitle}>
              Todos los lotes se encuentran dentro de los parámetros configurados o no se registran anomalías.
            </Text>
          </View>
        }
        ListFooterComponent={<AcademicNotice />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
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
  dateText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginTop: 20,
    padding: 28,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    marginBottom: 16,
  },
  listContent: {
    padding: 16,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
});
