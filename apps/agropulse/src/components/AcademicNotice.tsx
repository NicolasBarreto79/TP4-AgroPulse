import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export function AcademicNotice() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aviso de Datos Académicos Ficticios</Text>
      <Text style={styles.text}>
        Todas las coordenadas GPS, lecturas de humedad, establecimientos, estaciones y estados de
        válvulas son ficticios y con fines exclusivamente didácticos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FDF8E2",
    borderColor: "#F0E1A1",
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 10,
    padding: 10,
  },
  title: {
    color: "#7D6608",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  text: {
    color: "#5C4D0A",
    fontSize: 11,
    lineHeight: 15,
  },
});
