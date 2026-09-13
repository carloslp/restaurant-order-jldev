# Revisión Crítica — Spec: Pedidos, Reservas y Operaciones Gastronómicas

**Fecha:** 2026-09-13 · **Estado:** pre-código · **Alcance:** huecos, inconsistencias y riesgos antes de la implementación

---

## Veredicto

La spec es sólida en arquitectura (3 capas, Realtime, RLS, snapshot) y en el modelo de menú/modificadores, pero tiene **un hueco de dominio serio** (no existe el pedido "comer en el local"), **un actor sin definir** (repartidor) y varias inconsistencias entre capas (caché vs. tiempo real, reservas por zona vs. bloqueo por mesa). Nada bloquea arrancar, pero la v1 debería cerrar los ítems marcados 🔴 antes de tocar el esquema de BD.

**Actualización (2026-09-13) — decisiones tomadas por el dueño y su efecto:**
- ❌ **"Comer en el local" fuera de v1** → fuera de alcance, pero afecta aforo, mesas y ocupación (ver 1.1).
- ✅ **Vista de track para repartidor** creada → `track` ganó una segunda vista de rol, solo lectura post-entrega (ver 1.2, 2.1).
- ✅ **Sin pasarelas de pago por ahora** → todo pago es contra entrega, simplifica el modelo (ver 1.3, 2.3).
- ✅ **Leyenda "IVA incluido"** en las vistas públicas (ver 1.4, 4.1).
- ✅ **Roles definidos**: `admin`, `cajero`, `cocinero`, `repartidor` (ver 1.5).
- ✅ **Entrega del repartidor**: link único de un solo uso, poco sensible, que se convierte en solo lectura al confirmar (ver 1.6).

---

## 🔴 Huecos de dominio (falta en el modelo)

### 1.1 "Comer en el local" — DECISIÓN: fuera de v1
El dueño decidió no soportar pedidos en mesa por ahora. Efecto: **no** se agrega order type `EN_MESA`, ni link `orders.table_id`, ni ticket por mesa. Consecuencias aceptadas a registrar:
- **Mesas/barra quedan operadas solo por toggle manual** (Libre/Ocupada) para el indicador de la landing; la ocupación será aproximada y manual (ver inconsistencia 6), no derivada del flujo de pedidos.
- **El panel "Administrador de Mesas, Barra y Reservas"** de la spec queda reservado para un roadmap futuro; para esta v1 el módulo de mesas no existe como estado propio (las reservas son por zona, ver inconsistencia 2).
- No hay forma de que un pedido se vincule a una mesa.

### 1.2 El repartidor es un actor sin vista ni flujo — RESUELTO (track de repartidor)
La spec decía que el repartidor marca `EN_CAMINO` y `COMPLETADO`, pero no existía ninguna vista para él (solo Pública, Caja/KDS y Administrativa).
**Decisión:** el repartidor no tiene credenciales. Se le genera un **link único de track** por pedido (`/track/delivery/<token>`) con:
- Token **poco sensible, de un solo uso**: código de 8 a 12 caracteres, caduca al completar o cancelar.
- Muestra datos mínimos de entrega: dirección con referencias breves, cliente, nombre/os del pedido, botón **"Confirmar entrega"** (transición `EN_CAMINO → COMPLETADO`).
- Al confirmar la entrega, el link se vuelve **solo lectura** (no permite más acciones), el token se rota y se revoca (post-entrega) — patrón de token de un solo uso.
- Ocultar el token en los registros/logs; rotarlo si se comparte fuera de contexto.
- El token debe poder **regenerarse** desde caja (un cliente que cancela el repartidor, que se pierde el link, etc.).

**Consecuencia de diseño:** la transición `EN_CAMINO → COMPLETADO` la hace el repartidor solo (con token), **no** el cajero; `COMPLETADO` ya no es "marcado por el cajero tras cobrar/entregar" sino por el repartidor al confirmar en su link. El reembolso/cobro queda definido más abajo (pagos contra entrega).

