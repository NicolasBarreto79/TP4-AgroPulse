import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/context/AuthContext";
import { SemaphoreBadge } from "../../src/components/SemaphoreBadge";
import { HumidityChart, type DataPoint } from "../../src/components/HumidityChart";
import { AcademicNotice } from "../../src/components/AcademicNotice";
import { colors } from "../../src/theme/colors";
import { generateUUID } from "../../src/lib/uuid";
import { formatReadingAge, type PlotStatus, type ValveStatus, type CommandStatus } from "@agropulse/contracts";

interface PlotDetail {
  plot_id: string;
  organization_id: string;
  name: string;
  threshold_min: number;
  threshold_max: number;
  moisture_pct: number | null;
  recorded_at: string | null;
  status: PlotStatus;
}

interface ValveItem {
  id: string;
  name: string;
  status: ValveStatus;
  updated_at: string;
}

interface CommandItem {
  id: string;
  valve_id: string;
  action: ValveStatus;
  duration_minutes: number | null;
  status: CommandStatus;
  failure_reason: string | null;
  accepted_at: string;
  applied_at: string | null;
}

export default function PlotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeRole, user } = useAuth();

  const [plot, setPlot] = useState<PlotDetail | null>(null);
  const [valves, setValves] = useState<ValveItem[]>([]);
  const [readings, setReadings] = useState<DataPoint[]>([]);
  const [recentCommands, setRecentCommands] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Threshold editing state
  const [minInput, setMinInput] = useState<string>("");
  const [maxInput, setMaxInput] = useState<string>("");
  const [savingThresholds, setSavingThresholds] = useState<boolean>(false);

  // Irrigation open modal
  const [selectedValve, setSelectedValve] = useState<ValveItem | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);

  const isProducer = activeRole === "producer";
  const canActuate = activeRole === "producer" || activeRole === "operator";

  const fetchPlotDetails = useCallback(async () => {
    if (!id) return;

    try {
      // 1. Fetch Plot status & metadata
      const { data: statusData, error: statusErr } = await supabase
        .from("plot_statuses")
        .select("*")
        .eq("plot_id", id)
        .single();

      if (statusErr || !statusData) {
        // Fallback to plots table if plot_statuses hasn't loaded yet
        const { data: rawPlot } = await supabase.from("plots").select("*").eq("id", id).single();
        if (rawPlot) {
          setPlot({
            plot_id: rawPlot.id,
            organization_id: rawPlot.organization_id,
            name: rawPlot.name,
            threshold_min: Number(rawPlot.threshold_min),
            threshold_max: Number(rawPlot.threshold_max),
            moisture_pct: null,
            recorded_at: null,
            status: "stale",
          });
          setMinInput(String(rawPlot.threshold_min));
          setMaxInput(String(rawPlot.threshold_max));
        }
      } else {
        const item: PlotDetail = {
          plot_id: statusData.plot_id,
          organization_id: statusData.organization_id,
          name: statusData.name,
          threshold_min: Number(statusData.threshold_min),
          threshold_max: Number(statusData.threshold_max),
          moisture_pct: statusData.moisture_pct !== null ? Number(statusData.moisture_pct) : null,
          recorded_at: statusData.recorded_at,
          status: statusData.status,
        };
        setPlot(item);
        setMinInput(String(item.threshold_min));
        setMaxInput(String(item.threshold_max));
      }

      // 2. Fetch stations and 6h readings
      const { data: stations } = await supabase
        .from("stations")
        .select("id")
        .eq("plot_id", id);

      if (stations && stations.length > 0) {
        const stationIds = stations.map((s) => s.id);
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

        const { data: readingData } = await supabase
          .from("readings")
          .select("recorded_at, moisture_pct")
          .in("station_id", stationIds)
          .gte("recorded_at", sixHoursAgo)
          .order("recorded_at", { ascending: true })
          .limit(100);

        if (readingData) {
          setReadings(
            readingData.map((r) => ({
              recorded_at: r.recorded_at,
              moisture_pct: Number(r.moisture_pct),
            }))
          );
        }
      }

      // 3. Fetch Valves
      const { data: valveData } = await supabase
        .from("valves")
        .select("id, name, status, updated_at")
        .eq("plot_id", id)
        .order("name");

      if (valveData) {
        setValves(valveData as ValveItem[]);

        // 4. Fetch Recent Commands for these valves
        if (valveData.length > 0) {
          const vIds = valveData.map((v) => v.id);
          const { data: cmdData } = await supabase
            .from("irrigation_commands")
            .select("id, valve_id, action, duration_minutes, status, failure_reason, accepted_at, applied_at")
            .in("valve_id", vIds)
            .order("accepted_at", { ascending: false })
            .limit(5);

          if (cmdData) {
            setRecentCommands(cmdData as CommandItem[]);
          }
        }
      }
    } catch (err) {
      console.error("Exception fetching plot details:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPlotDetails();

    // Setup Realtime subscriptions for live telemetry & command state transitions
    const channel = supabase
      .channel(`plot-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "readings" }, () => {
        fetchPlotDetails();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "valves" }, () => {
        fetchPlotDetails();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "irrigation_commands" }, () => {
        fetchPlotDetails();
      })
      .subscribe();

    const interval = setInterval(fetchPlotDetails, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchPlotDetails, id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPlotDetails();
  };

  // Handle Save Thresholds
  const handleSaveThresholds = async () => {
    if (!isProducer) {
      Alert.alert("Acción no permitida", "Solo el rol Productor puede modificar los umbrales.");
      return;
    }

    const min = parseFloat(minInput);
    const max = parseFloat(maxInput);

    if (isNaN(min) || isNaN(max) || min < 0 || max > 100 || min >= max) {
      Alert.alert(
        "Umbrales Inválidos",
        "El umbral mínimo debe ser menor que el máximo y ambos deben estar entre 0% y 100%."
      );
      return;
    }

    setSavingThresholds(true);
    try {
      const { data, error } = await supabase.rpc("update_plot_thresholds", {
        target_plot_id: id,
        new_min: min,
        new_max: max,
      });

      if (error) {
        Alert.alert("Error al guardar", error.message);
      } else {
        Alert.alert("Éxito", "Umbrales agronómicos actualizados correctamente.");
        fetchPlotDetails();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Error al actualizar umbrales.");
    } finally {
      setSavingThresholds(false);
    }
  };

  // Open Irrigation Prompt
  const handleOpenIrrigationPrompt = (valve: ValveItem) => {
    if (!canActuate) {
      Alert.alert(
        "Solo Lectura",
        "El rol Asesor Técnico no cuenta con permisos para operar válvulas de riego."
      );
      return;
    }
    setSelectedValve(valve);
    setSelectedDuration(30);
    setModalVisible(true);
  };

  // Confirm Open Valve Command
  const handleConfirmOpen = async () => {
    if (!selectedValve) return;
    setModalVisible(false);
    setActionLoading(true);

    try {
      const requestId = generateUUID();
      const { data, error } = await supabase.rpc("create_irrigation_command", {
        target_valve_id: selectedValve.id,
        request_id: requestId,
        requested_action: "open",
        requested_duration_minutes: selectedDuration,
      });

      if (error) {
        Alert.alert("Error al emitir comando", error.message);
      } else {
        // Command queued in outbox! It will be dispatched to Redpanda and applied in <5s
        fetchPlotDetails();
      }
    } catch (err: any) {
      Alert.alert("Error inesperado", err.message || "No se pudo emitir el comando.");
    } finally {
      setActionLoading(false);
    }
  };

  // Close Valve Command
  const handleCloseValve = (valve: ValveItem) => {
    if (!canActuate) {
      Alert.alert("Solo Lectura", "No tiene permisos para operar válvulas de riego.");
      return;
    }

    Alert.alert(
      "Confirmar Cierre de Riego",
      `¿Desea cerrar inmediatamente la válvula "${valve.name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar Válvula",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              const requestId = generateUUID();
              const { error } = await supabase.rpc("create_irrigation_command", {
                target_valve_id: valve.id,
                request_id: requestId,
                requested_action: "closed",
                requested_duration_minutes: null,
              });

              if (error) {
                Alert.alert("Error al cerrar válvula", error.message);
              } else {
                fetchPlotDetails();
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Error al emitir comando de cierre.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Cancel Pending Command
  const handleCancelCommand = async (commandId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("cancel_irrigation_command", {
        target_command_id: commandId,
      });

      if (error) {
        Alert.alert("Error al cancelar", error.message);
      } else {
        Alert.alert("Cancelado", "El comando de riego pendiente fue cancelado.");
        fetchPlotDetails();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Error al cancelar comando.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando telemetría del lote...</Text>
      </View>
    );
  }

  if (!plot) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Lote no encontrado.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Volver a Lotes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ageText = formatReadingAge(plot.recorded_at, new Date());
  const pendingCommand = recentCommands.find((c) => c.status === "pending");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      {/* Header Info Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plotTitle}>{plot.name}</Text>
            <Text style={styles.plotSubtitle}>Humedad de suelo en tiempo real</Text>
          </View>
          <SemaphoreBadge status={plot.status} size="medium" />
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Humedad Actual</Text>
            <Text style={styles.statVal}>
              {plot.moisture_pct !== null ? `${plot.moisture_pct.toFixed(1)}%` : "N/D"}
            </Text>
            <Text style={styles.statSub}>{ageText}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Rango Óptimo</Text>
            <Text style={styles.statVal}>
              {plot.threshold_min}% - {plot.threshold_max}%
            </Text>
            <Text style={styles.statSub}>Umbrales de suelo</Text>
          </View>
        </View>
      </View>

      {/* 6h Humidity Chart */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>📈 Evolución de Humedad (Últimas 6 Horas)</Text>
        <Text style={styles.sectionDesc}>
          Franja verde delimita el régimen hídrico óptimo fijado agronómicamente.
        </Text>
        <HumidityChart
          data={readings}
          thresholdMin={plot.threshold_min}
          thresholdMax={plot.threshold_max}
          height={200}
        />
      </View>

      {/* Pending Command Banner (if in flight) */}
      {pendingCommand && (
        <View style={styles.pendingBanner}>
          <View style={styles.pendingHeader}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text style={styles.pendingTitle}>Comando en vuelo hacia Redpanda...</Text>
          </View>
          <Text style={styles.pendingDetails}>
            Acción: <Text style={{ fontWeight: "700" }}>{pendingCommand.action.toUpperCase()}</Text>
            {pendingCommand.duration_minutes ? ` por ${pendingCommand.duration_minutes} min` : ""}
          </Text>
          <Text style={styles.pendingSub}>
            El actuador aplicará el comando en &lt;5 segundos.
          </Text>
          {canActuate && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancelCommand(pendingCommand.id)}
              disabled={actionLoading}
            >
              <Text style={styles.cancelButtonText}>✕ Cancelar Comando</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Valves & Actuation Section */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>💧 Válvulas y Control de Riego</Text>
        <Text style={styles.sectionDesc}>
          Comandos asíncronos distribuidos con patrón Transactional Outbox (SLA &lt;5s).
        </Text>

        {!canActuate && (
          <View style={styles.roleNotice}>
            <Text style={styles.roleNoticeText}>
              👁️ Modo Lectura: Su rol ({activeRole}) solo permite monitorear el estado de las válvulas.
            </Text>
          </View>
        )}

        {valves.length === 0 ? (
          <Text style={styles.emptyValvesText}>No hay válvulas registradas en este lote.</Text>
        ) : (
          valves.map((v) => {
            const isOpen = v.status === "open";
            const isPendingThis = pendingCommand?.valve_id === v.id;

            return (
              <View key={v.id} style={styles.valveCard}>
                <View style={styles.valveInfo}>
                  <View style={styles.valveNameRow}>
                    <Text style={styles.valveName}>{v.name}</Text>
                    <View
                      style={[
                        styles.valveStatusPill,
                        isOpen ? styles.valvePillOpen : styles.valvePillClosed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.valveStatusPillText,
                          isOpen ? styles.valvePillTextOpen : styles.valvePillTextClosed,
                        ]}
                      >
                        {isOpen ? "ABIERTA" : "CERRADA"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.valveSub}>ID: {v.id}</Text>
                </View>

                {canActuate && (
                  <View style={styles.valveActions}>
                    {isOpen ? (
                      <TouchableOpacity
                        style={[styles.btnValve, styles.btnClose]}
                        onPress={() => handleCloseValve(v)}
                        disabled={actionLoading || isPendingThis}
                      >
                        <Text style={styles.btnCloseText}>Cerrar Riego</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnValve, styles.btnOpen]}
                        onPress={() => handleOpenIrrigationPrompt(v)}
                        disabled={actionLoading || isPendingThis}
                      >
                        <Text style={styles.btnOpenText}>Abrir Riego</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Threshold Configuration Section */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>⚙️ Configuración de Umbrales Agronómicos</Text>
        <Text style={styles.sectionDesc}>
          Define el semáforo hídrico para disparar alertas de estrés hídrico.
        </Text>

        {!isProducer && (
          <View style={styles.roleNotice}>
            <Text style={styles.roleNoticeText}>
              🔒 Solo el rol Productor puede actualizar los umbrales de humedad.
            </Text>
          </View>
        )}

        <View style={styles.thresholdForm}>
          <View style={styles.inputCol}>
            <Text style={styles.inputLabel}>Umbral Mínimo (% Humedad)</Text>
            <TextInput
              style={[styles.textInput, !isProducer && styles.textInputDisabled]}
              value={minInput}
              onChangeText={setMinInput}
              keyboardType="numeric"
              editable={isProducer && !savingThresholds}
              placeholder="25"
            />
            <Text style={styles.inputHelper}>Bajo este valor = Suelo Seco</Text>
          </View>

          <View style={styles.inputCol}>
            <Text style={styles.inputLabel}>Umbral Máximo (% Humedad)</Text>
            <TextInput
              style={[styles.textInput, !isProducer && styles.textInputDisabled]}
              value={maxInput}
              onChangeText={setMaxInput}
              keyboardType="numeric"
              editable={isProducer && !savingThresholds}
              placeholder="45"
            />
            <Text style={styles.inputHelper}>Sobre este valor = Suelo Saturado</Text>
          </View>
        </View>

        {isProducer && (
          <TouchableOpacity
            style={[styles.saveThresholdBtn, savingThresholds && styles.btnDisabled]}
            onPress={handleSaveThresholds}
            disabled={savingThresholds}
          >
            {savingThresholds ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.saveThresholdBtnText}>Guardar Umbrales</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Audit Command History */}
      {recentCommands.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>📜 Historial Reciente de Comandos</Text>
          {recentCommands.map((cmd) => (
            <View key={cmd.id} style={styles.commandRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cmdAction}>
                  Acción: {cmd.action.toUpperCase()}
                  {cmd.duration_minutes ? ` (${cmd.duration_minutes} min)` : ""}
                </Text>
                <Text style={styles.cmdDate}>
                  Emitido: {new Date(cmd.accepted_at).toLocaleTimeString()}
                </Text>
              </View>
              <View
                style={[
                  styles.cmdStatusPill,
                  cmd.status === "applied" && { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
                  cmd.status === "pending" && { backgroundColor: "#FEF3C7", borderColor: "#FDE047" },
                  cmd.status === "cancelled" && { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
                  cmd.status === "failed" && { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
                ]}
              >
                <Text
                  style={[
                    styles.cmdStatusText,
                    cmd.status === "applied" && { color: "#16A34A" },
                    cmd.status === "pending" && { color: "#D97706" },
                    cmd.status === "cancelled" && { color: "#6B7280" },
                    cmd.status === "failed" && { color: "#DC2626" },
                  ]}
                >
                  {cmd.status.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Academic Disclaimer Notice */}
      <AcademicNotice />

      {/* Modal for selecting Open Duration */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Abrir Riego</Text>
            <Text style={styles.modalSubtitle}>
              Seleccione la duración programada para la válvula "{selectedValve?.name}":
            </Text>

            <View style={styles.durationSelector}>
              {[15, 30, 60].map((mins) => (
                <TouchableOpacity
                  key={mins}
                  style={[
                    styles.durationChip,
                    selectedDuration === mins && styles.durationChipSelected,
                  ]}
                  onPress={() => setSelectedDuration(mins)}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      selectedDuration === mins && styles.durationChipTextSelected,
                    ]}
                  >
                    {mins} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmOpen}
              >
                <Text style={styles.modalConfirmText}>Confirmar y Abrir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButtonText: {
    color: colors.primary,
    fontWeight: "700",
  },
  btnClose: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  btnCloseText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnOpen: {
    backgroundColor: colors.primary,
  },
  btnOpenText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  btnValve: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderColor: colors.warning,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  centerContainer: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  cmdAction: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  cmdDate: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  cmdStatusPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cmdStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  commandRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  durationChip: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  durationChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  durationChipTextSelected: {
    color: colors.white,
    fontWeight: "700",
  },
  durationSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 16,
  },
  emptyValvesText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginVertical: 8,
  },
  errorText: {
    color: colors.status.dry,
    fontSize: 16,
    fontWeight: "700",
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  inputCol: {
    flex: 1,
    marginHorizontal: 4,
  },
  inputHelper: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  modalCancelBtn: {
    marginRight: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modalConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalConfirmText: {
    color: colors.white,
    fontWeight: "700",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    width: "85%",
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "center",
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  pendingBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  pendingDetails: {
    color: colors.textPrimary,
    fontSize: 13,
    marginTop: 4,
  },
  pendingHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  pendingSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  pendingTitle: {
    color: "#B45309",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
  },
  plotSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  plotTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  roleNotice: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 10,
  },
  roleNoticeText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  saveThresholdBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 12,
  },
  saveThresholdBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  statBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 4,
    padding: 10,
  },
  statGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  statSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  statVal: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginVertical: 2,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textInputDisabled: {
    backgroundColor: colors.surfaceSubtle,
    color: colors.textMuted,
  },
  thresholdForm: {
    flexDirection: "row",
    marginHorizontal: -4,
  },
  valveActions: {
    marginLeft: 12,
  },
  valveCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 12,
  },
  valveInfo: {
    flex: 1,
  },
  valveName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
  valveNameRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  valvePillClosed: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  valvePillOpen: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  valvePillTextClosed: {
    color: colors.textSecondary,
  },
  valvePillTextOpen: {
    color: "#16A34A",
  },
  valveStatusPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  valveStatusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  valveSub: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
});
