# Idea Principal

Plataforma de pedidos y reservas para restaurantes, construida con Next.js 16 y Supabase. **Modelo: 1 restaurante = 1 dominio propio (con su propio deployment y su propia DB de Supabase).** El dominio es irrelevante para la app; cada **sucursal (location)** se identifica por su **ruta** `tudominio.com/{slug}`. Aislamiento de datos entre sucursales mediante RLS (patrón GUC `app.local_id`). **El staff opera sin roles** (decisión del dueño: auth con user/password + magic link, no se toca); la autorización es por local.

Flujo completo cubierto: menú público → carrito con modificadores → checkout (pago contra entrega, IVA incluido, cupones) → cocina (KDS realtime) → caja (transiciones, descuento manual, reparto) → tracking de cliente y repartidor (links de un solo uso) → admin (menú, promos, reservas, reportes, staff, locales).

## Características clave implementadas (v0.5.0)

- **Multi-sucursal por rutas**: `/` índice de sucursales, `/{slug}` menú, `/{slug}/checkout`, `/track/{token}` (cliente), `/track/repartidor/{token}` (un solo uso, hash bcrypt).
- **Menú de 4 niveles**: categorías → productos → grupos de modificadores → opciones, con alérgenos/etiquetas dietarias (tablas puente) e imágenes en Supabase Storage (bucket `menu-images`).
- **IVA incluido** en precios públicos con desglose interno para contabilidad (`subtotal * rate/(1+rate)`); tasa y tarifa de envío configurables por local.
- **Motor de promociones**: códigos + automáticas, sin apilar (prioridad código > auto > manual), ventanas temporales, días/horas, límites de uso, alcance por producto. Descuento manual en caja.
- **Reservas** por zona (INTERIOR/TERRAZA/BARRA) con aforo configurable, calendario día/semana/mes y recordatorios automáticos 24h/2h (cron protegido con `CRON_SECRET`).
- **Reportes y cierre de caja**: KPIs, ingresos por día (gráfica sin dependencias), top productos, export CSV, efectivo/tarjeta esperado por día.
- **Reparto**: asignación de repartidor desde caja + link de reparto revocable y regenerable (`orders.driver_id`, ver `docs/install.sql`).
- **Errores amigables**: catálogo central (`lib/errors.ts`) que traduce PG/PGRST a español; los formularios muestran error por campo y conservan los datos (ver `docs/FORMULARIOS.md`).
- **Operación**: `/api/health`, `lib/logger.ts`, scripts de diagnóstico (`check-seed.mjs`, `seed-test-data.mjs`), 53 tests unit (Vitest).

## Qué falta (roadmap corto)

- **Playwright E2E** (tarea 35 del TODO): checkout completo, auth staff, KDS realtime.
- **Mapa del repartidor**: Leaflet+OSM (gratis) vs Mapbox — decisión pendiente.
- **Notificación al repartidor** al asignar (webhook externo).
- **Export PDF** de reportes.
- `locals.prep_minutes` (tiempo estimado de prep por defecto) — requiere migración.
- Endurecer policies públicas por `location_id` si una DB llegara a alojar varios restaurantes (ver `docs/rls-audit.md`).

## Decisiones cerradas

- ❌ Roles de staff (`admin/cajero/cocinero/repartidor`) — **fuera de alcance por decisión del dueño**; el auth actual no se toca.
- ❌ Pagos en línea — todo contra entrega (efectivo exacto/con cambio, tarjeta contra entrega).
- ❌ "Comer en el local" (mesas vinculadas a pedidos) — fuera de v1; las reservas son por zona.
- ❌ Menú por tramos horarios — catálogo único todo el día.
- ✅ Sin pasarelas, sin signup abierto, moneda MXN / es-MX.
