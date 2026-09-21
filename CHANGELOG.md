# Changelog
## [0.6.0] — 2026-09-20

### Fixed — Pedido invisible en Caja/KDS + el link de seguimiento del checkout era el del repartidor

#### 1. El pedido creado no aparecía en Caja (ni pasaría a Cocina)
- **Síntoma**: pedido creado desde el checkout (status `CREADO`) no aparecía en
  `/staff/caja`; por tanto tampoco llegaría a `/staff/kds` tras confirmarse.
- **Causa**: `useRealtimeOrders` cargaba el estado inicial con un SELECT desde
  el **browser** a `staff_orders_view`, que depende de que el GUC
  `app.local_id` (nunca seteado en el browser) o el claim JWT
  `user_metadata.location_id` pasen la policy `orders_staff_live`; y los
  eventos Realtime requieren además `orders` en la publication
  `supabase_realtime`. Cualquier fallo (vista sin GRANT, JWT sin claim,
  publication sin configurar) dejaba la pantalla vacía **sin error** — el hook
  se tragaba el error (`if (isMounted && !error)`) y no había ningún reintento.
- **`src/lib/server/order.ts`** (`listOrdersForLocation`, ahora usada):
  - Bug latente corregido: usa service role (que **salta RLS**), así que el GUC
    no filtra nada; agregado el filtro explícito
    `.eq('location_id', staff.location_id)` (sin él listaría pedidos de TODOS
    los locales).
  - Los errores ahora se loguean (`describeSupabaseError`) en vez de devolver
    `[]` en silencio.
- **`src/features/staff/useRealtimeOrders.ts`** (usado por Caja y KDS):
  - Carga inicial y refetch vía server action `listOrdersForLocation`
    (servidor, filtro explícito por local): ya no depende del GUC, del claim
    JWT ni de la publication → el pedido nuevo **siempre** aparece.
  - Red de seguridad: refetch al conectar el canal (`SUBSCRIBED`), al
    recuperar el foco de la pestaña y polling cada 30s.
  - Conciliación del refetch con el estado local (por `updated_at` y
    `created_at` fresco) para que un fetch en vuelo no reviva estados viejos
    ni tape un pedido recién insertado por Realtime.
  - Callback de `subscribe` tipado con `REALTIME_SUBSCRIBE_STATES` (el
    literal suelto daba TS7006 con supabase-js 2.116).
- **`docs/fix-realtime-caja.sql`** (nuevo): checklist idempotente para el SQL
  Editor de Supabase — agrega `orders` a la publication `supabase_realtime`,
  GRANT SELECT a `authenticated` (orders + `staff_orders_view`), recrea la
  policy `orders_staff_live` y trae queries de verificación. Solo habilita la
  capa "en vivo" (Realtime); la carga inicial ya funciona sin ejecutarlo.

#### 2. El link de seguimiento generado en el checkout era el del REPARTIDOR
- **Síntoma**: tras enviar el pedido, el botón "Ver seguimiento en vivo" llevaba
  al cliente a `/track/{token-de-repartidor}` → pantalla "Entrega de Pedido"
  con botón "Marcar como Entregado": el cliente podía **completar el pedido**
  saltándose todo el flujo (y el token plano de un solo uso quedaba expuesto).
- **Causa**: `createOrder` devolvía `track_token: plainToken` (el token del
  repartidor, guardado hash-only en `delivery_tokens`) en lugar del UUID de
  seguimiento del cliente (`orders.delivery_token`), que es lo que
  `/track/[token]` resuelve en modo cliente (stepper "Seguimiento en Vivo",
  solo lectura).
- **`src/features/checkout/actions.ts`**: ahora devuelve
  `track_token = order.delivery_token` (UUID del cliente). El link del
  repartidor **no** se genera en el checkout: se crea y comparte después desde
  Caja (`regenerateDeliveryToken` → `/track/repartidor/{token}`, un solo uso,
  2h), que es el flujo correcto — el cliente pide; el link de reparto se
  comparte cuando se despacha.
- **`src/features/checkout/CheckoutForm.tsx`**: el botón ya apuntaba a
  `/track/{track_token}`; ahora ese href es el link del CLIENTE (comentario
  actualizado). Limpieza: import `Cart`/`CartItem` sin uso removidos.
- **`src/lib/server/order.ts`**: eliminados 4 `any` preexistentes (join
  delivery_tokens × orders ahora tipado con `DeliveryTokenCandidate` /
  `DeliveryTokenWithOrder`); lint de los archivos tocados en 0 problemas.
- **Validación**: `npx tsc --noEmit` → 0 errores; `eslint` en tocados → 0
  problemas; `npm run test` → 53/53; `npm run build` → OK (19 rutas).

---

## [0.5.9] — 2026-09-20

### Fixed — "Local no resuelto" en el panel: `getCurrentStaff` leía `locals` con el cliente de sesión
- **Síntoma**: con el setup correcto (verificado read-only: 1 local, 1 staff
  activo con `location_id` y `auth_user_id` vinculados), el panel admin
  mostraba el aviso amarillo "⚠️ Local no resuelto" en Menú, "Control total
  del local ." (sin nombre) en Dashboard y "No hay datos del local." en la
  tarjeta Local. El menú público `/{slug}` funcionaba normalmente.
