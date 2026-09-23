# Registro de decisiones de AgroPulse

Este registro separa los mandatos del PRD de las elecciones del equipo. Una decisión técnica no debe presentarse como requisito de la cátedra: cada entrada explica contexto, alternativas, elección, motivo y consecuencias.

## 1. Mandatos del PRD (no son decisiones del equipo)

| Área | Mandato |
|---|---|
| Cliente | React Native con Expo, TypeScript y Expo Router; un dispositivo iOS o Android alcanza para la defensa. |
| Backend | Supabase Auth, Postgres, RLS y Realtime; la app usa anon key + JWT. |
| Eventos | Redpanda/Kafka solo en backend; la app móvil nunca consume el broker. |
| Dominio | Semáforo con prioridad stale, dry, optimal, wet y umbrales predeterminados 25/45. |
| Comandos | `pending -> applied | failed`, duración 1-120, máximo 5 s e idempotencia por `client_request_id`. |
| Seguridad | Memberships delimitan organizaciones; advisor es solo lectura; sensor writes son del worker. |
| Datos | Semilla didáctica de Concordia y aviso explícito de datos ficticios. |
| Entrega | App, migraciones/RLS/seed, Compose, informe, defensa/video y checklist. |

## 2. Decisiones del equipo

### ADR-001 - Plataforma de defensa: iPhone físico desde Windows

- **Contexto:** el PRD permite iOS o Android. El equipo dispone de Windows y un iPhone físico.
- **Alternativas:** Android/emulador; simulador iOS en Mac; iPhone con development build.
- **Decisión:** desarrollar y defender en un iPhone físico usando Expo Go desde Windows.
- **Rationale:** prueba GPS, permisos y comportamiento real sin exigir Mac ni toolchain nativo local.
- **Consecuencias:** todas las dependencias móviles deben funcionar en Expo Go; la red local y permisos iOS se validarán temprano.

### ADR-002 - Expo SDK 57 para el dispositivo físico

- **Contexto:** el PRD pide el SDK actual del curso, pero la cátedra no fijó versión. La primera fundación utilizó SDK 54 basándose en la compatibilidad esperada con Expo Go. La prueba en el dispositivo aportó evidencia distinta: el iPhone físico tiene Expo Go SDK 57.0.0 y rechazó explícitamente el proyecto SDK 54.
- **Alternativas:** mantener SDK 54 y crear una development build específica; intentar instalar una versión anterior de Expo Go; alinear el proyecto con Expo Go SDK 57.
- **Decisión:** usar Expo SDK 57 con sus versiones administradas de Expo Router, React, React Native y TypeScript.
- **Rationale:** la versión nativa de Expo Go y la versión SDK del proyecto deben coincidir. Alinear el proyecto con el cliente realmente instalado conserva el flujo elegido de Windows más iPhone físico sin agregar EAS ni una development build.
- **Consecuencias:** las dependencias se validan con `npx expo install --check`; cualquier actualización futura de Expo Go exige comprobar nuevamente la versión del dispositivo antes de cambiar el SDK del proyecto. La opción experimental `typedRoutes` queda deshabilitada: en este monorepo, el CLI de SDK 57 resolvió un peer heredado de Expo Router y falló al iniciar; Expo Router continúa activo con TypeScript estricto y rutas basadas en archivos.

### ADR-003 - PostGIS como autoridad geoespacial

- **Contexto:** el PRD admite PostGIS “si se habilita” y exige polígonos y punto dentro de lote.
- **Alternativas:** guardar GeoJSON y calcular solo en el cliente; geometría PostGIS; duplicar lógica cliente/servidor.
- **Decisión:** almacenar polígonos en PostGIS y resolver autoritativamente punto-en-polígono en DB/RPC.
- **Rationale:** una sola implementación evita discrepancias y permite consultar/validar geometría con semántica espacial real.
- **Consecuencias:** las migraciones habilitan la extensión y documentan SRID; el cliente transforma coordenadas para dibujar, pero no es autoridad.

### ADR-004 - Node.js + TypeScript para worker y simulador

