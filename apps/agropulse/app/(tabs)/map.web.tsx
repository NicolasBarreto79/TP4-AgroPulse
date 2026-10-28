import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { supabase } from "../../src/lib/supabase";
import { colors, statusColors } from "../../src/theme/colors";
import type { PlotStatus } from "@agropulse/contracts";

interface PlotGeom {
  id: string;
  name: string;
  status: PlotStatus;
  crop?: string;
  valveState?: "open" | "closed";
  moisture?: number;
  center: { latitude: number; longitude: number };
}

export default function MapWebScreen() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const [plots, setPlots] = useState<PlotGeom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [insidePlotName, setInsidePlotName] = useState<string | null>("Costa 1");
  const [locationStatus, setLocationStatus] = useState<string>("GPS Simulado en Establecimiento");

  const parseCoordinates = (plotName: string) => {
    switch (plotName) {
      case "Costa 1":
        return { latitude: -31.395, longitude: -58.045, crop: "Cítricos (Naranjas)", moisture: 34.5 };
      case "Costa 2":
        return { latitude: -31.395, longitude: -58.025, crop: "Arándanos", moisture: 18.2 };
      case "Monte A":
        return { latitude: -31.395, longitude: -58.005, crop: "Nuez Pecán", moisture: 42.0 };
      default:
        return { latitude: -31.445, longitude: -58.095, crop: "Pasturas Mixtas", moisture: 28.0 };
    }
  };

  const fetchMapPlots = useCallback(async () => {
    if (!activeOrg) return;

    try {
      const { data, error } = await supabase
        .from("plot_statuses")
        .select("plot_id, name, status, organization_id")
        .eq("organization_id", activeOrg.id);

      if (error) {
        console.error("Error loading plots for map:", error.message);
        return;
      }

      if (data) {
        const mapped: PlotGeom[] = data.map((p) => {
          const info = parseCoordinates(p.name);
          return {
            id: p.plot_id,
            name: p.name,
            status: p.status as PlotStatus,
            crop: info.crop,
            moisture: info.moisture,
            center: { latitude: info.latitude, longitude: info.longitude },
          };
        });
        setPlots(mapped);
      }
    } catch (err) {
      console.error("Exception fetching map plots:", err);
    } finally {
      setLoading(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    fetchMapPlots();
  }, [fetchMapPlots]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando mapa satelital...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top GPS Status Banner */}
      <View style={styles.gpsBanner}>
        <View style={styles.gpsDot} />
        <Text style={styles.gpsText}>
          {insidePlotName
            ? `📍 Estás dentro del lote: ${insidePlotName}`
            : userLocation
              ? `📍 Posición GPS: ${userLocation.coords.latitude.toFixed(4)}, ${userLocation.coords.longitude.toFixed(4)}`
              : locationStatus}
        </Text>
      </View>

      {/* Cadastral / Satellite Map Viewer */}
      <ScrollView contentContainerStyle={styles.mapCanvas} bounces={false}>
        <View style={styles.mapGridHeader}>
          <Text style={styles.mapCoords}>Concordia, Entre Ríos (PostGIS EPSG:4326)</Text>
          <View style={styles.badgeGps}>
            <Text style={styles.badgeGpsText}>🛰️ Modo Satélite Activo</Text>
          </View>
        </View>

        <View style={styles.parcelsContainer}>
          {plots.map((plot) => {
            const color = statusColors[plot.status] || colors.status.stale;
            const isInside = insidePlotName === plot.name;

            return (
              <TouchableOpacity
                key={plot.id}
                style={[
                  styles.parcelCard,
                  { borderColor: color, backgroundColor: `${color}12` },
                  isInside && styles.parcelCardInside,
                ]}
                activeOpacity={0.8}
                onPress={() => router.push(`/plot/${plot.id}`)}
              >
                <View style={styles.parcelHeader}>
                  <View style={styles.parcelNameRow}>
                    <View style={[styles.statusIndicator, { backgroundColor: color }]} />
                    <Text style={styles.parcelName}>{plot.name}</Text>
                  </View>
                  <Text style={[styles.parcelStatusBadge, { color }]}>
                    {plot.status.toUpperCase()}
                  </Text>
                </View>

                <Text style={styles.parcelCrop}>{plot.crop}</Text>

                <View style={styles.parcelFooter}>
                  <Text style={styles.parcelCoords}>
                    {plot.center.latitude.toFixed(3)}° S, {plot.center.longitude.toFixed(3)}° W
                  </Text>
                  {isInside && (
                    <View style={styles.insideBadge}>
                      <Text style={styles.insideBadgeText}>Tu Ubicación Actual</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Map Legend Overlay */}
      <View style={styles.legendOverlay}>
        <Text style={styles.legendTitle}>Estado de Lotes</Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: colors.status.optimal }]} />
          <Text style={styles.legendLabel}>Óptimo</Text>
          <View
            style={[styles.legendDot, { backgroundColor: colors.status.dry, marginLeft: 12 }]}
          />
          <Text style={styles.legendLabel}>Seco</Text>
          <View
            style={[styles.legendDot, { backgroundColor: colors.status.stale, marginLeft: 12 }]}
          />
          <Text style={styles.legendLabel}>Desconectado</Text>
        </View>
        <Text style={styles.legendTip}>Toca una parcela para ver telemetría y válvulas</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  gpsBanner: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    elevation: 3,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10,
  },
  gpsDot: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  gpsText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  mapCanvas: {
    padding: 16,
    paddingBottom: 110,
  },
  mapGridHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  mapCoords: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  badgeGps: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGpsText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  parcelsContainer: {
    gap: 14,
  },
  parcelCard: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  parcelCardInside: {
    borderStyle: "dashed",
    borderWidth: 2.5,
  },
  parcelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  parcelNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  parcelName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  parcelStatusBadge: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  parcelCrop: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 10,
  },
  parcelFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  parcelCoords: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  insideBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  insideBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 4,
    width: 8,
  },
  legendLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  legendOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    bottom: 20,
    elevation: 4,
    left: 16,
    padding: 12,
    position: "absolute",
    right: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 4,
  },
  legendTip: {
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 6,
  },
  legendTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
});