- **Causa raíz (reproducida contra BD viva)**: el paso 5 de `getCurrentStaff`
  (`src/app/staff/page.tsx`) cargaba el local con el **cliente de sesión**
  (anon key + JWT → aplica RLS), mientras que la búsqueda de staff usa service
  role (salta RLS). La única policy de `locals` (`locals_staff_access`,
  `docs/install.sql` §6) exige `id = current_setting('app.local_id', true)::uuid`,
  GUC que en esa ruta nunca se setea → RLS filtra la fila → `data = null`
  **sin error**, y el código además ignoraba `error` (`const { data: local }`).
  Probe read-only: SELECT de `locals` por id con cliente anon → **0 filas**
  (reproduce el bug); con service role → 1 fila. Nota estructural:
  `set_config(is_local: true)` es transaccional y rpc/SELECT van en requests
  de PostgREST distintas, así que "setear el GUC antes" no es fiable aquí.
- **`src/app/staff/page.tsx`**: la carga del local ahora usa `adminSupabase`
  (service role, el mismo cliente de la búsqueda de staff) y verifica `error`
  → log `getCurrentStaff/local_query` con `describeSupabaseError` en vez de
  tragárselo. Si el staff no tiene `location_id`, se loguea y se devuelve
  `local: null` (la UI degrada al aviso amarillo sin romper la sesión).
  Rationale idéntica a `getLocalBySlug` (`src/lib/server/local.ts`, que ya
  documentaba leer `locals` con service role porque la policy oculta la tabla
  al rol anon): el local es dato público del menú y el service role corre solo
  en el servidor. Consistente con toda la capa de datos (`menu.ts`,
  `locals.ts`, `reservations.ts`, `reports.ts`).
- **Validación**: re-probe read-only replicando la consulta corregida
  (service role SELECT `locals` por `staff.location_id` → fila devuelta);
  `npx tsc --noEmit` → 0 errores; `eslint` en tocados → 0 problemas;
  `npm run test` → 53/53; `npm run build` → OK.

---

## [0.5.8] — 2026-09-20

### Fixed — Causa raíz de toda la saga de login: `staff.created_by`/`updated_by` no existen
- **Verificación en BD viva (solo lectura)**: las consultas de `getCurrentStaff`
  fallaban **siempre** con `42703 column staff.created_by does not exist` (5/5
  intentos). El esquema canónico (`docs/install.sql` §3.3) define `staff` sin
  columnas de auditoría — decisión de diseño de v0.2.6 ("la tabla raíz no lleva
  auditoría: dependencia circular `locals↔staff`"; `reservations` §3.5 sí las
  tiene porque no hay ciclo). El código quedó con referencias fantasma.
- **Esta única causa explica toda la saga**: en ≤0.5.5 el error se tragaba
  (solo se leía `data`) → "no hay staff" → INSERT en cada visita → `23505
  duplicate key staff_auth_user_id_key` + bucle `/staff`↔`/login`; en 0.5.6 el
  mismo fantasma → `no_staff` (cierre de sesión); en 0.5.7 el check de error
  lo reveló como `staff_lookup_failed`. La fila de staff en BD siempre estuvo
  bien.
- **`src/app/staff/page.tsx`**: quitadas `created_by, updated_by` de los dos
  SELECTs de `getCurrentStaff`. El login/portal vuelve a resolver el staff por
  `auth_user_id` (y fallback por email).
- **`src/lib/server/staff.ts`** (panel admin, roto por el mismo 42703/PGRST204):
  `listStaff` (SELECT + tipo de retorno), `createStaff` (INSERT), `updateStaff`
  (UPDATE), `toggleStaffActive` (UPDATE) e `inviteStaff` (INSERT) ya no
  referencian columnas de auditoría inexistentes.
- **`src/lib/types.ts`**: interface `Staff` sin `created_by`/`updated_by`
  (coincide con el esquema y con `AdminStaff.tsx`, que nunca las renderizó).
- **`src/lib/server/reservations.ts` no se toca**: `reservations` SÍ tiene
  `created_by`/`updated_by` (install.sql §3.5) — su uso es válido.
- **Validación**: re-probe read-only de las consultas exactas de
  `getCurrentStaff` → resuelven sin error (fila de `me@juanlopez.dev`
  encontrada por `auth_user_id` y por email); `npx tsc --noEmit` → 0 errores;
  eslint en tocados → 0 problemas; `npm run test` → 53/53; `npm run build` → OK.

---

## [0.5.7] — 2026-09-20

### Fixed — `getCurrentStaff` no traga errores de consulta (falso "no hay staff")
- **Diagnóstico**: tras 0.5.6 el flujo reportó `no_staff` para
  `me@juanlopez.dev` y cerró la sesión. Verificación contra la BD (solo
  lectura, `staff` + `auth.users`): el estado es consistente — existe 1 local
  (`centro`), 1 staff (`me@juanlopez.dev`, activo, con `auth_user_id`
  vinculado) y 1 auth user confirmado con metadata `location_id` correcta.
  El reporte correspondió a un momento en que la fila aún no existía; hoy el
  acceso por `auth_user_id` resuelve normalmente.
- **Causa estructural (hardening)**: las dos búsquedas de `getCurrentStaff`
  (`src/app/staff/page.tsx`) solo destructuraban `data` e ignoraban `error`:
  un fallo transitorio (red, 5xx, `PGRST116` en `maybeSingle()`) se
  interpretaba como "no hay staff" → **cerraba la sesión** injustamente.
