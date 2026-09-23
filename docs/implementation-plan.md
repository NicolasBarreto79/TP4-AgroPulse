# Plan de implementación de AgroPulse

El plan prioriza la cadena de valor y seguridad: primero se prueba el circuito de datos y permisos, después la interfaz. `irrigation.commands` es la única excepción al orden Must-first: se promueve deliberadamente como Should habilitante y se implementa dentro del slice de comandos porque el usuario lo definió fundamental y la arquitectura final depende de él. Los demás Should se agregan después del hardening Must.

## 1. Orden de entrega

```text
Fundación -> Datos/RLS -> Telemetría -> App base -> Comandos Must + Should habilitante -> Hardening Must
          -> Should fundamentales restantes -> Evidencia y defensa
```

## 2. Dependencias críticas

- Postgres/PostGIS, migraciones y RLS preceden a las pantallas de dominio.
- El simulador y el worker necesitan IDs estables provenientes de la semilla.
- Realtime se valida después de confirmar que el insert/upsert persiste correctamente.
- El comando se valida primero en DB; el topic `irrigation.commands` se incorpora sin cambiar su contrato persistido.
- Las alertas dependen de la fórmula única de semáforo y del mecanismo temporal de stale.
- La defensa en iPhone depende de conectividad entre Expo Go, Supabase hospedado y servicios Docker.

## 3. Fases

### Fase 0 - Fundación reproducible

**Objetivo:** crear el monorepo, configuración segura y camino de ejecución.

- Inicializar Git, npm workspaces y las carpetas acordadas.
- Crear Expo SDK 57 con TypeScript strict y Expo Router.
- Preparar worker, simulador, command-publisher, contratos e infraestructura Compose.
- Agregar `.env.example` con placeholders y reglas `.gitignore`.
- Documentar datos ficticios desde el inicio.

**Salida:** instalaciones reproducibles y procesos que arrancan aunque todavía no procesen dominio.

**Verificación/evidencia:**

- `npm install` finaliza sin errores.
- `npm run typecheck` valida todos los workspaces.
- `docker compose -f infra/docker-compose.yml config` valida la topología.
- Inspección confirma que no se versionó ninguna `service_role`.

### Fase 1 - Esquema, PostGIS, semilla y RLS

**Objetivo:** convertir Postgres en fuente de verdad segura.

- Crear tablas, enums/checks, FK, índices y extensión PostGIS.
- Implementar `plot_status`, umbrales por defecto y punto-en-polígono.
- Crear unicidad de `client_request_id`, índice único parcial de comando pending y outbox durable.
- Crear RPCs acotadas: comando + outbox en una transacción, cancelación por compare-and-set y edición de umbral solo por producer. `requested_by` siempre deriva de `auth.uid()`.
- Implementar RLS por membership y rol.
- Sembrar las dos organizaciones, tres lotes principales, estaciones y válvulas.
- Sembrar al menos 12 lecturas dentro de 6 h por lote demostrable; Monte A conserva esos puntos, pero su lectura más reciente supera 15 min para resultar stale.
- Crear bootstrap local de usuarios Auth con `service_role` solo en env ignorado.

**Salida:** dominio consultable y reglas críticas protegidas sin depender de la UI.

**Verificación/evidencia:**

- `supabase db reset` aplica migraciones y semilla desde cero.
- `supabase test db` ejecuta pgTAP para RF-02, roles, semáforo, idempotencia y RF-16.
- Consultas muestran Costa 1 optimal, Costa 2 dry y Monte A stale.

### Fase 2 - Telemetría event-driven

**Objetivo:** probar `Simulador -> Redpanda -> Worker -> Supabase` antes de crear pantallas complejas.

- Definir contratos validados para `soil.moisture` y `weather.tick`; `valve.status` queda opcional/diferido porque el worker actualiza Supabase directamente.
- Publicar ticks cada 3-8 s por estación.
- Consumir y persistir lecturas; descartar IDs inválidos sin detener el loop.
- Producir logs estructurados `produced / consumed / upsert reading`.
- Permitir apagar una estación y limitar retención académica a 48 h.

**Salida:** lecturas reales en Postgres y trazabilidad completa de un evento.

**Verificación/evidencia:**

- `docker compose -f infra/docker-compose.yml up --build` mantiene servicios saludables.
- Test de integración confirma insert/upsert desde un evento.
- Log controlado confirma descarte de un `station_id` inexistente y continuidad del siguiente evento.

### Fase 3 - App base, autenticación y contexto

**Objetivo:** completar RF-01 a RF-04 y estados básicos de UI.

