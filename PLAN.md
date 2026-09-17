# Plan de Implementación - Restaurant Order JLDev

**Estado actual**: ~70% del core implementado (auth, staff panels, realtime, checkout, tracking, schema completo).
**Faltante**: Módulos de admin (menú, promos, reservas, reportes, staff), configuración por local, asignación repartidor, tests, docs, despliegue.

---

## 1. Frontend Público - Pendientes Menores

| Tarea | Estado | Esfuerzo | Detalle |
|-------|--------|----------|---------|
| Leyenda "IVA incluido" visible en menú y checkout | ❌ | 1h | Req. legal México (LFPC Art. 76 Bis). Añadir badge en `MenuClient.tsx` y `CheckoutPage.tsx`. |
| Validación de stock/disponibilidad en tiempo real | ❌ | 4h | Hook que consulte `products.is_available` vía Realtime antes de confirmar. |
| Mejora UX carrito (modificadores en UI) | ❌ | 8h | Hoy solo añade sin modificadores; falta selector de grupos/opciones en `AddToCartButton`. |

---

## 2. Panel de Admin - Módulos Críticos (Prioridad Alta)

### 2.1 Gestión de Menú (CRUD completo)
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminMenuCategories.tsx` - Listar/crear/editar/eliminar categorías | 6h | Tabla con drag-and-drop para `sort_order`, toggle `is_active`. |
| `AdminMenuProducts.tsx` - CRUD productos | 12h | Formulario modal: nombre, descripción, precio, imagen (upload a Supabase Storage), categoría, disponibilidad, alérgenos (multi-select), etiquetas dietarias (multi-select), grupos de modificadores anidados. |
| `AdminModifierGroups.tsx` - Gestión de modificadores por producto | 8h | Builder visual: grupos requeridos/opcionales, min/max selecciones, opciones con impacto de precio. |
| Server Actions: `createCategory`, `updateCategory`, `deleteCategory`, `createProduct`, `updateProduct`, `deleteProduct`, `createModifierGroup`, `updateModifierGroup`, `createModifierOption`, `updateModifierOption` | 10h | Validación Zod, revalidatePath, manejo de imágenes. |
| API de upload a Supabase Storage (bucket `menu-images`) | 4h | Políticas RLS por `location_id`. |

**Total menú**: ~40h

### 2.2 Motor de Promociones (Engine completo)
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminDiscounts.tsx` - UI lista/crear/editar descuentos | 10h | Formulario complejo: tipo (código/auto), valor (%/fijo), mínimo compra, alcance (productos/categorías), ventana temporal, días/horas, límites de uso, stacking. |
| Lógica de aplicación en checkout (`applyDiscounts`) | 8h | Server action que evalúa reglas, prioridad (código > automática > manual), no-apilar, registra en `discount_usages`. |
| Integración en `CheckoutForm` - campo código promocional | 4h | Input + botón "Aplicar", muestra descuento en resumen, valida contra server action. |
| Descuento manual (staff en caja) | 6h | Botón en `CashierView` solo para ADMIN/CAJERO, modal con motivo, no apila con otras promos. |
| Tests unitarios del engine | 6h | Casos: 2x1, % categoría, código único, límites uso/día/cliente, ventanas temporales, no-stacking. |

**Total promos**: ~34h

### 2.3 Gestión de Reservas
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminReservations.tsx` - Calendario mensual/semanal | 12h | Vista calendario con franjas, aforo por zona (`local_zone_capacity`), indicador de disponibilidad. |
| `ReservationForm.tsx` - Crear/editar reserva | 8h | Titular, teléfono, fecha/hora, comensales, zona preferida, notas, estado depósito. |
| Recordatorios (WhatsApp/email) | 6h | Job cron (Supabase pg_cron o Vercel Cron) 24h y 2h antes. Plantilla en `notifications/email/`. |
| Lista del día en dashboard admin | 4h | Tarjetas con hora, zona, comensales, estado depósito, acciones (confirmar, cancelar, marcar depositado). |
| Server Actions CRUD reservas | 6h | Validación de aforo, conflictos de horario, depósito. |

**Total reservas**: ~36h

### 2.4 Reportes y Estadísticas
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminReports.tsx` - Dashboard con KPIs | 10h | Ventas del día/semana/mes, ticket promedio, productos top, pedidos por estado, método de pago, tipo orden. |
| Gráficas (Recharts o Chart.js) | 6h | Serie temporal ventas, barras top productos, dona por tipo de orden. |
| Export CSV/PDF | 4h | Botones de descarga por rango de fechas. |
| Cierre de caja diario | 6h | Resumen por turno, diferencial efectivo vs esperado, firma digital cajero. |