- **`src/app/staff/page.tsx`**: ambas búsquedas (por `auth_user_id` y fallback
  por email) ahora verifican `error`; ante fallo loguean
  `getCurrentStaff/lookup_error` (con `describeSupabaseError`) y redirigen a
  `/login?error=staff_lookup_failed` **sin cerrar la sesión** (con el error
  visible, `/login` renderiza el formulario en vez de auto-redirigir a
  `/staff`, así que no hay bucle). El caso genuino "sin staff" sigue cerrando
  sesión vía `/staff/auth/logout?reason=no_staff`.
- **`src/app/login/page.tsx`**: nuevo código `staff_lookup_failed` → "No se
  pudieron verificar tus datos de acceso. Intenta de nuevo en unos segundos."

---

## [0.5.6] — 2026-09-20

### Removed — El sistema ya NO auto-crea staff: el alta es manual
- **`src/app/staff/page.tsx` (`getCurrentStaff`)**: eliminado el bloque de
  auto-creación de staff (buscar primer local, GUC `app.local_id`, `INSERT` en
  `staff` y redirect de debug con `staff_create_failed`). Era la única pieza de
  "instalación automática": cualquier usuario autenticado sin registro de staff
  disparaba un `INSERT`, que al no ser atómico (búsqueda → inserción)
  competía consigo mismo en la cadena `/staff` → `/login` → `/staff` y
  provocaba el `23505 duplicate key ... staff_auth_user_id_key` + bucle de
  redirecciones. Se conservan la búsqueda por `auth_user_id`, el fallback por
  email y la vinculación de `auth_user_id` (sincronización de registros
  existentes; `/setup` e `inviteStaff` crean el staff primero y vinculan
  después).
- **Comportamiento nuevo sin staff**: usuario autenticado sin registro de
  staff → su sesión se cierra vía `GET /staff/auth/logout?reason=no_staff`
  (route handler nuevo; un Server Component no puede escribir cookies y
  redirigir a `/login` con sesión activa era un bucle) → `/login?error=no_staff`.
- **`src/app/login/page.tsx`**: ahora lee `searchParams` (Promise en Next 16)
  y muestra el error en la UI (antes `?error=...` era un parámetro muerto que
  nadie renderizaba). Con error visible ya no auto-redirige a `/staff` (rompe
  el bucle). Mapa de códigos → mensajes ES: `no_staff` y `1` (callback de
  magic link), con fallback genérico para códigos desconocidos.
- **`src/features/staff/SignInForm.tsx`**: nueva prop opcional `initialError`
  renderizada en el recuadro de error existente. De paso, el enlace
  `<a href="/recuperar">` se migró a `<Link />` (corregía el único error de
  lint del archivo: `@next/next/no-html-link-for-pages`).
- **Nota operativa**: el alta de staff sigue siendo manual — wizard `/setup`
  (primer admin), invitación desde el panel admin (`inviteStaff`) o SQL
  (`docs/install.sql`). El 23505 desaparece como efecto colateral de eliminar
  el `INSERT` automático.
- **Validación**: `npx tsc --noEmit` → 0 errores; `eslint` en los 4 archivos
  tocados → 0 problemas (el resto de errores/warnings de lint son preexistentes
  en módulos no tocados); `npm run test` → 53/53; `npm run build` → OK con la
  ruta nueva `/staff/auth/logout` registrada.

---

## [0.5.5] — 2026-09-20

### Fixed — `/setup` fallaba al crear el admin: trigger sobre `auth.users` sin `SECURITY DEFINER`
- **Causa raíz (verificada)**: el trigger `trigger_auth_user_sync_staff`
  (AFTER INSERT ON `auth.users`; `docs/install.sql` §5.3 y
  `docs/migration-link-auth-staff.sql` §5) ejecutaba
  `auth_user_sync_staff()` en modo SECURITY INVOKER. El INSERT lo realiza el
  rol `supabase_auth_admin` (servicio GoTrue), que NO tiene privilegios sobre
  `public.staff` → `permission denied for table staff` (42501) → la
  transacción se revierte → GoTrue responde "Database error creating new user"
  (HTTP 500, `AuthRetryableFetchError`). Afectaba a `/setup`
  (`initializeSystem`) y a la invitación de staff con contraseña
  (`inviteStaff`, `src/lib/server/staff.ts`).
- **`docs/fix-auth-user-sync-staff.sql` (nuevo)**: parche idempotente para la
  BD viva. Recrea las dos funciones de auth-sync como `SECURITY DEFINER` con
  `SET search_path = ''` y nombres calificados (patrón oficial de Supabase
  para triggers sobre `auth.users`). Fail-soft: un fallo de vinculación queda
  como WARNING y no aborta la creación del usuario (la app ya vincula
  explícitamente `auth_user_id` y hay fallback por email). Incluye query de
  verificación (`prosecdef = true`).
- **`docs/install.sql` §5.2/5.3 y `docs/migration-link-auth-staff.sql` §4/§5**:
  mismo endurecimiento para instalaciones y migraciones futuras.
