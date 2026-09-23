import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

export function OrgSelector() {
  const { memberships, activeOrg, setActiveOrgId } = useAuth();

  if (memberships.length <= 1) {
    return (
      <View style={styles.singleOrgContainer}>
        <Text style={styles.orgLabel}>Establecimiento:</Text>
        <Text style={styles.orgName}>{activeOrg?.name || "Sin establecimiento"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Establecimiento activo:</Text>
      <View style={styles.chipsContainer}>
        {memberships.map((m) => {
          const isActive = m.organization_id === activeOrg?.id;
          return (
            <TouchableOpacity
              key={m.organization_id}
              style={[styles.chip, isActive && styles.activeChip]}
              onPress={() => setActiveOrgId(m.organization_id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isActive && styles.activeChipText]}>
                {m.organization.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activeChipText: {
    color: colors.white,
    fontWeight: "700",
  },
  chip: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  container: {
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  orgLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginRight: 6,
  },
  orgName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  singleOrgContainer: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 8,
  },
});
