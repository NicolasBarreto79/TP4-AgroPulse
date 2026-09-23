# Matriz de requisitos y evidencia de AgroPulse

Esta matriz convierte todos los requisitos RF-01 a RF-24 y RNF-01 a RNF-10 del PRD en comprobaciones de entrega. El estado inicial de todos es `Planned`; la implementación deberá sustituirlo por evidencia concreta, no por una declaración de cumplimiento.

## 1. Requisitos funcionales

| ID | Prioridad PRD | Requisito resumido | Evidencia de aceptación planificada | Capa principal | Estado |
|---|---|---|---|---|---|
| RF-01 | Must | Login/logout con Supabase Auth y sesión persistente | Usuario inválido ve error; login válido sobrevive al cierre forzado; logout elimina sesión | App + Supabase Auth | Planned |
| RF-02 | Must | Aislamiento por establecimientos | `productor2@agropulse.test`, miembro exclusivo de organización 2, no puede consultar lotes de Estancia Didáctica Concordia; pgTAP de RLS | Postgres RLS | Planned |
| RF-03 | Must | Selector de establecimiento cuando hay más de uno | El productor principal pertenece a ambas organizaciones; al cambiar el contexto activo, mapa y listas muestran solo la seleccionada | App + consultas RLS | Planned |
| RF-04 | Must | Listar lotes con nombre, cultivo opcional y semáforo | Semilla visible con Costa 1, Costa 2 y Monte A | App + vista SQL | Planned |
| RF-05 | Must | Mapa con polígono y color por estado | Tres polígonos; tocar uno abre su detalle; color acompañado por texto/ícono | App + PostGIS | Planned |
| RF-06 | Must | Indicar si el GPS cae dentro del lote | Prueba en iPhone; permiso concedido usa PostGIS; permiso denegado muestra `ubicación no disponible` sin crash | App + RPC/PostGIS | Planned |
| RF-07 | Should | Alta/edición de lote y polígono simplificado | Prueba de alta/edición mediante cuatro vértices o GeoJSON; alcance diferido | App + PostGIS | Planned |
| RF-08 | Must | Al menos una estación por lote con humedad, temperatura y lluvia opcional | Seed y simulador generan lecturas válidas; cada lote demostrable conserva 12+ puntos en 6 h | Simulador + worker + DB | Planned |
| RF-09 | Must | Última lectura y antigüedad; stale > 15 min | Detalle muestra edad; reloj/vista pasa Monte A a stale sin nueva lectura | Vista SQL + App | Planned |
| RF-10 | Must | Gráfico de humedad de 6 h con al menos 12 puntos | Cada lote demostrable tiene 12+ puntos; Monte A conserva serie, pero su último punto supera 15 min; gráfico cambia por Realtime o pull-to-refresh | App + consultas DB | Planned |
| RF-11 | Must | Umbral mínimo configurable por lote | RPC permite editar solo a producer, rechaza operator/advisor, persiste y recalcula semáforo | App + RPC/RLS + DB | Planned |
| RF-12 | Must | Semáforo según reglas del PRD | Tests de stale, dry, optimal (bordes incluidos) y wet; seed exhibe estados | Vista SQL + tests | Planned |
| RF-13 | Must | Listar válvulas por lote con estado | Cada lote muestra al menos una válvula `open/closed` de la semilla | App + DB | Planned |
| RF-14 | Must | Emitir abrir/cerrar/abrir N minutos (1-120) | RPC deriva actor de `auth.uid()` y crea atómicamente comando pending + outbox; cliente no escribe campos protegidos | App + RPC/DB | Planned |
| RF-15 | Must | Transición a applied o failed en hasta 5 s | Medición desde RPC aceptada hasta terminal renderizado: dispatch+apply <=3,5 s, Realtime/render <=1 s; deadline produce `failed/dispatch_timeout` y eventos tardíos se ignoran | Publisher + worker + DB + Realtime + App | Planned |
| RF-16 | Must | Impedir segundo pending en la misma válvula | Carrera concurrente: una solicitud se acepta y otra recibe mensaje claro; índice/restricción lo garantiza | Postgres + App | Planned |
| RF-17 | Should | Cancelar comando pending | RPC autorizada hace CAS desde pending; carrera con worker tiene un ganador y un comando cancelado no acciona válvula | App + DB + worker | Planned |
| RF-18 | Should | Historial de últimos 20 comandos | Lista ordenada con fecha, actor y resultado, limitada a 20 | App + DB | Planned |
| RF-19 | Should | Alerta in-app por humedad bajo umbral | Costa 2 genera alerta visible en banner/inbox y asociada al lote | DB/worker + Realtime + App | Planned |
| RF-20 | Should | Alerta por estación sin ticks > 15 min | Monte A muestra alerta stale distinguible de dry | Vista/servicio + App | Planned |
| RF-21 | Should | Lectura manual offline con nota, GPS e id cliente | Corte de red 30 s; sincronización posterior produce exactamente una lectura; alcance diferido | App + DB | Planned |
| RF-22 | Could | Sugerencia fija de riego, sin ML | Con humedad bajo umbral se muestra el texto definido; alcance diferido | App/vista | Planned |
| RF-23 | Must | Diagnóstico académico | Sección muestra user id, establecimiento, último tick y lag aparente | App | Planned |
| RF-24 | Must | Logs visibles del worker | Consola Compose muestra `produced`, `consumed` y `upsert reading` | Simulador + worker + Compose | Planned |