### 1.3 Pagos: sin pasarela — DECISIÓN: pago contra entrega
No hay pasarela de pago en línea. Consecuencia: todo pago se declara al crear el pedido (efectivo exacto, efectivo con cambio, o tarjeta contra entrega) y se **cobra en el momento de la entrega/recogida**.
- `CONFIRMADO_CAJA` ya no valida un "pago online aprobado"; valida la **verosimilitud de la orden** (dentro de horario, con los datos completos y consistentes, no duplicada).
- El estado `CANCELADO` ya no arrastra el problema de reembolsos online: se cancela contra entrega sin dinero del cliente en tránsito. (Cuando se agregue una pasarela en el futuro, habrá que reintroducir el modelo de reembolsos — dejar el hook en el esquema.)

### 1.4 Impuestos ausentes — RESUELTO (IVA incluido)
**Decisión:** los precios del menú se muestran **con IVA incluido** (práctica estándar para consumidor final en México). Requisito legal verificado:
- **Art. 76 Bis LFPC**: el proveedor debe informar completa y verazmente el precio y las condiciones antes de la transacción; el "goteo de precios" (precio base bajo + cargos que aparecen al avanzar) es una práctica prohibida.
- **NOM-050-SCFI**: los precios exhibidos deben indicar si incluyen o no impuestos.
- **Art. 34 LFPC**: los precios deben exhibirse en moneda nacional.
**Implementación mínima:**
- Leyenda fija en **categorías, fichas de producto, carrito y checkout**: "Precios con IVA incluido".
- **Nunca** cobrar nada por fuera de ese precio (envío/incrementos) sin anunciarlo antes del carrito; los impactos de modificadores ya vienen sumados en el precio del ítem.
- En el checkout, desglose claro (subtotal, envío/bolsa si aplica, impuesto) **antes** de confirmar; el monto final nunca puede ser mayor al anunciado en la ficha.
- El snapshot congelará ese total; el modelo interno puede guardar el IVA desglosado para contabilidad, pero la vista pública siempre muestra "Precio final (IVA incluido)".
- **Nota de cumplimiento**: verificar con el contador/a la tasa aplicable (16% general), el tratamiento de propinas y la base del IVA según el giro; esta regla es de negocio, no solo de UI.

### 1.5 Roles y autenticación de staff — RESUELTO
**Decisión:** cuatro roles:
- **`admin`** — dueño/gerencia: catálogo, horarios, aforo, mesas, reservas, reportes, gestión de staff.
- **`cajero`** — bandejas de entrada/salida, confirma/crea/cancela pedidos, genera y regenera tokens de repartidor.
- **`cocinero`** — KDS: marca `EN_PREPARACION` y `LISTO`; no ve pagos ni datos del cliente (solo lo que necesita cocinar).
- **`repartidor`** — sin credenciales; acceso solo mediante link único de un solo uso generado por caja (ver 1.2).
**Autenticación:** Supabase Auth con magic link (sin contraseñas para el staff; sin email compartido). Los roles se asignan desde una tabla `staff` (o `profiles.role`) y **nunca en los claims del JWT** para poder cambiarlos sin re-login; RLS lee el rol de la tabla.
**Privilegios mínimos con RLS (a definir en el esquema):**
| Rol | Puede ver | Puede escribir |
| --- | --- | --- |
| `admin` | todo | todo |
| `cajero` | todos los pedidos + pagos | confirmar/crear/cancelar, rotar tokens de repartidor |
| `cocinero` | solo las líneas del pedido en cocina | `CREADO→EN_PREPARACION`, `EN_PREPARACION→LISTO` |
| `repartidor` | solo su pedido por token (hasta entrega) | `EN_CAMINO→COMPLETADO` (único enlace de un solo uso) |
**Extensiones a campos:** `orders.delivery` gana `delivery_token` (hash), `delivery_token_expires_at`, `delivery_token_rotated_at`, `delivered_at` (para saber cuándo fue la confirmación real), y `orders.status_changed_by` para auditar quién movió cada estado (cajero/cocinero/token de repartidor).
**Próximo paso:** definir el esquema RLS con políticas por rol para SELECT, INSERT y UPDATE (y sus excepciones: el repartidor solo escribe el estado de entrega; el cocinero no ve el teléfono del cliente).

