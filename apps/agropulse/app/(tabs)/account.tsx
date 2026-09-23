import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { AcademicNotice } from "../../src/components/AcademicNotice";

export default function AccountScreen() {
  const router = useRouter();
  const { user, memberships, activeOrg, activeRole, setActiveOrgId, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Está seguro que desea salir de AgroPulse?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Salir",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case "producer":
        return { label: "Productor", desc: "Control de válvulas y configuración de umbrales", color: colors.primary };
      case "operator":
        return { label: "Operador", desc: "Actuación operativa de riego (válvulas)", color: colors.info };
      case "advisor":
        return { label: "Asesor Técnico", desc: "Monitoreo y lectura agronómica (solo lectura)", color: colors.warning };
      default:
        return { label: role || "Sin rol", desc: "Sin permisos asignados", color: colors.textMuted };
    }
  };

  const roleInfo = getRoleLabel(activeRole);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Card */}
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.email?.[0] || "U").toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.userEmail}>{user?.email || "Usuario"}</Text>
            <Text style={styles.userId} numberOfLines={1}>
              ID: {user?.id}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Current Role Banner */}
        <View style={styles.roleRow}>
          <Text style={styles.sectionLabel}>Rol en establecimiento activo:</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleInfo.color + "20", borderColor: roleInfo.color }]}>
            <Text style={[styles.roleBadgeText, { color: roleInfo.color }]}>
              {roleInfo.label}
            </Text>
          </View>
        </View>
        <Text style={styles.roleDesc}>{roleInfo.desc}</Text>
      </View>

      {/* Organizations Switcher Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏢 Establecimientos Habilitados</Text>
        <Text style={styles.cardSubtitle}>
          Seleccione el establecimiento para filtrar telemetría, lotes y comandos:
        </Text>

        <View style={styles.orgList}>
          {memberships.map((m) => {
            const isSelected = m.organization_id === activeOrg?.id;
            const mRole = getRoleLabel(m.role);
            return (
              <TouchableOpacity
                key={m.organization_id}
                style={[styles.orgItem, isSelected && styles.orgItemSelected]}
                onPress={() => setActiveOrgId(m.organization_id)}
                activeOpacity={0.7}
              >
                <View style={styles.orgItemLeft}>
                  <Text style={[styles.orgItemName, isSelected && styles.orgItemNameSelected]}>
                    {m.organization.name}
                  </Text>
                  <Text style={styles.orgItemRole}>Rol: {mRole.label}</Text>
                  <Text style={styles.orgItemId} numberOfLines={1}>
                    ID: {m.organization_id}
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.activeCheck}>
                    <Text style={styles.activeCheckText}>✓ Activo</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* System Technical Metadata */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚙️ Entorno y Conectividad</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Stack:</Text>
          <Text style={styles.metaVal}>Expo SDK 57 / React Native</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Backend:</Text>
          <Text style={styles.metaVal}>Supabase + PostGIS (Docker)</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Event Broker:</Text>
          <Text style={styles.metaVal}>Redpanda (Kafka API 19092)</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Outbox Latency:</Text>
          <Text style={styles.metaVal}>~1.6s SLA (&lt;5s target)</Text>
        </View>
      </View>

      {/* Academic Disclaimer Notice */}
      <AcademicNotice />

      {/* Sign Out Button */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        activeOpacity={0.8}
      >
        <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  activeCheck: {
    backgroundColor: colors.primary + "15",
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeCheckText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  avatarText: {
    color: colors.white,
    fontSize: 24,
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
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  metaKey: {
    color: colors.textMuted,
    fontSize: 13,
    width: 110,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  metaVal: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "right",
  },
  orgItem: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    padding: 12,
  },
  orgItemId: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  orgItemLeft: {
    flex: 1,
    marginRight: 8,
  },
  orgItemName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  orgItemNameSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  orgItemRole: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  orgItemSelected: {
    backgroundColor: colors.primaryLight + "10",
    borderColor: colors.primary,
    borderWidth: 2,
  },
  orgList: {
    marginTop: 4,
  },
  profileHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  roleBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  roleDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  roleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 14,
  },
  signOutButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "700",
  },
  userEmail: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  userId: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
