# TODO - Restaurant Order JLDev

**Generado**: 2025-09-17 · Este documento es la fuente de estado del proyecto
(sustituye a `PLAN.md`, eliminado en v0.5.4).
**Total**: 47 tareas · ~253h estimadas

---

## 1. Frontend Público — Pendientes Menores (13h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 1 | Leyenda "IVA incluido" visible en menú y checkout (Req. legal México LFPC Art. 76 Bis). Badge en `MenuClient.tsx` y `CheckoutPage.tsx`. | ✅ Completado | 1h |
| 2 | Validación de stock/disponibilidad en tiempo real. Hook que consulte `products.is_available` vía Realtime antes de confirmar. | ✅ Completado | 4h |
| 3 | Mejora UX carrito (modificadores en UI). Selector de grupos/opciones en `AddToCartButton`. | ✅ Completado | 8h |

---

## 2. Panel de Admin — Módulos Críticos (Prioridad Alta)

### 2.1 Gestión de Menú — CRUD Completo (40h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 4 | `AdminMenuCategories.tsx` — Listar/crear/editar/eliminar categorías. Tabla con drag-and-drop para `sort_order`, toggle `is_active`. | ✅ Completado | 6h |
| 5 | `AdminMenuProducts.tsx` — CRUD productos. Formulario modal: nombre, descripción, precio, imagen (upload Supabase Storage), categoría, disponibilidad, alérgenos (multi-select), etiquetas dietarias (multi-select), grupos de modificadores anidados. | ✅ Completado | 12h |
| 6 | `AdminModifierGroups.tsx` — Gestión de modificadores por producto. Builder visual: grupos requeridos/opcionales, min/max selecciones, opciones con impacto de precio. | ✅ Completado | 8h |
| 7 | Server Actions CRUD: `createCategory`, `updateCategory`, `deleteCategory`, `createProduct`, `updateProduct`, `deleteProduct`, `createModifierGroup`, `updateModifierGroup`, `createModifierOption`, `updateModifierOption`. Validación Zod, `revalidatePath`, manejo de imágenes. | ✅ Completado | 10h |
| 8 | API upload a Supabase Storage (bucket `menu-images`). Políticas RLS por `location_id`. | ✅ Completado | 4h |

### 2.2 Motor de Promociones — Engine Completo (34h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 9 | `AdminDiscounts.tsx` — UI lista/crear/editar descuentos. Formulario complejo: tipo (código/auto), valor (%/fijo), mínimo compra, alcance (productos/categorías), ventana temporal, días/horas, límites de uso, stacking. | ✅ Completado | 10h |
| 10 | Lógica de aplicación en checkout (`applyDiscounts`). Server action que evalúa reglas, prioridad (código > automática > manual), no-apilar, registra en `discount_usages`. | ✅ Completado | 8h |
| 11 | Integración en `CheckoutForm` — campo código promocional. Input + botón "Aplicar", muestra descuento en resumen, valida contra server action. | ✅ Completado | 4h |
| 12 | Descuento manual (staff en caja). Botón en `CashierView` solo para ADMIN/CAJERO, modal con motivo, no apila con otras promos. | ✅ Completado | 6h |
| 13 | Tests unitarios del engine. Casos: 2x1, % categoría, código único, límites uso/día/cliente, ventanas temporales, no-stacking. ✅ `tests/domain.test.ts`: 14 tests del engine (no-stacking código>auto, case-insensitive, % subtotal y por producto, fijo limitado al subtotal, min purchase, ventana temporal, día de semana, límites total/cliente/día, inactiva, mejor auto). | ✅ Completado | 6h |

### 2.3 Gestión de Reservas (36h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
|| 14 | `AdminReservations.tsx` — Calendario mensual/semanal. Vista con franjas, aforo por zona (`local_zone_capacity`), indicador de disponibilidad. | ✅ Completado | 12h |
|| 15 | `ReservationForm.tsx` — Crear/editar reserva. Titular, teléfono, fecha/hora, comensales, zona preferida, notas, estado depósito. | ✅ Completado | 8h |
|| 16 | Recordatorios (WhatsApp/email) — Job cron (Supabase pg_cron o Vercel Cron) 24h y 2h antes. Plantilla en `notifications/email/`. | ✅ Completado | 6h |
|| 17 | Lista del día en dashboard admin. Tarjetas con hora, zona, comensales, estado depósito, acciones (confirmar, cancelar, marcar depositado). | ✅ Completado | 4h |
|| 18 | Server Actions CRUD reservas. Validación de aforo, conflictos de horario, depósito. | ✅ Completado | 6h |

