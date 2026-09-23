export const colors = {
  primary: "#1E4D2B",
  primaryHover: "#163820",
  primaryLight: "#E8F5E9",
  accent: "#F9A825",
  background: "#F5F8F4",
  surface: "#FFFFFF",
  surfaceSubtle: "#F0F4EF",
  border: "#DCE5DC",
  borderFocus: "#2E7D32",
  textPrimary: "#1B281E",
  textSecondary: "#526655",
  textMuted: "#7E9081",
  white: "#FFFFFF",
  
  // Status Colors (Semáforo)
  status: {
    optimal: "#2E7D32",
    optimalBg: "#E8F5E9",
    dry: "#C62828",
    dryBg: "#FFEBEE",
    stale: "#616161",
    staleBg: "#EEEEEE",
    wet: "#1565C0",
    wetBg: "#E3F2FD",
  },
  
  // Alert colors
  error: "#D32F2F",
  warning: "#ED6C02",
  success: "#2E7D32",
  info: "#0288D1",
};

export const statusColors = {
  optimal: colors.status.optimal,
  dry: colors.status.dry,
  stale: colors.status.stale,
  wet: colors.status.wet,
};

export const statusLabels: Record<string, string> = {
  optimal: "Óptimo",
  dry: "Seco (Riego Requerido)",
  stale: "Desconectado (Sin señal)",
  wet: "Saturado",
};