- **Contexto:** el PRD no fija lenguaje backend; la app ya usa TypeScript.
- **Alternativas:** Python; Go; Node.js/TypeScript.
- **Decisión:** Node.js + TypeScript en ambos servicios.
- **Rationale:** permite compartir contratos, reduce cambios de lenguaje y mantiene una toolchain simple en Windows.
- **Consecuencias:** se deben separar contratos puros de dependencias Node/React Native y mantener TypeScript strict en todos los workspaces.

### ADR-005 - Monorepo con npm workspaces

- **Contexto:** hay app, dos servicios, contratos, DB, infraestructura y documentación.
- **Alternativas:** repositorios separados; pnpm/Yarn workspaces; npm workspaces.
- **Decisión:** monorepo con `apps/agropulse`, `services/worker`, `services/simulator`, `services/command-publisher`, `packages/contracts`, `supabase`, `infra` y `docs`.
- **Rationale:** conserva un solo flujo de entrega y permite compartir contratos usando la herramienta ya incluida con Node.
- **Consecuencias:** scripts raíz orquestarán typecheck/test; los paquetes deberán declarar límites y dependencias explícitas.

### ADR-006 - Supabase como fuente de verdad

- **Contexto:** el diagrama muestra el comando viajando por Redpanda, pero la UI necesita estado durable e idempotencia.
- **Alternativas:** broker como autoridad; comando solo en DB con polling del worker; DB autoritativa más evento.
- **Decisión:** Supabase persiste comando y outbox en una transacción; el broker transporta trabajo y Realtime distribuye el resultado.
- **Rationale:** restricciones, RLS, historial y recuperación quedan en un sistema durable y consultable.
- **Consecuencias:** el publicador debe tolerar reintentos; el worker revalida el estado DB y procesa idempotentemente.

### ADR-007 - Command-publisher local y outbox durable

- **Contexto:** §10 lo marca Should, mientras OA-4 y el diagrama §18 enfatizan el flujo event-driven.
- **Alternativas:** worker consulta pending directamente; Edge Function publica al Redpanda local; servicio local consulta comandos; outbox transaccional con publisher local.
- **Decisión:** la RPC de creación escribe comando y outbox en la misma transacción. `services/command-publisher` corre en Docker Compose, reclama filas por lease, publica `irrigation.commands` y marca `published_at`.
- **Rationale:** alinea aprendizaje y diagrama, evita el dual-write comando/evento y permite que el Supabase hospedado alcance indirectamente un broker local sin abrir Redpanda a Internet.
- **Consecuencias:** publisher usa URL + `service_role` de Supabase y credencial del broker desde env ignorado; conecta por HTTPS saliente y red Compose. `dispatch_deadline_at` vence 1 s después de la aceptación RPC: si no se publicó, CAS marca `failed/dispatch_timeout` y expira el outbox. La entrega es al menos una vez; worker deduplica por `command_id`/`client_request_id` e ignora eventos tardíos. El objetivo end-to-end es dispatch+apply <=3,5 s, Realtime/render <=1 s y >=0,5 s de margen.

### ADR-008 - Estado de lote en vista SQL con refresco temporal

- **Contexto:** `stale` puede aparecer solo porque pasa el tiempo; Realtime no emite un cambio cuando no hay inserts.
- **Alternativas:** calcular solo en app; job que persiste estados; vista SQL más refresco periódico.
- **Decisión:** derivar `plot_status` en una vista SQL y refrescar periódicamente desde la app, además de Realtime.
- **Rationale:** centraliza la fórmula y hace visible la transición temporal sin almacenar un estado derivado que pueda quedar desactualizado.
- **Consecuencias:** consultas dependen de `now()` y requieren intervalo de refresco; tests deben controlar el reloj/fechas.

### ADR-009 - Mapas y ubicación compatibles con Expo Go