- **`src/lib/server/setup.ts` / `staff.ts`**: los `AppError` de creación de
  usuario ahora preservan `cause: authError` (y `staff.ts` loguea con
  `describeSupabaseError`) para conservar la cadena de causalidad en logs.
- **Acción requerida**: ejecutar `docs/fix-auth-user-sync-staff.sql` en el SQL
  Editor de Supabase y reintentar `/setup`.

---

## [0.5.4] — 2026-09-20

### Removed — Limpieza de archivos innecesarios
- **Assets default de create-next-app eliminados**: `public/file.svg`,
  `globe.svg`, `next.svg`, `vercel.svg` y `window.svg` no tenían ninguna
  referencia en el código.
- **Código muerto eliminado**: `src/lib/supabase/jwt.ts` (verificación de JWT
  vía JWKS con `jose`) no era importado por ningún módulo; la app protege
  rutas con sesión de cookies (`@supabase/ssr`). Se removió también la
  dependencia `jose` de `package.json`, que solo la usaba ese archivo.
- **Docs y scripts one-off de la migración subdominio → slug (v0.5.1)
  eliminados**: `PLAN.md` (snapshot desactualizado, superado por `TODO.md`),
  `scripts/migrate-subdomain-to-slug.mjs`,
  `scripts/test-menu-images-bucket.mjs` y
  `docs/migrate-subdomain-to-slug.sql` (todo su contenido ya está incluido
  en `docs/install.sql`).
- **Artefactos de build eliminados**: `tsconfig.tsbuildinfo` y `.next/`
  (regenerables, ya ignorados por `.gitignore`).
- **Referencias colgantes actualizadas**: `docs/DEPLOY.md` ya no lista el SQL
  de migración subdominio→slug (eliminado) y `TODO.md` ya no cita a `PLAN.md`
  como fuente.

---

## [0.5.3] — 2026-09-20

### Changed — Un solo SQL de instalación (`install.sql` sin seed)
- **`docs/install.sql` es ahora el ÚNICO SQL de instalación**: se eliminó
  `docs/schema.sql`, que era una copia desactualizada (sin GRANTs de
  anon/authenticated, sin auth-sync, sin `orders_staff_live`, sin vistas ni
  cron); ejecutarlo reproducía el bug 401/42501 del menú público.
- **`install.sql` ya NO incluye seed demo**: la base queda vacía a propósito.
  El onboarding de `/setup` (`checkSystemInitialized`) depende de que `locals`
  esté vacío para mostrar el wizard; el seed inline de la §11 lo bloqueaba
  (insertaba un local → `/setup` redirigía a `/login` y el onboarding nunca
  aparecía). Para datos demo en desarrollo, ejecutar aparte `docs/seed.sql`.
- **Docs**: `DEPLOY.md` actualizado (flujo: install.sql → `/setup` onboarding →
  login) y `rls-audit.md` ya no referencia `schema.sql`.
- Los demás SQL de `docs/` no cambian: son parches para proyectos ya instalados
  (todo su contenido ya está incluido dentro de `install.sql`).

---

## [0.5.2] — 2026-09-20

### Fixed — Menú público caído: faltaban GRANT del rol anon (401/42501)
- **Causa raíz (verificada contra la API de Supabase)**: las 4 cargas del menú
  público (`getMenu`: categories, products, modifier_groups, modifier_options)
  — y también `allergens`/`diet_labels` y el ping de `/api/health` — respondían
  `401 code 42501 "permission denied for table X"`. Las policies RLS públicas
  estaban correctas, pero en proyectos con API keys nuevas (`sb_publishable_*`)
  las tablas creadas por SQL Editor NO heredan los privilegios por defecto del
  rol anon: sin `GRANT` base, las policies ni siquiera llegan a evaluarse.
- **`docs/fix-grants-public-read.sql` (nuevo)**: script idempotente para pegar
  en el SQL Editor de Supabase. Restaura el modelo estándar de Supabase:
  `GRANT USAGE` del schema + `GRANT SELECT` para anon/authenticated en las
  tablas con policy `*_public_read` (menú, promos, aforo, datos maestros);
  `SELECT` en `locals` solo para el ping de health (RLS oculta filas: el
  público no puede enumerar locales); `SELECT` en `orders` solo para
  authenticated (Realtime KDS vía `orders_staff_live`). Incluye query de
  verificación con `has_table_privilege`. GRANT = privilegio base; POLICY =
  qué filas; dar SELECT no expone nada que RLS no filtre ya.
- **`docs/install.sql` §6.1**: mismo bloque de GRANTs para instalaciones
  frescas, con la explicación GRANT vs POLICY y referencia al script de fix.
- **Errores opacos en consola**: los `console.error` del menú mostraban `{}`
  en el overlay de Next (los objetos Error se serializan sin propiedades
  enumerables). Nuevo helper `describeSupabaseError()` en `lib/errors.ts`
  (code | message | details | hint | HTTP status) aplicado en
  `features/menu/queries.ts` (4 cargas) y `features/menu/allergens.ts`, que
  antes fallaba en silencio y devolvía listas vacías.

### Admin (revisión solicitada)
- **Derechos: correctos.** Todo el CRUD del admin (categorías, productos,
  grupos y opciones de modificadores) usa service role (salta RLS) con checks
  de ownership por `location_id`; el fallo solo afectaba al rol anon del menú
  público, no al staff.