- Sesión persistente, logout y errores de Auth.
- Selector de establecimiento y queries acotadas. El productor principal pertenece a ambas organizaciones; `productor2@agropulse.test` pertenece solo a la segunda.
- Tabs Mapa, Lotes, Alertas y Cuenta, más Diagnóstico.
- Estados loading, vacío y error de red sin spinner infinito.

**Salida:** usuarios de los dos establecimientos solo ven su propio contexto.

**Verificación/evidencia:**

- Jest + Testing Library prueba sesión, errores y cambio de organización.
- Prueba manual en iPhone confirma persistencia tras kill.
- Login del segundo productor confirma aislamiento de forma visible y pgTAP lo prueba en backend.

### Fase 4 - Mapa, GPS, detalle y serie temporal

**Objetivo:** completar RF-05 a RF-12.

- Dibujar polígonos con `react-native-maps` y leyenda accesible.
- Usar `expo-location`; manejar denegación sin crash.
- Validar pertenencia con PostGIS.
- Mostrar última lectura, antigüedad y gráfico propio con `react-native-svg`.
- Suscribir Realtime y agregar pull-to-refresh/refresco periódico para stale.
- Editar umbrales mediante RPC autorizada solo para producer; operator y advisor reciben rechazo backend.

**Salida:** mapa y detalle actualizados, con estados consistentes y no basados solo en color.

**Verificación/evidencia:**

- Jest prueba fórmula y bordes 25/45, formato de antigüedad y denegación de permisos.
- Prueba manual registra tiempo a mapa usable (< 3 s) y tick a render (<= 3 s).
- Captura en iPhone muestra los tres estados didácticos.

### Fase 5 - Comandos Must y Happy Path

**Objetivo:** completar RF-13 a RF-16 con Supabase como autoridad e integrar en el mismo slice el Should habilitante `irrigation.commands`.

- Listar válvulas y confirmar acciones/duración.
- Crear comandos pending mediante RPC autorizada e idempotente, derivando `requested_by` de `auth.uid()` y escribiendo el outbox en la misma transacción.
- Incorporar `services/command-publisher` a Docker Compose. Usa URL de Supabase, `service_role` y credencial de Redpanda desde env local ignorado; sale por HTTPS al Supabase hospedado y publica al broker local.
- Reclamar outbox por lease/claim atómico, registrar intentos y `published_at`, y reintentar con backoff acotado. La entrega es al menos una vez.
- Fijar `dispatch_deadline_at = accepted_at + 1 s`. El sweeper de deadlines del publisher ejecuta CAS `pending -> failed` con `dispatch_timeout` y cierra/expira el outbox; Compose aporta healthcheck/restart.
- Implementar procesamiento idempotente del worker por `command_id`/`client_request_id`, con demora simulada de 1-2 s en el camino broker. La aplicación actualiza comando y válvula atómicamente solo desde `pending`; duplicados y eventos tardíos se ignoran.
- Denegar escrituras directas del cliente sobre válvulas y campos protegidos de comandos; crear/cancelar solo mediante RPC.
- Habilitar `FORCE_COMMAND_FAILURE=true` solo para prueba determinística de `valve_timeout`.
- Actualizar comando, válvula y mapa por Realtime/polling sin reinicio.

**Presupuesto:** desde la aceptación RPC, dispatch + aplicación simulada <= 3,5 s; Realtime/render <= 1 s; margen >= 0,5 s antes de RF-15. La medición end-to-end termina cuando la app renderiza `applied` o `failed`. Un retry solo ocurre dentro del deadline; al vencer, el resultado es `failed/dispatch_timeout`, nunca espera indefinida ni doble aplicación.

**Salida:** H1 completo y RF-16 protegido ante concurrencia.

**Verificación/evidencia:**

- pgTAP cubre UUID duplicado, duración inválida, actor derivado, escrituras directas denegadas, outbox atómico y dos pending concurrentes.
- Integración cubre outbox -> publisher -> Redpanda -> worker, duplicado at-least-once, `pending -> applied` y `pending -> failed`.
- Integración cubre deadline sin publicación, cierre del outbox y rechazo de un evento tardío.
- Carrera cancel/apply por compare-and-set deja exactamente un estado terminal y una válvula coherente.
- Prueba UI confirma mensajes terminales, recuperación y ausencia de spinner infinito.
- Defensa H1 completa en hasta 5 s.

### Fase 6 - Hardening de Must

**Objetivo:** completar RF-23, RF-24 y RNF obligatorios.

- Crear Diagnóstico: user id, organización, último tick y lag aparente.
- Verificar consola Compose y trazabilidad de telemetría.
- Revisar accesibilidad, 401/403, performance y ética/datos ficticios.
- Completar README reproducible.

