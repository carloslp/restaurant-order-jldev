# Changelog

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