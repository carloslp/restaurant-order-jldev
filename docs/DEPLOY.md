# Guía de despliegue — Vercel + Supabase

**Modelo**: 1 restaurante = 1 dominio propio (con su propio deployment y su propia DB de Supabase). El dominio es irrelevante para la app; cada sucursal se identifica por su ruta `/{slug}`.

---

## 1. Preparar Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com) (región cercana a tu restaurante).
2. **SQL Editor** → pega y ejecuta `docs/install.sql` (único SQL de instalación:
   extensiones → tipos → tablas → triggers → RLS + policies → índices → vistas → pg_cron).
   - Deja la base **vacía**: al abrir la app, `/setup` arranca el onboarding
     (crea el primer local + admin). No ejecutes seeds en producción.
   - ¿Proyecto ya existente con datos? Aplica las migraciones incrementales:
     `docs/migration-link-auth-staff.sql` (idempotente). La migración
     subdominio→slug ya está incluida dentro de `install.sql`.
3. **Authentication → Providers**: deja habilitado **Email** (magic link + contraseña).
   En **URL Configuration** añade tu dominio a *Site URL* y *Redirect URLs*:
   `https://tudominio.com/staff/auth/callback`, `https://tudominio.com/auth/confirm`,
   `https://tudominio.com/`.
4. Copia de **Settings → API**: Project URL, `publishable/anon key`, `service_role key`.

## 2. Preparar Storage (imágenes del menú)

```bash
node --env-file=.env scripts/setup-menu-images-bucket.mjs
```
Crea el bucket público `menu-images` (5MB, jpeg/png/webp) de forma idempotente.
Referencia SQL en `docs/storage-menu-images.sql` (no hace falta ejecutarla).

## 3. Variables de entorno

Copia `.env.example` → `.env.local` (desarrollo) y configúralas en Vercel (producción):

| Var | Requerida | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_URL` | ✅ | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Cliente público (respeta RLS) |
| `SUPABASE_SECRET_KEY` | ✅ | Server actions (salta RLS) — NUNCA al cliente |
| `NEXT_PUBLIC_APP_URL` | ✅ | Magic links / invitaciones (`https://tudominio.com`) |
| `CRON_SECRET` | ✅ prod | Protege `/api/cron/*` |
| `WHATSAPP_WEBHOOK_URL` | opcional | Recordatorios WhatsApp |
| `SENTRY_DSN` | opcional | Error tracking |

⚠️ **`SUPABASE_SECRET_KEY` solo en el servidor** (Vercel env vars; nunca `NEXT_PUBLIC_`).

## 4. Desplegar en Vercel

1. Importa el repo en Vercel → Framework: Next.js (cero config extra).
2. Añade las env vars del paso 3 (Production + Preview).
3. Deploy. Verifica el smoke test:
   - `https://tudominio.com/` → índice de sucursales (o redirect si hay una sola)
   - `https://tudominio.com/{slug}` → menú público
   - `https://tudominio.com/api/health` → `{"status":"ok"}`
   - `https://tudominio.com/staff/admin` → redirige a `/login`

## 5. Crons de recordatorios (reservas)

Opción A — **Vercel Cron**: añade a `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reminders/24h", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/reminders/2h", "schedule": "*/15 * * * *" }
  ]
}
```
Vercel manda `Authorization: Bearer ${CRON_SECRET}` automáticamente.

Opción B — **pg_cron en Supabase**: ver `docs/pg_cron_reminders.sql`
(llama al endpoint con `?secret=...` cada 15 min).

## 6. Primer arranque (setup)

1. Abre `https://tudominio.com/setup` → crea el local (ruta/slug, IVA, envío) + admin.
2. Login en `/login` → panel `/staff/admin`.
3. Carga el menú (Menú → categorías y productos) y configura el aforo
   (Locales → *Aforo por zona*).

## 7. Monitoreo y mantenimiento

- **Health check**: `GET /api/health` (env vars + ping a Supabase) — apunta ahí tu
  uptime monitor (UptimeRobot/Better Uptime).
- **Migraciones**: solo *additive* en producción; ejecuta SQL en el editor y
  documenta en `docs/`. `supabase db push` solo en dev/staging.
- **Verificación de datos**: tras cada cambio de schema,
  `node --env-file=.env scripts/check-seed.mjs [slug]` (diagnóstico admin vs menú público).

## 8. Tests

```bash
npm run test      # unit (errors, catálogo español) — sin DB
npm run test:db   # integración contra la DB real (requiere .env)
```