### 1.6 Notificaciones — DECISIÓN: solo deep links
No hay proveedor de mensajería. Consecuencia: la notificación activa (aviso de retraso) queda fuera; en v1 los canales directos son **`wa.me`/`tel:`** desde el track y el correo/confirmación. (Cuando exista pasarela, se podrá re-evaluar.) El teléfono del cliente se guarda porque el cliente lo dio voluntariamente para esos deep links; aun así, registrar consentimiento explícito en el checkout ("Deseo recibir avisos por WhatsApp en caso de retraso") como buena práctica de LFPDPPP.

### 1.7 Cierre de caja y reportes — RESUELTO (vista de caja)
Se agrega a la **vista de Caja** un panel "Cierre del día": total por método de pago (efectivo exacto, efectivo con cambio, tarjeta contra entrega), lista de pedidos del día y total general. Se calcula de `orders` — no requiere modelo extra más allá de `orders.payment_method` y `orders.status`. (Queda pendiente para la v1.1 el cierre formal con arqueo de caja física.)

### 1.8 Expiración de `CREADO` — RESUELTO (para recoger y domicilio)
- Los pedidos `CREADO` sin confirmar **expiran a los 15 min** (auto-transición a `CANCELADO` con motivo `tiempo_agotado`), para que la cocina no herede basura y el aforo no quede bloqueado.
- El cliente **puede auto-cancelar desde su track** mientras el estado sea `CREADO` (antes de que caja lo confirme); después, solo caja. Sin pasarela, no hay reembolso que coordinar.

---

## 🟠 Inconsistencias internas

### 1. Caché perimetral vs. indicador de ocupación en tiempo real
La capa de entrada "sirve la landing ... con caché perimetral" y a la vez la landing incluye "un indicador dinámico superior que lee la ocupación de mesas y barra". La ocupación es el dato *menos* cacheable del sistema: si el HTML (o el menú) se cachea en el borde, o el indicador muestra datos viejos (contradicción con "dinámico"), o hay que invalidar la caché en cada cambio de mesa (carísimo y frágil).

**Acción:** servir el indicador desde un endpoint dedicado **sin caché** (o con SWR corto de 10-15 s); el menú sí se cachea. Separar el dato vivo del estático desde el día 1.

### 2. Reserva: cupos por zona, no mesas concretas — DECISIÓN
Con "comer en el local" fuera de v1, las reservas se modelan por **aforo por zona** (Interior/Terraza/Barra), no por mesa concreta. La regla "bloquear la mesa a partir de las 19:15" de la spec queda **invalidada**: ahora el bloqueo es el aforo de la zona en el bloque horario. El panel de mesas (estados por toque) no existe en esta v1; queda para el roadmap de `EN_MESA`. **La reserva = cantidad de comensales dentro de un bloque horario contra el aforo de una zona.**
- Por cada zona: `capacity` (asientos) > `sum(reservas activas en el bloque)` — la validación del cupo es un **SELECT atómico** (ver riesgo 3) y el bloqueo de la zona aplica a todo el bloque elegido.
- Opción futura (no bloqueante): añadir `tables` y asignar reservas a mesas; el esquema actual no lo impide.
- El flujo operativo **no necesita mesas**: la reserva es puramente de aforo.