- **Cobertura de campos vs. esquema: completa.** Categorías (name, description,
  image_url, is_active, sort_order), productos (category_id, base_price,
  is_available, imagen, alérgenos, etiquetas), grupos (is_required,
  min/max_selections, product_id) y opciones (name, price_impact). Las tablas
  de modificadores no tienen `sort_order` en el esquema (no falta nada). En
  `modifier_options` existe columna `is_active` (el menú público la filtra),
  pero el modal del admin aún no la expone: siempre envía `true` (mejora
  opcional pendiente: toggle activa/inactiva por opción).

### Validation
- `npx tsc --noEmit` → 0 errores · `npm run test` → 53/53 ✓ ·
  `npm run build` → OK. (`npm run lint` mantiene los 57 errores pre-existentes
  en archivos no relacionados; los 3 archivos tocados no aportan issues.)
- **Pendiente del lado DB (acción del dueño)**: ejecutar
  `docs/fix-grants-public-read.sql` en el SQL Editor de Supabase y recargar
  `/{slug}`. Sin ese paso el menú público sigue en 401.

## [0.5.1] — 2026-09-19

### Fixed — Admin Menu UX (visibilidad y contexto de local)
- **Paso 1–2**: `AdminView` ahora pasa `local` a `AdminMenuCategories` y `AdminMenuProducts`. Ambos componentes muestran un **banner contextual** con nombre, slug (`/{slug}`), IVA y costo de envío, más enlace **"Ver menú público →"** que abre la URL del local en otra pestaña. Si `local` es `null`, muestra advertencia de "Local no resuelto".
- **Paso 3**: Tabla de productos (`AdminMenuProducts`) añade columna **"Visibilidad"** (Visible en público ✓ / No visible + razón: "Categoría inactiva" y/o "Producto agotado") y filtro visual `bg-yellow-50` en filas no visibles. Nueva acción **"Ver en menú →"** solo cuando el producto sí es visible. Tabla de categorías (`AdminMenuCategories`) destaca filas inactivas con fondo amarillo y badge "⚠️ No visible en público".
- **Paso 4**: Feedback inline al guardar:
  - En productos: si la categoría seleccionada está inactiva **o** el producto queda `is_available = false`, toast warning: "⚠️ Este producto no aparecerá en el menú público porque su categoría está inactiva / está marcado como Agotado".
  - En categorías: al desactivar una categoría, toast advierte: "⚠️ Categoría desactivada — los productos dentro no aparecerán en el menú público".
- **Paso 5 (diagnóstico)**: Consulta SQL sugerida en el plan para auditar estado real (`products.is_available`, `categories.is_active`, `location_id`).

### Validation
- `npx tsc --noEmit` → 0 errores · `npm run test` → 53/53 ✓ · `npm run build` → OK.

## [0.5.0] — 2026-09-19

### Added — Calidad y docs (Fase 4)
- **`tests/domain.test.ts` (28 tests)**: engine de promociones completo
  (tarea 13: no-stacking código>auto, case-insensitive, % subtotal y por
  producto, fijo limitado al subtotal, min purchase, ventanas temporales,
  día de semana, límites total/cliente/día, inactiva, mejor automática) +
  tokens (alfabeto sin ambiguos, roundtrip bcrypt) + pricing/IVA interno +
  validation + slugs. **Total suite: 53 tests ✓ (`npm run test`)**.
- **`lib/logger.ts`** (tarea 33): logging estructurado (niveles, scopes
  anidados, JSON en prod / legible en dev) conectado en los cron routes.
- **`docs/rls-audit.md`** (tarea 31): verificado (GUC por policy, vista
  `security_invoker`, tokens hash-only) + hallazgos abiertos con mitigación
  (policies públicas sin `location_id` — impacto bajo en modelo
  1-DB-por-restaurante) + checklist operativo.
- **`scripts/seed-test-data.mjs [slug] [n]`** (tarea 36): órdenes de test
  (estados/tipos/pagos variados, últimos 7 días) para ejercitar Reportes y
  Cierre de Caja; idempotente.
- **`idea.md` reescrita**: refleja el modelo actual por rutas (sin
  subdominios), sin roles (decisión del dueño) y el estado real v0.5.0;
  `TODO.md` actualizado con cierre de fases y pendiente real.

### Validación
- `npx tsc --noEmit` → 0 errores · `npm run test` → 53/53 ✓ ·
  `npm run build` → OK.

## [0.4.0] — 2026-09-19

### ⚠️ Requiere acción manual (una vez, por proyecto/DB)
Ejecutar `docs/migration-driver-id.sql` en **Supabase → SQL Editor** (como
postgres) para habilitar la asignación de repartidor: agrega `orders.driver_id`
(FK a staff, SET NULL) + índice + recrea `staff_orders_view` con `driver_id`.
Es idempotente. Sin ella, la UI de reparto responde "Error de configuración".

### Added — Cierre funcional (Fase 3)
- **Aforo por zona (Settings)**: `ZoneCapacityEditor` en el tab Locales +
  `upsertZoneCapacity` (upsert por PK `location_id+zone`; capacidad 0 elimina
  la zona del calendario de reservas).
- **Reportes**: gráfica de barras de ingresos por día (pure CSS, sin
  dependencias) y sección **Cierre de Caja** (efectivo/tarjeta esperado +
  detalle por pedido, con selector de fecha) sobre el `getCashRegisterData`
  existente.
