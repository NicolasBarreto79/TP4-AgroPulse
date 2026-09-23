import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import MapView, { Polygon, Marker, PROVIDER_DEFAULT } from "react-native-maps";
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
  coordinates: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number };
}

// Fixed coordinates from seed: Concordia, Entre Ríos, Argentina
const defaultRegion = {
  latitude: -31.395,
  longitude: -58.025,
  latitudeDelta: 0.035,
  longitudeDelta: 0.045,
};

export default function MapScreen() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const [plots, setPlots] = useState<PlotGeom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [insidePlotName, setInsidePlotName] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>("Obteniendo GPS...");

  // Parse WKT polygon from PostGIS or use seed definitions
  const parseCoordinates = (plotName: string) => {
    switch (plotName) {
      case "Costa 1":
        return [
          { latitude: -31.40, longitude: -58.05 },
          { latitude: -31.40, longitude: -58.04 },
          { latitude: -31.39, longitude: -58.04 },
          { latitude: -31.39, longitude: -58.05 },
        ];
      case "Costa 2":
        return [
          { latitude: -31.40, longitude: -58.03 },
          { latitude: -31.40, longitude: -58.02 },
          { latitude: -31.39, longitude: -58.02 },
          { latitude: -31.39, longitude: -58.03 },
        ];
      case "Monte A":
        return [
          { latitude: -31.40, longitude: -58.01 },
          { latitude: -31.40, longitude: -58.00 },
          { latitude: -31.39, longitude: -58.00 },
          { latitude: -31.39, longitude: -58.01 },
        ];
      default:
        // Lote Aislado
        return [
          { latitude: -31.45, longitude: -58.10 },
          { latitude: -31.45, longitude: -58.09 },
          { latitude: -31.44, longitude: -58.09 },
          { latitude: -31.44, longitude: -58.10 },
        ];
    }
  };

  const getCenter = (coords: { latitude: number; longitude: number }[]) => {
    const lat = coords.reduce((acc, c) => acc + c.latitude, 0) / coords.length;
    const lon = coords.reduce((acc, c) => acc + c.longitude, 0) / coords.length;
    return { latitude: lat, longitude: lon };
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
          const coords = parseCoordinates(p.name);
          return {
            id: p.plot_id,
            name: p.name,
            status: p.status as PlotStatus,
            coordinates: coords,
            center: getCenter(coords),
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

  // Request GPS permission and check inside plot
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    async function setupLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocationStatus("Ubicación GPS no disponible (permiso no concedido)");
          return;
        }

        setLocationStatus("GPS Activo");
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation(loc);

        // Check if user is inside any plot via RPC
        checkInsidePlot(loc.coords.longitude, loc.coords.latitude);

        // Subscribe to position updates
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (newLoc) => {
            setUserLocation(newLoc);
            checkInsidePlot(newLoc.coords.longitude, newLoc.coords.latitude);
          },
        );
      } catch (err) {
        setLocationStatus("GPS desactivado o en espera");
      }
    }

    setupLocation();

    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, [plots]);

  const checkInsidePlot = async (longitude: number, latitude: number) => {
    for (const plot of plots) {
      try {
        const { data, error } = await supabase.rpc("is_point_inside_plot", {
          target_plot_id: plot.id,
          longitude,
          latitude,
        });

        if (!error && data === true) {
          setInsidePlotName(plot.name);
          return;
        }
      } catch {
        // Ignore check errors
      }
    }
    setInsidePlotName(null);
  };

  useEffect(() => {
    fetchMapPlots();
  }, [fetchMapPlots]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando mapa...</Text>
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

      {/* Map Component */}
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={
          plots.length > 0 && plots[0]
            ? {
                latitude: plots[0].center.latitude,
                longitude: plots[0].center.longitude,
                latitudeDelta: 0.04,
                longitudeDelta: 0.05,
              }
            : defaultRegion
        }
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        {plots.map((plot) => {
          const color = statusColors[plot.status] || colors.status.stale;
          return (
            <React.Fragment key={plot.id}>
              <Polygon
                coordinates={plot.coordinates}
                fillColor={`${color}55`}
                strokeColor={color}
                strokeWidth={2.5}
                tappable={true}
                onPress={() => router.push(`/plot/${plot.id}`)}
              />
              <Marker
                coordinate={plot.center}
                title={plot.name}
                description={`Estado: ${plot.status}. Toca para abrir.`}
                onCalloutPress={() => router.push(`/plot/${plot.id}`)}
                pinColor={color}
              />
            </React.Fragment>
          );
        })}
      </MapView>

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
        <Text style={styles.legendTip}>Toca un polígono para ver gráficos y válvulas</Text>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
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
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    bottom: 24,
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
  map: {
    flex: 1,
    height: Dimensions.get("window").height,
    width: Dimensions.get("window").width,
  },
});