## 2. Requisitos no funcionales

| ID | Prioridad PRD | Requisito resumido | Evidencia de aceptación planificada | Capa principal | Estado |
|---|---|---|---|---|---|
| RNF-01 | Must | Expo SDK del curso, TypeScript strict y Expo Router | Configuración Expo SDK 57, `strict: true`, rutas funcionales y typecheck exitoso | App | Planned |
| RNF-02 | Must | Sin `service_role` en binario; anon key + RLS | Búsqueda en bundle/repositorio; pruebas RLS/RPC; secreto solo para publisher/worker/bootstrap en env backend ignorado | Seguridad/CI | Planned |
| RNF-03 | Must | Mapa inicial usable en menos de 3 s | Medición repetida con semilla en la red de defensa, registrando dispositivo y condiciones | App + Supabase | Planned |
| RNF-04 | Must | Tick visible en UI <= 3 s desde insert | Timestamps de insert y render/log diagnóstico en misma red | Realtime + App | Planned |
| RNF-05 | Must | Fallos de comando y 401/403 sin spinner infinito | Tests/UI de timeout, advisor y sesión expirada; estado terminal y mensaje recuperable | App + backend | Planned |
| RNF-06 | Must | Arranque reproducible | README con `.env.example`, Compose, migraciones, seed y usuarios placeholder | Repositorio/infra | Planned |
| RNF-07 | Should | Comando o lectura manual no se pierde tras 30 s offline | Prueba de corte, recuperación e idempotencia; alcance diferido | App + DB | Planned |
| RNF-08 | Should | Tests de semáforo e idempotencia | Jest para regla pura/UX y pgTAP para unicidad/RLS; resultados guardados | Tests | Planned |
| RNF-09 | Could | UI en español; código/SQL en inglés | Inspección de copy e identificadores | App + repositorio | Planned |
| RNF-10 | Must | Declarar ficticios humedad y GPS | Aviso visible en README, informe y/o pantalla Cuenta | Documentación + App | Planned |

## 3. Historias de defensa

| Historia | Recorrido | Requisitos cubiertos | Evidencia |
|---|---|---|---|
| H1 Productor | Login -> mapa -> Costa 2 seco -> 18 % / 25 % -> abrir 30 min -> applied <= 5 s | RF-01, 04, 05, 09-16; RNF-03-05 | Video/defensa, DB y logs |
| H2 Asesor | Login asesor -> consulta mapa/detalle -> intento de regar rechazado | RF-02, permisos §5; RNF-02, 05 | Botón/403 y pgTAP RLS |
| Concurrencia de comandos | Dos comandos simultáneos para una válvula | RF-16, RNF-05 | Una fila pending; segundo rechazo legible |
| H4 Sensor caído | Detener ticks de Monte A -> esperar/adelantar reloj de prueba -> gris stale | RF-09, 12, 20 | Vista SQL, app y alerta diferenciada |

## 4. Inconsistencias y aclaraciones del PRD

1. **Portada incompleta:** la página 1 indica “implementar los requisitos Must (RF-01 a RF-12)”, pero la tabla real marca también como Must RF-13, RF-14, RF-15, RF-16, RF-23 y RF-24. La planificación toma como autoridad la prioridad de cada fila: son 17 RF Must (RF-07 es Should).
2. **Checklist inexistente:** el entregable 6 solicita “Checklist de la §17 marcado”, pero la §17 contiene referencias de dominio y no una checklist. Esta matriz funciona como checklist verificable de reemplazo.
3. **Comandos y Redpanda:** la regla §8 permite que el worker procese comandos directamente o como consumer; §10 marca `irrigation.commands` como Should, mientras el diagrama §18 muestra Supabase -> Redpanda -> Worker. El proyecto incluirá el topic como Should fundamental sin dejar de usar Supabase como fuente de verdad.
4. **OA-5 tiene formato dañado:** el texto extraído presenta `pending -> failed / applied`; las reglas §8 y RF-15 aclaran que ambos son estados terminales alternativos.
5. **PostGIS no es obligatorio:** el kick off dice “si se habilita”. Se eligió como decisión del equipo, no como mandato del PRD.
6. **Edición de umbrales:** la prosa general de RLS permite INSERT/UPDATE de umbrales y comandos a producer/operator, pero la tabla específica de actores atribuye edición de umbrales al productor y al operador solo comandos. Se adopta la regla más específica: solo producer edita umbrales; producer/operator crean o cancelan comandos.
7. **Rol asesor:** el PRD incluye “comentar” dentro del Should de rol asesor, pero H2 solo exige consulta y rechazo de riego. Esta entrega implementa autorización/H2; los comentarios quedan diferidos.
8. **`valve.status`:** §10 lo presenta como topic posible. En el alcance inicial el worker actualiza `valves` directamente en Supabase; el topic queda opcional/diferido para evitar un segundo camino de escritura sin necesidad evaluable.

## 5. Uso de esta matriz

- Cada requisito permanece `Planned` hasta que exista evidencia ejecutada.
- Una prueba visual no sustituye una restricción/RLS cuando la regla pertenece al backend.
- Al cerrar una fase se debe agregar el comando, captura, test o registro que demuestre el criterio.
- Antes de entregar se generará una versión compacta para el informe de 4-8 páginas.
