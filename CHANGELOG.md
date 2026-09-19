# Changelog

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