### 2.4 Reportes y Estadísticas (26h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 19 | `AdminReports.tsx` — Dashboard con KPIs. Ventas día/semana/mes, ticket promedio, productos top, pedidos por estado, método de pago, tipo orden. | ⬜ Pendiente | 10h |
| 20 | Gráficas. ✅ Barras de ingresos por día (pure CSS/SVG, sin dependencias) en `AdminReports.tsx`; desglose top productos/tipo/pago ya existente. | ✅ Completado | 6h |
| 21 | Export CSV/PDF. ✅ CSV por rango (existente, migrado a `useServerForm`); PDF queda diferido — sin dependencia extra por decisión de mínimos. | 🔄 En progreso | 4h |
| 22 | Cierre de caja diario. ✅ Sección "Cierre de Caja" en `AdminReports` sobre `getCashRegisterData`: efectivo/tarjeta esperado + detalle por pedido, por fecha. | ✅ Completado | 6h |

### 2.5 Gestión de Staff (10h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 23 | `AdminStaff.tsx` — Tabla staff del local. Solo ADMIN ve/crea/edita/desactiva. Formulario: email, nombre, rol, activo. | ⬜ Pendiente | 6h |
| 24 | Invitation flow (magic link para nuevo staff). Server action que inserta en `staff` + envía magic link vía Supabase Auth Admin API. | ⬜ Pendiente | 4h |

### 2.6 Configuración del Local — Settings (8h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 25 | `AdminSettings.tsx` — Formulario único. ✅ Timezone/IVA/envío se editan en `AdminLocals`; capacidad por zona en el nuevo `ZoneCapacityEditor` (mounted en tab Locales). Tiempo prep por defecto: requiere columna nueva — diferido. | ✅ Completado | 6h |
| 26 | Server Action `updateLocalSettings`. ✅ `updateLocal` (locals) + `upsertZoneCapacity` (local_zone_capacity, upsert por PK location_id+zone, 0 elimina). | ✅ Completado | 2h |

---

## 3. Repartidor y Tracking (16h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 27 | Asignación de repartidor en orden (campo `driver_id`). ✅ Sin depender de roles (decisión del dueño): cualquier staff del local puede asignarse. Server action `assignDriver` + selector en `CashierView`. Incluido de forma nativa en `docs/install.sql`. | ✅ Completado | 4h |
| 28 | Vista track repartidor mejorada. ✅ Base existente (`/track/repartidor/[token]`); añade regeneración/revocación del link desde caja (`regenerateDeliveryToken`). Mapa Leaflet diferido (decisión pendiente). | 🔄 En progreso | 6h |
| 29 | Notificación push/email a repartidor al asignar. webhook a servicio externo. | ⬜ Pendiente | 4h |
| 30 | Rol `REPARTIDOR` en schema y RLS. ❌ Fuera de alcance por decisión del dueño: el auth de staff funciona sin roles y no se toca. | ❌ Cancelado | 2h |

---

## 4. Datos y Seguridad (58h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 31 | Auditoría RLS completa. ✅ `docs/rls-audit.md`: lo verificado (GUC por policy, vista security_invoker, tokens hash-only), hallazgos abiertos (policies públicas sin location_id — impacto bajo en modelo 1-DB-por-restaurante; auto-creación de staff — decisión del dueño) y checklist operativo con `scripts/check-seed.mjs`. | ✅ Completado | 8h |
| 32 | Error handling centralizado. ✅ `lib/errors.ts` (`AppError`, `parsePostgrestError` PG/PGRST→ES, `toUserMessage` anti-crudo, `parseOrThrow`, `queryOrThrow`) + `useServerForm` + `FormAlert/FieldError` migrados a TODAS las Server Actions y formularios. Convención: `docs/FORMULARIOS.md`. | ✅ Completado | 6h |
| 33 | Logging estructurado. ✅ `lib/logger.ts` (niveles, scopes anidados, JSON en prod / legible en dev) conectado en los cron routes; el resto de módulos usa `console.error` con acción prefijada. requestId de middleware diferido. | ✅ Completado | 4h |
|| 34 | Tests unitarios (Vitest). ✅ 53 tests: `errors.test.ts` (25) + `domain.test.ts` (28: engine promos, tokens, pricing/IVA, validation, slugs). Scripts `npm run test` / `test:db`. | ✅ Completado | 20h |
| 35 | Tests de integración (Playwright). Flujos: checkout completo, auth staff, KDS realtime, cashier transitions, admin CRUD menú, aplicación promo. | ⬜ Pendiente | 16h |
| 36 | Seed de datos realista para tests. ✅ `scripts/seed-test-data.mjs [slug] [n]`: órdenes de test (estados/tipos/pagos variados, últimos 7 días) para ejercitar Reportes/Cierre de Caja; idempotente (limpia las `test-seed` previas). | ✅ Completado | 4h |

---