- **Contexto:** se debe probar mapa/GPS en iPhone físico sin módulos nativos personalizados.
- **Alternativas:** Mapbox con build nativo; vista web; `react-native-maps` + `expo-location`.
- **Decisión:** usar `react-native-maps` y `expo-location`; PostGIS valida el resultado final.
- **Rationale:** compatibilidad directa con Expo Go y APIs adecuadas para polígonos y permisos.
- **Consecuencias:** se validarán restricciones de Apple Maps, permisos y precisión; el cliente no decide autorización ni geometría autoritativa.

### ADR-010 - Gráfico propio con `react-native-svg`

- **Contexto:** RF-10 requiere una sola serie de humedad de 6 h con al menos 12 puntos.
- **Alternativas:** librería de charts completa; WebView; componente SVG propio.
- **Decisión:** implementar un gráfico acotado con `react-native-svg`.
- **Rationale:** reduce dependencias y mantiene control de accesibilidad/rendimiento para un caso simple.
- **Consecuencias:** el equipo implementa escalas, ejes y estados vacíos; no se busca un motor de gráficos general.

### ADR-011 - Semilla con segunda organización y cuatro usuarios

- **Contexto:** el PRD sugiere una organización y tres roles, pero RF-02 exige demostrar aislamiento con otro establecimiento.
- **Alternativas:** crear el segundo usuario manualmente durante la defensa; mocks; segunda organización reproducible.
- **Decisión:** sembrar Estancia Didáctica Concordia y una organización mínima; el productor principal pertenece a ambas y `productor2@agropulse.test` exclusivamente a la segunda.
- **Rationale:** convierte RF-02 en una prueba repetible y visible, y garantiza que RF-03 muestre el selector sin crear otro usuario especial.
- **Consecuencias:** el bootstrap Auth y las memberships deben coordinar IDs; las claves reales no se publican.

### ADR-012 - Bootstrap local de usuarios Auth

- **Contexto:** los usuarios de `auth.users` no se crean de manera portable con un seed SQL normal sin tratar credenciales.
- **Alternativas:** alta manual; SQL interno; script Admin API con `service_role`.
- **Decisión:** script local idempotente usando `service_role` desde un archivo env ignorado.
- **Rationale:** prepara usuarios y memberships de forma repetible sin exponer credenciales al móvil ni al repositorio.
- **Consecuencias:** el README documentará el paso; `.env.example` usa placeholders y el script debe fallar de forma segura si falta la clave.

### ADR-013 - Fallos determinísticos de comandos

- **Contexto:** el PRD propone opcionalmente 10 % de fallos aleatorios, pero RNF-05 y RF-15 requieren manejar `failed`.
- **Alternativas:** azar puro; nunca fallar; bandera controlada.
- **Decisión:** éxito por defecto y `FORCE_COMMAND_FAILURE=true` para producir `failed` con `valve_timeout`.
- **Rationale:** permite demostrar y probar el error sin arriesgar el Happy Path ni crear tests inestables.
- **Consecuencias:** la bandera es solo de desarrollo/defensa; los tests cubren ambas ramas y el informe declara la desviación del ejemplo aleatorio.

### ADR-014 - Estrategia de pruebas por capa

- **Contexto:** RNF-08 solo exige tests unitarios de semáforo e idempotencia, pero RLS y concurrencia no se prueban bien solo en TypeScript.
- **Alternativas:** solo Jest; pruebas end-to-end manuales; Jest/Testing Library + pgTAP + integración Docker.
- **Decisión:** usar Jest con `jest-expo` y Testing Library, pgTAP vía Supabase CLI e integración worker/Redpanda/Supabase local.
- **Rationale:** cada regla se verifica donde realmente se impone; se priorizan seguridad y coherencia sobre una cifra de cobertura.
- **Consecuencias:** la suite requiere Docker/Supabase CLI y separación entre pruebas rápidas e integración.

### ADR-015 - Must primero con un Should habilitante promovido