**Total reportes**: ~26h

### 2.5 Gestión de Staff
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminStaff.tsx` - Tabla staff del local | 6h | Solo ADMIN ve/crea/edita/desactiva. Formulario: email, nombre, rol, activo. |
| Invitation flow (magic link para nuevo staff) | 4h | Server action que inserta en `staff` + envía magic link vía Supabase Auth Admin API. |

**Total staff**: ~10h

### 2.6 Configuración del Local (Settings)
| Componente | Esfuerzo | Detalle |
|------------|----------|---------|
| `AdminSettings.tsx` - Formulario único | 6h | Timezone (selector IANA), IVA rate (input % con validación 0-1), costo envío base, capacidad por zona (editor `local_zone_capacity`), tiempo estimado prep por defecto. |
| Server Action `updateLocalSettings` | 2h | Valida y actualiza `locals` + `local_zone_capacity`. |

**Total settings**: ~8h

---

## 3. Repartidor y Tracking

| Tarea | Esfuerzo | Detalle |
|-------|----------|---------|
| Asignación de repartidor en orden | 4h | Campo `driver_id` en `orders` (FK a `staff` con role='REPARTIDOR' - *nuevo rol*). UI en `CashierView` y `AdminView` para asignar. |
| Vista track repartidor mejorada | 6h | Lista de pedidos asignados (no solo uno), filtro por estado, mapa simple (Leaflet/OSM) con dirección, botón "Llegué" → "Entregado". |
| Notificación push/email a repartidor al asignar | 4h | Supabase Realtime o webhook a servicio externo. |
| Rol `REPARTIDOR` en schema y RLS | 2h | Añadir a enum `staff.role`, policy `staff_staff_access`, navegación en `StaffNav`. |

**Total repartidor**: ~16h

---

## 4. Datos y Seguridad

| Tarea | Esfuerzo | Detalle |
|-------|----------|---------|
| Auditoría RLS completa | 8h | Revisar cada policy contra amenazas: escalada de privilegio, enumeración cross-tenant, fuga de PII. Probar con `supabase.test` helpers. |
| Error handling centralizado | 6h | `lib/errors.ts` con clases `AppError`, `ValidationError`, `AuthError`, `NotFoundError`. Wrapper `withErrorHandling` para server actions. Log a `console.error` + opcional Sentry. |
| Logging estructurado | 4h | `lib/logger.ts` con niveles, contexto (requestId, userId, locationId). Middleware que inyecta requestId. |
| Tests unitarios (Vitest) | 20h | `pricing.ts`, `validation.ts`, `tokens.ts`, engine de promos, transiciones de estado, cálculos IVA. |
| Tests de integración (Playwright) | 16h | Flujos: checkout completo, auth staff, KDS realtime, cashier transitions, admin CRUD menú, aplicación promo. |
| Seed de datos realista para tests | 4h | `scripts/seed-test-data.ts` usando service role. |

**Total datos/seguridad/tests**: ~58h

---

## 5. Infraestructura y Despliegue

| Tarea | Esfuerzo | Detalle |
|-------|----------|---------|
| Documentar variables de entorno (`.env.example` completo) | 2h | Añadir: `NEXT_PUBLIC_APP_URL`, `SUPABASE_STORAGE_BUCKET`, `CRON_SECRET`, `SENTRY_DSM`, `WHATSAPP_API_TOKEN`. |
| Guía de despliegue Vercel + Supabase | 4h | `docs/DEPLOY.md`: pasos CLI, variables en Vercel, migraciones (`supabase db push`), Storage buckets, Realtime habilitado, pg_cron para jobs. |
| Configurar Vercel Analytics / Speed Insights | 1h | `next.config.ts` + env vars. |
| Alertas de caída (UptimeRobot / Better Uptime) | 2h | Health check endpoint `/api/health` que verifica Supabase. |
| Métricas de uso (PostHog o Plausible) | 3h | Eventos: `order_created`, `order_completed`, `promo_applied`, `reservation_created`. |

**Total infra/despliegue**: ~12h

---

## 6. Resumen de Esfuerzo por Fase

| Fase | Horas | Prioridad | Entregable |
|------|-------|-----------|------------|
| **Fase 1: Admin Core** (Menú + Promos + Settings) | ~82h | **Crítica** | Admin funcional para operar el negocio día a día. |
| **Fase 2: Reservas + Reportes** | ~62h | **Alta** | Gestión de mesas y visibilidad de negocio. |
| **Fase 3: Repartidor + Staff Mgmt** | ~26h | **Media** | Flujo delivery completo y gestión de equipo. |
| **Fase 4: Calidad + Infra** | ~70h | **Alta** | Tests, logging, RLS auditado, docs, despliegue. |
| **Fase 5: Pulido Público** | ~13h | **Baja** | IVA badge, modificadores en carrito, stock realtime. |
| **TOTAL** | **~253h** (~6-7 semanas a 40h/sem) | | |

---

## 7. Orden Sugerido de Ejecución (Sprints de 2 semanas)

### Sprint 1-2: Menú Admin + Promociones Base
- Semana 1: CRUD Categorías + Productos (sin modificadores aún)
- Semana 2: Modificadores anidados + Engine de promos (códigos + automáticas) + integración checkout

### Sprint 3-4: Promociones Completas + Settings + Staff
- Semana 3: Descuento manual en caja, validación no-stacking, tests unitarios promos
- Semana 4: AdminSettings (timezone, IVA, delivery fee, aforo), AdminStaff (CRUD + invitación)

### Sprint 5-6: Reservas + Reportes
- Semana 5: Calendario reservas, aforo por zona, formulario, recordatorios (cron)
- Semana 6: Dashboard reportes (KPIs, gráficas, export, cierre de caja)

### Sprint 7: Repartidor + Calidad
- Semana 7: Rol repartidor, asignación en caja/admin, vista tracking mejorada, notificaciones
- Semana 8: Auditoría RLS, error handling centralizado, logging, health check

### Sprint 8-9: Tests + Despliegue + Pulido
- Semana 8: Tests unitarios (Vitest) + integración (Playwright) para flujos críticos
- Semana 9: Docs despliegue, métricas, alertas, IVA badge, modificadores en carrito público

---

## 8. Decisiones Técnicas Pendientes (Requieren Confirmación)

1. **Imágenes de productos**: ¿Supabase Storage (gratis 1GB) o CDN externo (Cloudinary, UploadThing)?
2. **Notificaciones WhatsApp**: ¿Twilio, Meta Cloud API, o proveedor local? Afecta recordatorios de reservas.
3. **Mapa repartidor**: ¿Leaflet + OSM (gratis, self-hosted tiles) o Mapbox (pago, mejor UX)?
4. **Gráficas**: ¿Recharts (React native, ~50KB) o Chart.js + wrapper (más maduro)?
5. **Tests E2E**: ¿Playwright (recomendado) o Cypress? Playwright tiene mejor soporte multi-browser y CI.
6. **Monitoreo errores**: ¿Sentry (gratis 5k eventos/mes) o solo logs Vercel + Supabase?

---

## 9. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Engine de promos complejo → bugs en producción | Alto | Tests unitarios exhaustivos (mínimo 20 casos), feature flag para activar/desactivar. |
| RLS mal configurado → fuga datos cross-tenant | Crítico | Auditoría sistemática + tests de integración que intenten acceder a datos de otro local. |
| Realtime saturation (muchos pedidos simultáneos) | Medio | Límite 100 orders en hook, paginación en admin, índices DB correctos. |
| Migraciones Schema breaking changes | Alto | Solo additive migrations en producción; `supabase db push` solo en dev/staging. |
| Dependencia Supabase (vendor lock-in) | Bajo | Capa de abstracción `lib/supabase/` ya existe; queries raw SQL aisladas en server actions. |

---

## 10. Próximos Pasos Inmediatos (Esta Semana)

1. **Confirmar decisiones técnicas** (§8) con el stakeholder.
2. **Crear branch `feat/admin-menu`** y empezar con `AdminMenuCategories.tsx` + server actions.
3. **Configurar Vitest + Playwright** en el repo (`npm install -D vitest @playwright/test`).
4. **Añadir `SENTRY_DSN`** a `.env.example` y `next.config.ts` para error tracking desde día 1.
5. **Ejecutar auditoría RLS rápida** (script que intente cross-tenant access con distintos JWTs).

---

*Generado automáticamente tras revisión de codebase vs `idea.md` — 2025-09-17*