### 3. Pickup sin método de pago declarado — RESUELTO (pago contra entrega uniforme)
Sin pasarela, la regla es **uniforme para recoger y domicilio**: el cliente declara su método de pago en el checkout (efectivo exacto, efectivo con cambio, o tarjeta contra entrega), y el cobro ocurre **en mostrador o al recibir** — no hay "pago online" en ningún caso. Esto elimina la asimetría de la spec (pickup sin método vs. domicilio con método). `orders.payment_method` queda como dato del pedido desde creación, y `orders.payment_status` (`pendiente` → `cobrado` al entregar) alimenta el cierre de caja (1.7).

### 4. Los walk-ins no cuentan en el aforo
El indicador de ocupación y el bloqueo de aforo se alimentan de reservas y estados de mesas. Un cliente que entra sin reservar ocupa una mesa sin que ningún modelo lo registre (no es una order ni una reservation). Resultado: indicador subestima la ocupación en horario pico y el bloqueo de aforo deja gente afuera al pedo.

**Acción:** quien marque una mesa como `Ocupada` en el panel de mesas debe registrar granularidad mínima: comensales y hora de inicio (para derivar duración). Así el indicador es: capacidad − ocupadas − bloqueadas − reservadas en ventana de lockout.

### 5. `EN_CAMINO` / `LISTO_PARA_ENTREGA`: un solo estado, dos etiquetas — RESUELTO
Con el rol repartidor definido (1.2), la máquina de estados es **un solo estado `LISTO_PARA_ENTREGA`** (el pedido está listo y esperando salir), y la transición a `COMPLETADO` la hace **exclusivamente el repartidor** con su token único. La pantalla de Caja conserva la bandeja de "listos/despacho" tal como la pedía la spec. Etiquetas de UI:
- Recoger → "Listo para recoger" (lo entrega el cajero, quien marca `COMPLETADO` al entregar).
- Domicilio → "En camino" (lo avanza el repartidor al confirmar entrega).

**Relación con el rol:**
| Transición | Quién | Desde | Hacia |
| --- | --- | --- | --- |
| `CONFIRMADO_CAJA` | cajero | `CREADO` | `CONFIRMADO_CAJA` |
| `EN_PREPARACION` | cocinero | `CONFIRMADO_CAJA` | `EN_PREPARACION` |
| `LISTO` | cocinero | `EN_PREPARACION` | `LISTO` |
| `LISTO_PARA_ENTREGA` (recoger) | cajero | `LISTO` | `LISTO_PARA_ENTREGA` |
| `LISTO_PARA_ENTREGA` (domicilio) | sistema/repartidor | `LISTO` | `LISTO_PARA_ENTREGA` |
| `COMPLETADO` (recoger) | cajero | `LISTO_PARA_ENTREGA` | `COMPLETADO` |
| `COMPLETADO` (domicilio) | repartidor (token) | `LISTO_PARA_ENTREGA` | `COMPLETADO` |
| `CANCELADO` | cajero (o expiración) | cualquiera pre-confirmación | `CANCELADO` |

La transición de **domicilio de `LISTO → LISTO_PARA_ENTREGA` queda como decisión**: ¿la hace el repartidor (al tomar el pedido en mostrador) o la hace el sistema al marcar `LISTO` (asumiendo que el repartidor ya está en el local)? Recomendación: **la hace el sistema** (automática al `LISTO`), y el repartidor solo confirma la entrega con su token. Menos fricción en la cocina, y el token del repartidor sigue siendo de un solo uso para la entrega. Queda dicho aquí para no re-abrirlo.

### 6. Ocupación manual de mesas = datos stale
El panel de mesas es "un toque Libre/Ocupada" — operado por humanos en un local ocupado: la mesa queda `Ocupada` hasta que alguien se acuerde. Y si el flujo `EN_MESA` (Hueco 1) no existe, **nada cierra la mesa automáticamente**. Con eso, el indicador de la landing miente en ambos sentidos.

**Acción:** derivar la ocupación de la actividad real (order/reservation activa sobre la mesa) con el toggle manual como fallback, y/o auto-liberar al completar el pedido de la mesa.

---

## 🟡 Riesgos técnicos

