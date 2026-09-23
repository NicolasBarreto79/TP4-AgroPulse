import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useAuth } from "../../src/context/AuthContext";
import { supabase } from "../../src/lib/supabase";
import { colors } from "../../src/theme/colors";
import { AcademicNotice } from "../../src/components/AcademicNotice";

interface DiagnosisData {
  lastTickTimestamp: string | null;
  lastTickStation: string | null;
  lastTickMoisture: number | null;
  lagSeconds: number | null;
  plotCount: number;
  stationCount: number;
  valveCount: number;
  lastChecked: Date;
}

export default function DiagnosisScreen() {
  const { user, activeOrg, activeRole } = useAuth();
  const [data, setData] = useState<DiagnosisData>({
    lastTickTimestamp: null,
    lastTickStation: null,
    lastTickMoisture: null,
    lagSeconds: null,
    plotCount: 0,
    stationCount: 0,
    valveCount: 0,
    lastChecked: new Date(),
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchDiagnosis = async () => {
    if (!activeOrg) return;

    try {
      // 1. Fetch latest reading across org
      const { data: latestReading } = await supabase
        .from("readings")
        .select("recorded_at, moisture_pct, stations(name)")
        .eq("organization_id", activeOrg.id)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Fetch counts
      const [plotsRes, stationsRes, valvesRes] = await Promise.all([
        supabase.from("plots").select("id", { count: "exact", head: true }).eq("organization_id", activeOrg.id),
        supabase.from("stations").select("id", { count: "exact", head: true }).eq("organization_id", activeOrg.id),
        supabase.from("valves").select("id", { count: "exact", head: true }).eq("organization_id", activeOrg.id),
      ]);

      const now = new Date();
      let lag: number | null = null;
      if (latestReading?.recorded_at) {
        const recordedMs = new Date(latestReading.recorded_at).getTime();
        lag = Math.max(0, Math.round((now.getTime() - recordedMs) / 1000));
      }

      setData({
        lastTickTimestamp: latestReading?.recorded_at ?? null,
        lastTickStation: (latestReading as any)?.stations?.name ?? null,
        lastTickMoisture: latestReading?.moisture_pct ?? null,
        lagSeconds: lag,
        plotCount: plotsRes.count ?? 0,
        stationCount: stationsRes.count ?? 0,
        valveCount: valvesRes.count ?? 0,
        lastChecked: now,
      });
    } catch (err) {
      console.error("Error in diagnosis fetch:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();

    // Auto refresh every 5 seconds for live lag tracking
    const interval = setInterval(fetchDiagnosis, 5000);
    return () => clearInterval(interval);
  }, [activeOrg]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDiagnosis();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={styles.title}>Diagnóstico Académico (RF-23)</Text>
      <Text style={styles.subtitle}>Telemetría, latencia aparente y contexto de seguridad</Text>

      {/* Identity Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Identidad y Autorización</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Usuario (Email):</Text>
          <Text style={styles.valueBold}>{user?.email}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>User ID (Auth.UID):</Text>
          <Text style={styles.valueMono}>{user?.id}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Rol activo:</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{activeRole?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Establecimiento:</Text>
          <Text style={styles.valueBold}>{activeOrg?.name}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Org ID (Tenant):</Text>
          <Text style={styles.valueMono}>{activeOrg?.id}</Text>
        </View>
      </View>

      {/* Telemetry & Latency Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pulso de Telemetría (Kafka/Redpanda)</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Último tick recibido:</Text>
          <Text style={styles.valueBold}>
            {data.lastTickTimestamp
              ? new Date(data.lastTickTimestamp).toLocaleTimeString("es-AR")
              : "Sin ticks"}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Estación emisora:</Text>
          <Text style={styles.value}>{data.lastTickStation || "—"}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Humedad reportada:</Text>
          <Text style={styles.valueBold}>
            {data.lastTickMoisture !== null ? `${data.lastTickMoisture.toFixed(1)}%` : "—"}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Lag aparente:</Text>
          <View
            style={[
              styles.lagBadge,
              {
                backgroundColor:
                  data.lagSeconds === null
                    ? colors.surfaceSubtle
                    : data.lagSeconds <= 3
                      ? colors.status.optimalBg
                      : data.lagSeconds <= 10
                        ? colors.status.optimalBg
                        : colors.status.dryBg,
              },
            ]}
          >
            <Text
              style={[
                styles.lagText,
                {
                  color:
                    data.lagSeconds === null
                      ? colors.textMuted
                      : data.lagSeconds <= 3
                        ? colors.status.optimal
                        : data.lagSeconds <= 10
                          ? colors.warning
                          : colors.status.dry,
                },
              ]}
            >
              {data.lagSeconds !== null ? `${data.lagSeconds} segundos` : "N/A"}
            </Text>
          </View>
        </View>
      </View>

      {/* Domain Entities Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recursos en Base de Datos</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{data.plotCount}</Text>
            <Text style={styles.statLabel}>Lotes</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{data.stationCount}</Text>
            <Text style={styles.statLabel}>Estaciones</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{data.valveCount}</Text>
            <Text style={styles.statLabel}>Válvulas</Text>
          </View>
        </View>
      </View>

      <AcademicNotice />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  cardTitle: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
    paddingBottom: 6,
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: 16,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  lagBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  lagText: {
    fontSize: 12,
    fontWeight: "700",
  },
  roleBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 5,
  },
  statBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  statNumber: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 16,
    marginTop: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  value: {
    color: colors.textPrimary,
    fontSize: 13,
  },
  valueBold: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  valueMono: {
    color: colors.textMuted,
    fontFamily: "monospace",
    fontSize: 10,
    maxWidth: "55%",
  },
});