## 5. Infraestructura y Despliegue (12h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 37 | Documentar variables de entorno (`.env.example` completo). ✅ `.env.example` ampliado: `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` (+ doc de uso), `WHATSAPP_WEBHOOK_URL`, `SENTRY_DSN`, alias de nomenclatura Supabase. | ✅ Completado | 2h |
| 38 | Guía de despliegue Vercel + Supabase. ✅ `docs/DEPLOY.md`: install.sql consolidado, Storage bucket, env vars, Vercel Cron + pg_cron con `CRON_SECRET`, setup inicial, monitoreo con `/api/health`, tests. | ✅ Completado | 4h |
| 39 | Configurar Vercel Analytics / Speed Insights. `next.config.ts` + env vars. | ❌ Cancelado | 1h |
| 40 | Alertas de caída (UptimeRobot / Better Uptime). ✅ Health check `/api/health` implementado (env vars + ping a Supabase, 503 si algo falla). Apuntar el uptime monitor ahí queda del lado de infra externa. | ✅ Completado | 2h |
| 41 | Métricas de uso (PostHog o Plausible). Eventos: `order_created`, `order_completed`, `promo_applied`, `reservation_created`. | ❌ Cancelado | 3h |

---

## 6. Decisiones Técnicas Pendientes (Requieren Confirmación)

| # | Decisión | Estado | Impacto |
|---|----------|--------|---------|
| 42 | **Imágenes de productos**: Supabase Storage (gratis 1GB) | ✅ Confirmado | Implementado en Admin Menú |
| 43 | **Notificaciones WhatsApp**: Webhook externo | ✅ Confirmado | Implementado en reminders |
| 44 | **Mapa repartidor**: ¿Leaflet + OSM (gratis, self-hosted tiles) o Mapbox (pago, mejor UX)? | ⬜ Pendiente | Afecta vista track repartidor |
| 45 | **Gráficas**:  Chart.js + wrapper  | ⬜ Pendiente | Afecta Admin Reportes |
| 46 | **Tests E2E**: Playwright (recomendado) | ⬜ Pendiente | Afecta infra testing |
| 47 | **Monitoreo errores**: ¿Sentry (gratis 5k eventos/mes) o solo logs Vercel + Supabase? | ❌ Cancelado | Afecta error handling |

---

## 7. Resumen por Fases (Actualizado — post 0.5.0)

| Fase | Estado | Prioridad | Entregable |
|------|--------|-----------|------------|
| **Fase 1: Admin Core** (Menú + Promos) | ✅ Completado | **Crítica** | CRUD Menú, Motor de Promos + tests del engine |
| **Fase 2: Reservas** | ✅ Completado | **Alta** | Gestión de mesas y calendario + recordatorios cron (con CRON_SECRET) |
| **Fase 3: Reportes + Staff + Settings** | ✅ Completado | **Alta** | KPIs + gráfica ingresos + Cierre de Caja + Staff + Aforo por zona |
| **Fase 4: Repartidor** | ✅ Completado | **Media** | Asignación + link un solo uso (consolidado en `docs/install.sql`); mapa/notificación diferidos |
| **Fase 5: Calidad + Infra** | 🔄 Casi listo | **Alta** | 53 unit tests, esquema SQL limpio y consolidado (`docs/install.sql`), auditoría RLS, logger, errors centralizados, DEPLOY.md, /api/health; falta Playwright (35) |

---

## 8. Nuevo Plan de Ejecución (Pendientes)

### Cerrado (v0.2.6 → v0.5.0)
- Error 500/PGRST saneado en todos los formularios (`lib/errors.ts`, `useServerForm`, `docs/FORMULARIOS.md`).
- Menú resiliente (`getMenu` allSettled) + fix disponibilidad RLS + script diagnóstico `check-seed.mjs`.
- Aforo por zona, gráfica de ingresos, Cierre de Caja, asignación de repartidor + link un solo uso.
- 53 unit tests, auditoría RLS documentada, `lib/logger.ts`, `/api/health`, `CRON_SECRET`, `DEPLOY.md`.

### Pendiente real
- **Tarea 35**: Playwright E2E (checkout, auth staff, KDS realtime, CRUD menú).
- **Tarea 21 (PDF)**: export PDF de reportes (decidir lib: jsPDF vs server-side).
- **Tarea 28 (mapa)**: Leaflet+OSM vs Mapbox en track de repartidor.
- **Tarea 29**: notificación al repartidor al asignar (webhook).
- `locals.prep_minutes` (tiempo prep por defecto) — requiere columna nueva.
- Endurecer policies públicas por `location_id` si una DB aloja varios restaurantes (ver `docs/rls-audit.md`).


---

## Leyenda
- ⬜ **Pendiente** — No iniciado
- 🔄 **En progreso** — En desarrollo
- ✅ **Completado** — Verificado y funcionando
- ❌ **Cancelado** — Descartado o bloqueado