### 1. Next.js Server Actions en Cloudflare Workers
La combinación "Next.js en Workers/Pages + Server Actions" es viable pero tiene bordes conocidos (`next-on-pages`/OpenNext): runtime Node limitado, streaming y middleware con restricciones. No es un bloqueante, pero **hay que validarlo en un spike de 1 día antes de comprometer la arquitectura** (una build de prueba con una Server Action que escriba en Supabase).

### 2. Transiciones de estado sin matriz rol→transición
"Secuencia unidireccional" es una intención, no un mecanismo. Sin validación en el backend, un bug en la UI de caja puede saltar de `CREADO` a `COMPLETADO` sin pasar por cocina, y el KDS se entera tarde.

**Acción:** enum con CHECK constraint `estado ∈ (…, …)` + validación de transición permitida en la Server Action (o una tabla `order_status_transitions`), más una matriz explícita **rol × transición permitida** aprovechando RLS (policy por rol sobre el UPDATE del estado). Esto es barato al inicio y caro de retrofitar.

### 3. Race condition en la última reserva / último cupo
"Validar cupos" en una Server Action en el borde, con dos clientes reservando el último cupo de Terraza a la vez: ambos pasan el SELECT, ambos insertan. Sin protección se sobre-reserva.

**Acción:** para v1, una sola escritura atómica: `INSERT ... WHERE` sobre un contador con recheck, o un `UPDATE ... RETURNING` atómico del cupo disponible (advisory lock / fila de aforo por zona). Definir esto *junto con* el esquema, no después.

### 4. `/track/[id]` — token vs. ID enumerable
"Acceso seguro sin registro mediante identificador único en la URL": si el identificador es un ID secuencial, cualquiera rastrea pedidos ajenos (y con RLS mal escrita, ve teléfono/dirección). La spec menciona "rastreo por token" en la interfaz pública — **alinear toda la spec con eso**: token corto no secuencial (nanoid, no el UUID crudo ni mucho menos el ID serial) + policy de RLS tipo `anon` que permita SELECT solo `WHERE token = actual` (o security definer). Rate-limit en el endpoint.
**Nuevo (2026-09-13):** el **track del repartidor** (`/track/delivery/<token>`) sigue el mismo patrón pero más estricto: token de un solo uso que solo permite la transición `EN_CAMINO → COMPLETADO`, se vuelve solo lectura post-entrega, y se regenera desde caja si se pierde. Tabla auxiliar `delivery_tokens` (hash del token, expiry, rotaciones) para no reusar el `track_token` del cliente. El `track_token` del cliente y el `delivery_token` del repartidor son **dos tokens distintos** para dos permisos distintos.

### 5. Realtime en la red del local
"Milisegundos" es cierto en condiciones ideales; el Wi-Fi de un restaurante + pantallas KDS con suspensión de pantalla + caídas de red son el caso normal. Sin manejo de reconexión, el KDS se congela con datos viejos sin avisar.

**Acción:** comportamiento explícito en KDS/Caja: último estado conocido + badge "desconectado" + re-sync al reconectar. No requiere offline queue completa para v1, pero hay que diseñar la UI para sobrevivir sin conexión momentánea.

### 6. Doble submit en checkout
Un toque doble (o un retry del navegador) en "Confirmar pedido" crea dos órdenes `CREADO` y la cocina ve duplicados. Las Server Actions no son idempotentes por defecto.

**Acción:** idempotency key por checkout (un token generado al montar el carrito, único por confirmación) + dedupe en la Server Action. Dos líneas, se hace al inicio.

### 7. ETA prometida sin capacidad de cocina
"Hora estimada de llegada" libre, sin validar contra el tiempo de preparación ni la carga actual de la cocina: promesas incumplibles en horario pico (y `CREADO` no entra a cocina hasta que caja confirme — el reloj del cliente corre desde antes).

**Acción:** mínimo v1: restringir la hora estimada a bloques futuros válidos (≥ prep-time típico, dentro del horario de cocina) y explicitar en la UI del track que "Recibido" no implica "en cocina".

