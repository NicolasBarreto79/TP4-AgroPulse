import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { colors } from "../src/theme/colors";
import { AcademicNotice } from "../src/components/AcademicNotice";

const testAccounts = [
  { role: "Productor", email: "producer@agropulse.test", desc: "Acceso total (2 establecimientos)" },
  { role: "Operador", email: "operator@agropulse.test", desc: "Comandos permitidos, sin umbrales" },
  { role: "Asesor", email: "advisor@agropulse.test", desc: "Solo lectura (H2: comandos denegados)" },
  { role: "Productor 2", email: "productor2@agropulse.test", desc: "Establecimiento Aislado (RF-02)" },
];

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("producer@agropulse.test");
  const [password, setPassword] = useState("AgroPulse2026!");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPass: string) => {
    setLoading(true);
    setErrorMessage(null);

    const { error } = await signIn(loginEmail, loginPass);
    if (error) {
      setErrorMessage(
        error.message.includes("Invalid login credentials")
          ? "Credenciales incorrectas. Verifique correo y contraseña."
          : `Error al iniciar sesión: ${error.message}`,
      );
      setLoading(false);
    } else {
      setLoading(false);
      router.replace("/(tabs)");
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage("Por favor ingresa usuario y contraseña.");
      return;
    }
    await performLogin(email, password);
  };

  const handleQuickLogin = async (testEmail: string) => {
    setEmail(testEmail);
    setPassword("AgroPulse2026!");
    await performLogin(testEmail, "AgroPulse2026!");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🌱</Text>
          </View>
          <Text style={styles.brandTitle}>AgroPulse</Text>
          <Text style={styles.brandSubtitle}>Monitoreo Agrícola y Riego Automatizado</Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.formTitle}>Iniciar Sesión</Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Correo Electrónico</Text>
            <TextInput
              style={styles.input}
              placeholder="ejemplo@agropulse.test"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Fill Test Accounts */}
        <View style={styles.testSection}>
          <Text style={styles.testSectionTitle}>Accesos Rápidos Demo (1 Toque)</Text>
          <Text style={styles.testSectionSubtitle}>
            Toca una cuenta para ingresar de inmediato para la defensa:
          </Text>

          {testAccounts.map((account) => (
            <TouchableOpacity
              key={account.email}
              style={[
                styles.testAccountCard,
                email === account.email && styles.testAccountActive,
              ]}
              onPress={() => handleQuickLogin(account.email)}
              activeOpacity={0.7}
              disabled={loading}
            >
              <View style={styles.testAccountHeader}>
                <Text style={styles.testAccountRole}>{account.role}</Text>
                <Text style={styles.testAccountEmail}>{account.email}</Text>
              </View>
              <Text style={styles.testAccountDesc}>{account.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <AcademicNotice />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brandSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  brandTitle: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  errorBox: {
    backgroundColor: colors.status.dryBg,
    borderColor: colors.status.dry,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 10,
  },
  errorText: {
    color: colors.status.dry,
    fontSize: 13,
    fontWeight: "500",
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  logoBadge: {
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: 24,
    height: 64,
    justifyContent: "center",
    marginBottom: 12,
    width: 64,
  },
  logoIcon: {
    fontSize: 32,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 48,
  },
  testAccountActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  testAccountCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  testAccountDesc: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  testAccountEmail: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  testAccountHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  testAccountRole: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  testSection: {
    marginBottom: 24,
  },
  testSectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  testSectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
});