- **Reparto en Caja**: selector de repartidor (`assignDriver`, valida staff
  activo del local; sin roles, por decisión del dueño) y **Link repartidor**
  (`regenerateDeliveryToken`: revoca los tokens vigentes y genera uno nuevo de
  un solo uso, 2h; URL copiable).
- **Infra**: `/api/health` (env vars + ping a Supabase, 503 en fallo),
  `lib/server/cron-auth.ts` con `CRON_SECRET` protegiendo `/api/cron/*`
  (Bearer o `?secret=`; sin secret en producción responde 401),
  `.env.example` completo y `docs/DEPLOY.md` (Vercel + Supabase, Storage,
  crons, setup, monitoreo, tests).

### Validación
- `npx tsc --noEmit` → 0 errores · `npm run test` → 25/25 ✓ ·
  `npm run build` → OK (rutas nuevas: `/api/health`).

## [0.3.0] — 2026-09-19

### Added — Saneamiento del error 500/PGRST en formularios (Fase 2 completa)
- **`src/lib/errors.ts`** (catálogo central): `AppError`, `parsePostgrestError()`
  (23505/23503/23514/23502/PGRST116/PGRST200-204/storage → español),
  `formatZodError`, `toUserMessage()` (barrera anti-crudo en cliente),
  `parseOrThrow()` (safeParse con fieldErrors) y `queryOrThrow()` (log crudo en
  servidor + AppError mostrable + detección de data null por RLS).
- **`src/lib/forms.ts`** — hook `useServerForm()`: `saving`, error general
  persistente (`formError`), errores por campo (`fieldErrors`) y wrapper
  `submit()` que traduce cualquier crudo. Los forms conservan valores al fallar.
- **`src/components/ui/form-error.tsx`** — `FormAlert` + `FieldError` +
  `fieldAria()` (accesibilidad input↔error).
- **`src/lib/validation.ts`** — `zNumberES()`: `z.coerce.number()` con mensaje
  en español; elimina el `"Invalid input: expected number, received NaN"`
  que veían los usuarios con inputs numéricos inválidos.
- **`vitest.config.ts`** (alias `@`, `db-verify` excluido) + scripts
  `npm run test` / `npm run test:db` + `tests/errors.test.ts` (25 tests ✓).
- **`docs/FORMULARIOS.md`** — convención obligatoria para formularios nuevos.

### Changed — Server Actions y formularios migrados al nuevo patrón
- Server Actions: `menu.ts` (todo), `locals.ts`, `staff.ts` (+invite),
  `reservations.ts`, `discounts.ts` (+descuento manual valida monto),
  `setup.ts`, `order.ts` (mensajes de transición legibles) y
  `checkout/actions.ts` (mensaje público genérico, nunca el crudo de la DB).
- Formularios: `AdminMenuCategories`, `AdminMenuProducts`, `AdminStaff`,
  `AdminLocals`, `AdminDiscounts`, `AdminModifierGroups` (modal de opciones
  en lugar de `prompt()`), `AdminReservations` (usa `ReservationForm`,
  sin duplicado muerto ni errores silenciados), `ReservationForm` (sin
  `alert`), `SetupForm` (fieldErrors del server), `CashierView` (toUserMessage).
- Zod numérico con `zNumberES` en: producto (precio/orden), grupos/opciones
  (min/max/impacto), local (IVA/envío), reserva (comensales), setup.

### Validación
- `npx tsc --noEmit` → 0 errores · `npm run test` → 25/25 ✓.

## [0.2.6] — 2026-09-19

### Fixed — 500 en `createLocal`/`updateLocal` + menú vacío + tokens de reparto
- **`locals` sin `created_by`/`updated_by`**: `createLocal`/`updateLocal` insertaban
  columnas inexistentes → `PGRST204` → 500 en `POST /staff/admin`. Eliminadas del
  payload (la tabla raíz no lleva auditoría: dependencia circular `locals↔staff`).
- **Menú público ya no se vacía por un fallo parcial**: `getMenu()` usa
  `Promise.allSettled` con log por tabla; un fallo en modificadores no esconde
  categorías/productos. Script `scripts/check-seed.mjs [slug]` ampliado a
  diagnóstico admin-vs-público (categorías inactivas, huérfanos, `is_available`,
  errores RLS por tabla).
- **Disponibilidad real**: `useProductAvailability` marcaba como disponible todo
  producto sin dato (`?? true`); como la policy pública oculta los agotados al
  anónimo, lo agotado parecía disponible. Ahora: sin dato + sin cargar → `true`;
  sin dato + ya cargado → `false`.
- **Tokens de reparto**: `.eq('used_at', null)` → `.is('used_at', null)` (y
  `revoked_at`) en `markOrderAsDeliveredByToken`/`getOrderByPlainToken`; con
  `eq null` PostgREST nunca matcheaba → “Token inválido” permanente. Eliminado
  bloque duplicado en `markOrderAsDeliveredByToken`.

### Validación
- `npx tsc --noEmit` → 0 errores.

## [0.2.5] — 2026-09-19

### Fixed — 500 en `createProduct`/`updateProduct` (columnas inexistentes)
- **Causa**: `ProductSchema` incluye `allergens`/`diet_labels`, pero `products`
  no tiene esas columnas — viven en las tablas puente `product_allergens` /
  `product_diet_labels`. El insert/update mandaba keys extra → 500.