### 8. Snapshot en "texto estructurado" mata los reportes
Congelar como texto es correcto y barato, pero si el texto es opaco (JSON sin schema), después no se puede responder "¿cuánto vendimos de +2.00 extra de queso?" sin parsear strings. Y el snapshot debería congelar **también** nombre y descripción del producto/grupo/opción, no solo precios.

**Acción:** snapshot = columna JSONB con schema fijo documentado (ítem: producto {id, nombre, precio}, opciones: [{id, nombre, impacto, cantidad}]) + —si los reportes importan — una tabla normalizada `order_item_options` en paralelo. Decidir en el esquema, porque retrofitar datos históricos es doloroso.

### 9. Límite del modelo de modificadores: "pizzas por mitades"
Min/max por grupo cubre "término de carne" (1..1) y "extra de queso" (0..3), pero **no** una pizza con dos mitades: dos selecciones del mismo grupo (mitad 1, mitad 2) con cantidades y precios distintos. El modelo genérico necesita "selecciones múltiples del mismo grupo" (grupo repetible N veces con sus propias reglas de min/max por selección).

**Acción:** si las mitades son requisito (la spec la menciona explícitamente), agregar al modelo de grupos un flag `repeatable`/`max_selections` y validarlo en el checkout. Si no, sacar el ejemplo de la spec.

---

## Decisiones abiertas para el negocio (post 2026-09-13)

**Cerradas en esta ronda:** comer en el local (fuera), pasarelas (fuera), repartidor (track token), IVA incluido, roles (4), reservas por zona, pizza por mitades (fuera de v1), descuentos (engine completo), depósito manual, delivery (tarifa fija + OSM/OSRM después), multi-local desde v1, menú único, alérgenos en v1, zona horaria por local, IVA 16% + propina, promos (códigos+automáticas+manual, sin apilar). **Solo queda por confirmar con contador la tasa de IVA y el tratamiento de propinas (ver abajo).**

---

## ✅ Decisiones de negocio cerradas (2026-09-13)

### 1. Pizza por mitades — FUERA de v1
El modelo min/max de modificadores ya cubre el resto de casos. Se elimina el ejemplo de "pizzas por mitades" de la spec de v1; si llega, se agrega `repeatable`/`max_selections` al modelo de grupos.

### 2. Descuentos — ENGINE COMPLETO en v1
`Códigos + promos automáticas + descuento manual de caja`. Reglas: % o monto; condiciones (mínimo de compra, productos/categorías, horario, días, límites de uso); **1 cupón por pedido, sin apilar** (ni con el descuento manual). Ver modelo en el esquema.

### 3. Reservas — DEPÓSITO MANUAL para grupos grandes
Sin pasarela no hay cobro online. Se coordina por WhatsApp: la reserva lleva `deposit_status` (`sin_deposito` / `deposito_pendiente` / `depositado`). La regla de bloqueo: si el grupo supera un umbral (definir, ej. ≥8 comensales) y el depósito no está `depositado`, la reserva queda `pendiente_deposito` y **no bloquea cupo hasta confirmar por WhatsApp**. El no-show se puede manejar después (registro de no-shows y bloqueo de clientes es futuro).

### 4. Delivery — TARIFA FIJA en v1 + módulo de distancia preparado
- **v1:** tarifa fija configurable por local (cargo único por pedido o por zonas fijas). El despachador sabe exactamente cuánto cobrar.
- **Futuro:** integración con **OSRM/OpenStreetMap** para calcular distancia en km real por ruta y comparar contra una **matriz de zonas definidas** (ej. zona A ≤3km, zona B ≤6km, etc.) → tarifa según zona. **No se depende de Google Maps**: el skill `maps` ya trae geocoding (Nominatim), rutas y distancias (OSRM), y timezone (TimeAPI.io) sin API key. Se deja la capa de cálculo de tarifa **abstraída** (interface `DeliveryFeeCalculator`) para enchufar OSRM hoy o Google Maps mañana.
- El campo `orders.delivery_zone` queda preparado (nullable).

