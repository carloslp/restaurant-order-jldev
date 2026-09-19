# TODO - Restaurant Order JLDev

**Fuente**: `PLAN.md` — Generado 2025-09-17
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
| 13 | Tests unitarios del engine. Casos: 2x1, % categoría, código único, límites uso/día/cliente, ventanas temporales, no-stacking. | ⬜ Pendiente | 6h |

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
| 20 | Gráficas (Recharts o Chart.js). Serie temporal ventas, barras top productos, dona por tipo de orden. | ⬜ Pendiente | 6h |
| 21 | Export CSV/PDF. Botones de descarga por rango de fechas. | ⬜ Pendiente | 4h |
| 22 | Cierre de caja diario. Resumen por turno, diferencial efectivo vs esperado, firma digital cajero. | ⬜ Pendiente | 6h |

### 2.5 Gestión de Staff (10h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 23 | `AdminStaff.tsx` — Tabla staff del local. Solo ADMIN ve/crea/edita/desactiva. Formulario: email, nombre, rol, activo. | ⬜ Pendiente | 6h |
| 24 | Invitation flow (magic link para nuevo staff). Server action que inserta en `staff` + envía magic link vía Supabase Auth Admin API. | ⬜ Pendiente | 4h |

### 2.6 Configuración del Local — Settings (8h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 25 | `AdminSettings.tsx` — Formulario único. Timezone (selector IANA), IVA rate (input % validación 0-1), costo envío base, capacidad por zona (editor `local_zone_capacity`), tiempo estimado prep por defecto. | ⬜ Pendiente | 6h |
| 26 | Server Action `updateLocalSettings`. Valida y actualiza `locals` + `local_zone_capacity`. | ⬜ Pendiente | 2h |

---

## 3. Repartidor y Tracking (16h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 27 | Asignación de repartidor en orden (campo `driver_id`). FK a `staff` con role='REPARTIDOR' (nuevo rol). UI en `CashierView` y `AdminView` para asignar. | ⬜ Pendiente | 4h |
| 28 | Vista track repartidor mejorada. Lista de pedidos asignados, filtro por estado, mapa simple (Leaflet/OSM) con dirección, botón "Llegué" → "Entregado". | ⬜ Pendiente | 6h |
| 29 | Notificación push/email a repartidor al asignar. webhook a servicio externo. | ⬜ Pendiente | 4h |
| 30 | Rol `REPARTIDOR` en schema y RLS. Añadir a enum `staff.role`, policy `staff_staff_access`, navegación en `StaffNav`. | ⬜ Pendiente | 2h |

---

## 4. Datos y Seguridad (58h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 31 | Auditoría RLS completa. Revisar cada policy contra amenazas: escalada de privilegio, enumeración cross-tenant, fuga de PII. Probar con `supabase.test` helpers. | ⬜ Pendiente | 8h |
| 32 | Error handling centralizado. ✅ `lib/errors.ts` (`AppError`, `parsePostgrestError` PG/PGRST→ES, `toUserMessage` anti-crudo, `parseOrThrow`, `queryOrThrow`) + `useServerForm` + `FormAlert/FieldError` migrados a TODAS las Server Actions y formularios. Convención: `docs/FORMULARIOS.md`. | ✅ Completado | 6h |
| 33 | Logging estructurado. `lib/logger.ts` con niveles, contexto (requestId, userId, locationId). Middleware que inyecta requestId. | ⬜ Pendiente | 4h |
|| 34 | Tests unitarios (Vitest). ✅ Infra: `vitest.config.ts` (alias `@`, excluye db-verify) + `npm run test` / `test:db` + `tests/errors.test.ts` (25 tests del catálogo de errores y `zNumberES`). Faltan: pricing, tokens, promos, transiciones, IVA. | 🔄 En progreso | 20h |
| 35 | Tests de integración (Playwright). Flujos: checkout completo, auth staff, KDS realtime, cashier transitions, admin CRUD menú, aplicación promo. | ⬜ Pendiente | 16h |
| 36 | Seed de datos realista para tests. `scripts/seed-test-data.ts` usando service role. | ⬜ Pendiente | 4h |

---

## 5. Infraestructura y Despliegue (12h)