- **Contexto:** el alcance completo incluye capacidades que no aportan igual valor a la defensa principal.
- **Alternativas:** implementar por pantallas; mezclar Must/Should; cerrar Must antes de extras.
- **Decisión:** promover únicamente `irrigation.commands` al slice de comandos Must porque el usuario lo seleccionó como fundamental y la arquitectura final depende de él. Después del hardening Must se implementan RF-17, RF-18, RF-19, RF-20, autorización advisor/H2 y RNF-08 ampliado. Los comentarios del asesor quedan diferidos.
- **Rationale:** protege el Happy Path y la rúbrica antes de agregar complejidad.
- **Consecuencias:** RF-07, RF-21/RNF-07, campaña y RF-22 quedan Deferred; solo se reabren con evidencia Must estable.

### ADR-016 - El móvil nunca usa Kafka

- **Contexto:** el PRD lo prohíbe y exige justificar la frontera dispositivo/API/Realtime/broker.
- **Alternativas:** cliente Kafka en React Native; gateway HTTP/Realtime; acceso directo limitado a topics.
- **Decisión:** la app se comunica solo con Supabase por HTTPS/Realtime; únicamente servicios backend acceden a Redpanda.
- **Rationale:** una red móvil cambia, se corta y suspende procesos; exponer credenciales del broker en el binario rompe el límite de confianza. Además, el cliente tendría que resolver backpressure, evolución de esquemas, reintentos/offsets y operación de conexiones largas, complejidad impropia de la UI.
- **Consecuencias:** Supabase/RPC es la frontera estable y autorizada; el backend absorbe reintentos, credenciales, compatibilidad de esquemas y presión del broker.

### ADR-017 - Mutaciones de comandos y válvulas mediante RPC y CAS

- **Contexto:** deshabilitar botones no protege campos sensibles ni resuelve la carrera entre cancelación y aplicación.
- **Alternativas:** INSERT/UPDATE directo con RLS; triggers correctivos; RPCs acotadas y compare-and-set.
- **Decisión:** denegar escrituras directas del cliente sobre válvulas y campos protegidos del comando. RPCs crean/cancelan; `requested_by` deriva de `auth.uid()`. Worker y cancelación cambian estado solo desde `pending`, y la aplicación actualiza comando/válvula atómicamente.
- **Rationale:** evita suplantación y garantiza un único ganador ante carreras.
- **Consecuencias:** pgTAP debe probar permisos, campos protegidos, actor derivado y carreras; el worker usa service role solo para la función backend acotada.

### ADR-018 - Solo producer edita umbrales

- **Contexto:** la prosa general de RLS permite umbrales/comandos a producer y operator, pero la tabla específica de actores solo otorga umbrales al productor y comandos al operador.
- **Alternativas:** permitir ambos tipos de mutación a operator; aplicar la tabla específica; pedir una aclaración externa.
- **Decisión:** priorizar la definición específica: solo producer edita umbrales; producer y operator crean/cancelan comandos; advisor solo consulta.
- **Rationale:** aplica menor privilegio y conserva exactamente la responsabilidad explícita del actor operador.
- **Consecuencias:** RPC/RLS y UI reflejan la diferencia; pgTAP verifica rechazo de operator/advisor al editar umbrales.

### ADR-019 - `valve.status` diferido

- **Contexto:** §10 lo presenta como topic posible, pero el worker ya debe actualizar la válvula y el comando en Supabase.
- **Alternativas:** publicar y reconsumir `valve.status`; actualizar DB y emitir solo para observabilidad; no incluirlo inicialmente.
- **Decisión:** el worker actualiza Supabase directamente; `valve.status` queda opcional/diferido.
- **Rationale:** evita dos caminos de escritura y no agrega evidencia necesaria al Happy Path.
- **Consecuencias:** el contrato inicial de telemetría cubre `soil.moisture` y `weather.tick`; una futura integración puede agregar el topic sin convertirlo en autoridad.

## 3. Reglas para nuevas decisiones

Toda elección no especificada por el PRD debe agregarse antes de implementarse con:

1. Contexto y restricción que obliga a decidir.
2. Alternativas realmente consideradas.
3. Decisión concreta.
4. Rationale técnico y académico.
5. Consecuencias, riesgos y trabajo futuro.

Una actualización posterior no borra la decisión anterior: agrega una entrada que la reemplaza y explica por qué.