### 5. Multi-local desde v1 — ALCANCE COMPLETO
Toda la arquitectura se modela con **`location_id` como columna transversal**:
- **Catálogo**: cada producto/grupo/modificador pertenece a un local (`catalog_items.location_id`).
- **Horarios**: por local (atención al público y cocina).
- **Reservas**: por zona y por local.
- **Cocina/KDS**: filtra por local.
- **RLS**: las policies filtran por el local del staff.
- **Dominio/URL**: cada local tiene su subdominio (`mi-local.midominio.com`), con el menú, la landing y el checkout de ese local.
- Moneda/idioma por local también (default MXN/es).
- Implica más complejidad en modelo y RLS, pero evita el retrabajo de migrar de single a multi.

### 6. Menú por horario — FUERA de v1
Catálogo único todo el día. El Admin de Horarios (atención/cocina por local) ya corta pedidos fuera de horario. Los tramos por producto (desayuno/almuerzo/cena) quedan para después.

### 7. Alérgenos / info dietaria — EN v1 (básico)
Lista fija de alérgenos por producto + etiquetas (vegetariano, vegano, sin gluten). Se muestra en la ficha del producto. (NOM-050 también es relevante para la declaración de alérgenos en alimentos — verificar con el giro.) No hay búsqueda/filtro por alérgeno en v1.

### 8. Zona horaria y "Cerrado por imprevistos" — POR LOCAL (esp)
Una zona horaria por local (default CDMX), el switch "Cerrado por imprevistos" es **por local**, y los horarios de atención/cocina son **por local** y por día. (Es la recurrencia esperada con multi-local.)

### 9. IVA — ajustable por local (default 16%)
Precios públicos con IVA incluido; desglose interno para contabilidad. **No se maneja propina en el sistema** (se deja al discretion del cliente en efectivo o fuera del ticket). La tasa es configurable por local en la tabla `locals` con valor por defecto 0.16 (16%). 
**Pendiente:** confirmar con el contador/a la tasa exacta aplicable al giro (aunque el default 16% es el estándar general en México).

### 10. Engine de promos — ALCANCE CONCRETO
- **Códigos** aplicables en checkout (cupones).
- **Promos automáticas** (descuento que aplica solo por reglas de negocio, sin código).
- **Descuento manual** del cajero.
- Reglas: % o monto; mínimo de compra; productos/categorías; horario; días; límites de uso (total, por cliente, por día).
- **1 cupón por pedido, sin apilar** (ni cupón + manual).

---

## Decisiones que quedan para después (no bloquean v1)

1. Depósito/no-show: política de no-shows y bloqueo de clientes (futuro).
2. Integración de distancias (OSRM/Google) para tarifas por zona — arquitectura preparada, implementación futura.
3. Menú por tramos horarios (desayuno/almuerzo/cena) — futuro.
4. Descuentos apilables y códigos con más reglas — futuro.
5. Confirmación con contador: tasa IVA y propinas — **antes de producción**.

---

## Lo que SÍ está bien planteado (no tocar)

- **Snapshot de compra**: la decisión de congelar modificadores/precios en el ítem es correcta y evita la clase de bugs más odiada de los POS.
- **Mínimo de datos por caso de uso**: la tabla es disciplinada y bien justificada (fricción de checkout bien entendida).
- **`CREADO` → no entra a cocina hasta confirmar**: buena decisión anti-desperdicio.
- **Menú por capas (categoría/producto/grupo/opción)**: modelo sólido y probado en la industria.
- **"86 list" desde caja con efecto en el menú público**: buena idea, solo falta la regla de contingencia (si un grupo obligatorio queda 86, el producto se deshabilita solo).
- **KDS de alta legibilidad y una sola acción por avance**: correcto para el contexto.