- **`createProduct`/`updateProduct`**: separan `allergens`/`diet_labels` del
  insert/update y los persisten en los puentes (nombre → `id` de `allergens` /
  `diet_labels`, reemplazo total en update). Validan que la `category_id`
  pertenezca al `location_id` del staff.
- **`listProducts`**: enriquece cada producto con `allergens: string[]` /
  `diet_labels: string[]` desde los puentes, para que el admin/menú los muestren.

### Validación
- `npx tsc --noEmit` → 0 errores.

## [0.2.4] — 2026-09-19

### Fixed — Productos/categorías en admin (`PGRST200` + `Promise.all`)
- **500 en `listProducts`/`listModifierGroups`**: los embeds usaban `options(...)`
  pero la tabla real es `modifier_options` (PostgREST: `Could not find a relationship
  between 'modifier_groups' and 'options'`). Ahora se usa alias
  `options:modifier_options(...)` para mantener `ModifierGroup.options` intacto.
  Toca `listProducts`, `listModifierGroups`, `createModifierGroup`,
  `updateModifierGroup` + el espejo en `tests/db-verify.test.ts`.
- **Categorías vacías al crear producto**: `AdminMenuProducts.loadData()` usaba
  `Promise.all([listProducts(), listCategories()])` — si productos fallaba, se
  descartaba también la respuesta OK de categorías. Ahora `Promise.allSettled`
  con toasts independientes: cada lista se muestra aunque la otra falle.
- **`location_id` NOT NULL**: `createModifierGroup`/`createModifierOption` ahora
  insertan `location_id: staff.location_id` (antes violaban el NOT NULL).

### Validación
- `npx tsc --noEmit` → 0 errores.

## [0.2.3] — 2026-09-19

### Changed — Imagen opcional y sin huérfanos en Storage
- **Imagen explícitamente opcional**: etiquetas "Imagen (opcional)" + hint
  "Puedes guardar sin imagen" en los forms de productos y categorías. Verificado:
  `""`/`"   "`/`null`/`undefined` parsean; URLs inválidas siguen rechazadas; insert
  real en `categories` con `image_url: null` en la DB + limpieza de la fila de prueba.
- **Sin huérfanos**: `deleteCategory`/`deleteProduct` leen `image_url` antes de borrar
  y eliminan el archivo del bucket con `deleteMenuImage` (best-effort, no bloquea el delete).

### Validación
- `npx tsc --noEmit` → 0 errores; `npm run build` → OK.

## [0.2.2] — 2026-09-19

### Added — Imágenes del menú en Supabase Storage
- **Bucket `menu-images` creado en el proyecto activo** (public, 5MB, jpeg/png/webp)
  vía Storage API: `scripts/setup-menu-images-bucket.mjs` (idempotente). Referencia SQL
  en `docs/storage-menu-images.sql` (no hace falta ejecutarla). Estructura de archivos:
  `{location_id}/categories|products/{uuid}.{ext}`.
- **Categorías con upload**: reemplazado el input manual "URL de Imagen" por el mismo
  flujo de productos — file picker → `uploadMenuImage(file, 'categories')` → la URL
  pública queda en `image_url`. Preview + botón "Quitar" + botón "Reemplazar".
- **Ciclo de vida** (productos y categorías): al reemplazar o quitar imagen se elimina
  la anterior del bucket con `deleteMenuImage` (best-effort, no bloquea el guardado).
- **Menú público**: `MenuClient` ahora muestra la foto del producto (aspect 4:3,
  lazy-load) y el thumbnail de la categoría junto a su título.

### Fixed
- **500 en createCategory/updateCategory/updateProduct**: el form enviaba
  `image_url: ""` (campo vacío) y `z.string().url()` lo rechazaba. Nuevo
  `imageUrlSchema` con `z.preprocess`: `""` → `null`; valores no vacíos siguen
  validando como URL. Aplica a `CategorySchema` y `ProductSchema`.

### Validación
- `npx tsc --noEmit` → 0 errores; `npm run build` → OK.
- Prueba end-to-end contra el bucket real (`scripts/test-menu-images-bucket.mjs`):
  upload OK → lectura pública HTTP 200 → remove OK.
- No se requieren policies de storage: los uploads salen del server con service role
  (salta RLS) y la lectura es pública por bucket público.

## [0.2.1] — 2026-09-19

### Added — Contraseña en el registro y recuperación
- **Setup con contraseña**: `initializeSystem` crea el admin con
  `auth.admin.createUser({ email, password, email_confirm: true })` — la cuenta queda
  activa al instante, sin depender del magic link. `SetupForm` agrega
  "Contraseña" y "Confirmar contraseña" (mín. 8, validación cliente + Zod con refine
  de igualdad en server). Pantalla de éxito actualizada y redirect a `/login`.
- **Invitación de staff con contraseña opcional**: `InviteStaffSchema` gana `password`
  (opcional, mín. 8). Si se define → usuario creado activo con esa contraseña;
  si se deja vacía → se mantiene el magic link por email. `AdminStaff` muestra el
  campo con la explicación de ambos modos y el toast informa el modo usado.