| # | Tarea | Estado | Esfuerzo |
|---|-------|--------|----------|
| 37 | Documentar variables de entorno (`.env.example` completo). Añadir: `NEXT_PUBLIC_APP_URL`, `SUPABASE_STORAGE_BUCKET`, `CRON_SECRET`, `SENTRY_DSN`, `WHATSAPP_API_TOKEN`. | ⬜ Pendiente | 2h |
| 38 | Guía de despliegue Vercel + Supabase. `docs/DEPLOY.md`: pasos CLI, variables en Vercel, migraciones (`supabase db push`), Storage buckets, Realtime habilitado, pg_cron para jobs. | ⬜ Pendiente | 4h |
| 39 | Configurar Vercel Analytics / Speed Insights. `next.config.ts` + env vars. | ❌ Cancelado | 1h |
| 40 | Alertas de caída (UptimeRobot / Better Uptime). Health check endpoint `/api/health` que verifica Supabase. | ❌ Cancelado | 2h |
| 41 | Métricas de uso (PostHog o Plausible). Eventos: `order_created`, `order_completed`, `promo_applied`, `reservation_created`. | ❌ Cancelado | 3h |

---

## 6. Decisiones Técnicas Pendientes (Requieren Confirmación)

| # | Decisión | Estado | Impacto |
|---|----------|--------|---------|
|| 42 | **Imágenes de productos**: Supabase Storage (gratis 1GB) | ✅ Confirmado | Implementado en Admin Menú |
|| 43 | **Notificaciones WhatsApp**: Webhook externo | ✅ Confirmado | Implementado en reminders |
| 44 | **Mapa repartidor**: ¿Leaflet + OSM (gratis, self-hosted tiles) o Mapbox (pago, mejor UX)? | ⬜ Pendiente | Afecta vista track repartidor |
| 45 | **Gráficas**:  Chart.js + wrapper  | ⬜ Pendiente | Afecta Admin Reportes |
| 46 | **Tests E2E**: Playwright (recomendado) | ⬜ Pendiente | Afecta infra testing |
| 47 | **Monitoreo errores**: ¿Sentry (gratis 5k eventos/mes) o solo logs Vercel + Supabase? | ❌ Cancelado | Afecta error handling |

---

## 7. Resumen por Fases (Actualizado)

| Fase | Estado | Prioridad | Entregable |
|------|--------|-----------|------------|
| **Fase 1: Admin Core** (Menú + Promos) | 🔄 Casi listo | **Crítica** | CRUD Menú y Motor de Promos |
| **Fase 2: Reservas** | ✅ Completado | **Alta** | Gestión de mesas y calendario |
| **Fase 3: Reportes + Staff + Settings** | ⬜ Pendiente | **Alta** | KPIs, Gestión de Equipo y Config Local |
| **Fase 4: Repartidor** | ⬜ Pendiente | **Media** | Flujo delivery completo |
| **Fase 5: Calidad + Infra** | ⬜ Pendiente | **Alta** | Tests, Auditoría RLS y Docs |

---

## 8. Nuevo Plan de Ejecución (Pendientes)

### Sprint A: Cierre de Admin Core & Reportes
- **Tarea 13**: Tests unitarios del engine de promociones.
- **Tarea 19-22**: Módulo de Reportes y Cierre de Caja (`AdminReports.tsx` + Gráficas).
- **Tarea 25-26**: Configuración del Local (`AdminSettings.tsx`).

### Sprint B: Staff & Delivery Flow
- **Tarea 23-24**: Gestión de Staff e Invitaciones (`AdminStaff.tsx`).
- **Tarea 27-30**: Rol Repartidor, Asignación y Vista de Tracking.

### Sprint C: Hardening & Deployment
- **Tarea 31-33**: Auditoría RLS, Error Handling y Logging.
- **Tarea 34-36**: Implementación de Vitest y Playwright (Tests E2E).
- **Tarea 37-38**: Documentación final y Guía de Despliegue.

---

## 9. Próximos Pasos Inmediatos

1. Implementar `AdminReports.tsx` para dar visibilidad de ventas.
2. Crear `AdminSettings.tsx` para parametrizar el local (IVA, Zonas).
3. Desarrollar `AdminStaff.tsx` para gestionar el equipo.

---

## Leyenda
- ⬜ **Pendiente** — No iniciado
- 🔄 **En progreso** — En desarrollo
- ✅ **Completado** — Verificado y funcionando
- ❌ **Cancelado** — Descartado o bloqueado