**Salida:** todos los Must con evidencia asociada en la matriz.

**Verificación/evidencia:**

- Ejecución limpia desde clon/configuración nueva siguiendo README.
- Auditoría de secretos y permisos.
- Checklist RF/RNF Must sin celdas sin evidencia.

### Fase 7 - Should fundamentales restantes

**Objetivo:** agregar valor de defensa sin comprometer los Must.

- RF-17 cancelación segura de pending.
- RF-18 historial de 20 comandos.
- RF-19 alerta por humedad baja.
- RF-20 alerta stale diferenciada.
- Autorización del asesor para H2: puede consultar y el backend rechaza comandos.
- RNF-08: suite estable de Jest, Testing Library, pgTAP e integración.

**Salida:** diagrama event-driven completo, H2 y caminos de error repetibles.

**Verificación/evidencia:**

- Integración demuestra que un comando cancelado no acciona la válvula.
- Prueba de autorización demuestra rechazo real del asesor, no solo botón deshabilitado.
- Logs correlacionan `command_id` entre DB, topic y worker.
- Suite completa se ejecuta dos veces con el mismo resultado.

### Fase 8 - Entrega y defensa

**Objetivo:** transformar pruebas técnicas en evidencia académica clara.

- Actualizar matriz con estado y evidencia final.
- Preparar informe de 4-8 páginas usando arquitectura y decisiones.
- Preparar video/guion de 3-5 min: H1, H2 y RF-16.
- Ensayar recuperación ante red, servicio detenido o fallo forzado.
- Congelar versión de semilla y variables de defensa.

**Salida:** entrega reproducible y guion con plan de contingencia.

## 4. Alcance Should y Deferred

### Should fundamentales comprometidos

| Ítem | Razón de inclusión |
|---|---|
| RF-17 | Cierra el ciclo de vida de comandos y prueba coordinación worker/DB. |
| RF-18 | Hace auditable el procesamiento asíncrono. |
| RF-19 y RF-20 | Demuestran diferencia entre seco y sensor sin datos. |
| Autorización advisor / H2 | Demuestra que la autorización vive en backend; comentarios quedan diferidos. |
| `irrigation.commands` | Should promovido al slice de comandos: habilita la arquitectura final y alinea OA-4/§18. |
| RNF-08 ampliado | Protege reglas críticas y permite una defensa repetible. |

### Deferred

- RF-07 alta/edición de polígonos.
- RF-21 lectura manual offline y RNF-07 degradación de red.
- Comentarios del asesor.
- Campaña agrícola.
- RF-22 sugerencia agronómica fija.
- Topic `valve.status`; el worker actualiza Supabase directamente en el alcance inicial.
- RNF-09 i18n adicional: la UI será española, pero no se construirá infraestructura multilenguaje.

Estos ítems se reconsiderarán solo después de que todos los Must y Should fundamentales tengan evidencia estable.

## 5. Estrategia de pruebas

| Nivel | Herramienta | Objetivo |
|---|---|---|
| Unit/UI | Jest, `jest-expo`, Testing Library | Fórmula, componentes, estados de error y navegación |
| Base de datos | pgTAP con Supabase CLI | RLS, restricciones, funciones, idempotencia y concurrencia |
| Integración | Node + Docker | Redpanda/worker/Supabase local y contratos inválidos |
| Dispositivo | iPhone físico + Expo Go | GPS, permisos, mapa, performance, sesión y Realtime |
| Defensa | Guion y captura de logs | H1, H2, RF-16, fallo y stale |

No se perseguirá cobertura porcentual artificial. El criterio es cubrir cada regla cuya falla rompería seguridad, coherencia o defensa.

## 6. Hitos de defensa

1. **Datos seguros:** RLS y semilla pasan sin app.
2. **Pulso visible:** un tick cruza el broker y aparece en Supabase/logs.
3. **Mapa demostrable:** tres lotes y semáforo en iPhone.
4. **Happy Path:** Costa 2 pasa por comando pending a applied en hasta 5 s.
5. **Seguridad demostrable:** asesor rechazado y segunda organización aislada.
6. **Resiliencia:** duplicado, fallo controlado y stale muestran salida clara.
7. **Entrega:** instalación limpia, matriz completa e informe consistente.

## 7. Definition of Done por fase

- Artefacto versionado y documentado.
- Verificaciones de la fase ejecutadas con resultado observado.
- Matriz de requisitos actualizada con evidencia.
- Ningún secreto agregado al repositorio.
- Las decisiones nuevas no especificadas por el PRD se registran en `decision-log.md`.
- No se avanza si una regla de seguridad crítica solo existe en la UI.