- **Recuperar contraseña**:
  - Nueva ruta `/recuperar`: formulario de email → `resetPasswordForEmail` con
    redirect a `/staff/auth/callback?next=/recuperar/nueva` (reutiliza el callback
    PKCE existente, sin tocarlo).
  - Nueva ruta `/recuperar/nueva`: define la nueva contraseña vía `auth.updateUser`
    usando la sesión que crea el enlace de recovery; si no hay sesión → redirect a
    `/login?error=recovery_expired`. Acciones en `src/lib/server/auth-recovery.ts`
    (respuesta genérica para no filtrar existencia de cuentas).
  - Login: enlace "¿Olvidaste tu contraseña?" → `/recuperar`.
- **Fixed**: el setup redirigía a `/staff/login` (ruta inexistente) → ahora `/login`.

### Validación
- `npx tsc --noEmit` → 0 errores; `npm run build` → OK
  (rutas nuevas: `/recuperar` estática, `/recuperar/nueva` dinámica).
- Smoke test: `/recuperar` 200 con formulario, `/login` 200 con enlace de recuperación,
  `/recuperar/nueva` sin sesión redirige a login.

## [0.2.0] — 2026-09-19

### ⚠️ Requirre acción manual (una vez, por proyecto/DB)
Ejecutar `docs/migrate-subdomain-to-slug.sql` en **Supabase → SQL Editor** (como postgres).
Es idempotente: renombra `locals.subdomain` → `locals.slug` y normaliza el valor legacy
de dev (`'localhost'` → `'demo'`). Verificar con: `node --env-file=.env scripts/migrate-subdomain-to-slug.mjs`.
Hasta ejecutar la migración, el menú público responde 404 (graceful) y los tests de DB fallan.

### Changed — Locations por PATH, no por subdominios
- **Modelo**: 1 restaurante = 1 dominio propio (su propio deployment/DB). El dominio es
  irrelevante para la app; cada **sucursal (location)** se identifica por su **ruta**:
  `tudominio.com/{slug}`. Cero config: sin env vars de dominio ni wildcard DNS.
  `next.config.ts` queda intacto.
- **Rutas (App Router)**:
  - `src/app/(landing)/` → `src/app/[location]/` (menú resuelto por `params`, `notFound()` si el slug no existe).
  - `/checkout` de raíz → `src/app/[location]/checkout/` (server wrapper + `CheckoutClient`, sin `window.location.hostname`).
  - Nueva `src/app/page.tsx`: índice de sucursales; redirect a `/{slug}` si solo hay una; enlace a `/setup` si no hay.
- **Resolución**: `getLocalByHost()` (parseaba el header `host`) → `getLocalBySlug(slug)`;
  `LocalInfo.subdomain` → `slug`; nuevo `listLocalSummaries()` para el índice.
- **Checkout**: `createOrder` ya no deriva la location del header `host`; recibe
  `location_id` y lo **revalida server-side** contra la DB (`getLocalById`).
- **DB/docs**: `locals.subdomain` → `locals.slug` en `schema.sql`, `install.sql`,
  `seed.sql` (seed demo: `'localhost'` → `'demo'`, ruta `/demo`) + migración idempotente
  `docs/migrate-subdomain-to-slug.sql` + `scripts/migrate-subdomain-to-slug.mjs`.
- **UI Setup/Admin**: campo "Subdominio" → "Ruta (sucursal)" con hint
  `tudominio.com/{slug}` (SetupForm, AdminLocals, AdminView).
- **Slugs**: nueva `src/lib/slugs.ts` — `validateLocationSlug()` + `locationSlugSchema`
  (Zod compartido) con rutas reservadas del sistema: `api|staff|login|setup|track|checkout`.
- **staff/page.tsx**: `getCurrentStaff` selecciona `slug` (y `created_at/updated_at`),
  garantía de no-null para los consumidores (caja/kds/admin).

### Fixed (pre-existentes, necesarios para compilar)
- `src/lib/types.ts`: definidos los tipos compartidos que faltaban y que muchos módulos
  ya importaban (`Product`, `Category`, `ModifierGroup`, `ModifierOption`,
  `CartItemModifiers`, `Cart`, `CartItem`, `Order`, `Discount`, enums `OrderType`,
  `PaymentMethod`, `OrderStatus`, `PaymentStatus`, `ReservationStatus`, `Zone`, etc.).
- `staff/page.tsx`: guard de `staff` posiblemente nulo (propagaba TS18047 a caja/kds/admin).
- `lib/server/staff.ts`: `listStaff` incluye `created_by`/`updated_by` (faltaban para `Staff`).
- `lib/server/locals.ts`: guard de `currentLocal` posiblemente nulo en `deleteLocal`.
- `tests/db-verify.test.ts`: eliminada la dependencia de `dotenv` (no instalada; carga
  mínima de `.env` con `node:fs`); select con `name` donde se usa.

### Validación
- `npx tsc --noEmit` → 0 errores (antes: 40+).
- `npm run build` → OK. Rutas: `/`, `/[location]`, `/[location]/checkout`, `/track/[token]`, `/staff/*`, `/api/*`.
- Smoke test (`next start`): `/` 200; `/{slug}` 404 graceful mientras la DB no esté migrada; `/staff/admin` 307 → login.

## [0.1.0]
- Scaffold inicial multi-tenant con resolución por subdominio (reemplazada en 0.2.0).