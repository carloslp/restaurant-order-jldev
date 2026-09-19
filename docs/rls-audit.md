# Auditoría RLS — estado y hallazgos (2026-09-19)

Fuente: revisión de `docs/schema.sql` + `install.sql` contra las policies reales y el uso en código.
Alcance: fuga cross-tenant, PII, escalada de privilegios. **Nota**: el auth funciona sin roles (decisión del dueño) — cualquier staff autenticado de un local tiene acceso total a los datos **de su local**; el aislamiento entre locales es lo que RLS garantiza.

## ✅ Lo que está bien (verificado)

| Punto | Evidencia |
|---|---|
| Patrón GUC `app.local_id` en todas las policies staff (`*_staff_access`) | Server Actions hacen `set_config('app.local_id')` antes de cada query |
| `staff_orders_view` con `security_invoker=true` | La vista aplica RLS de `orders`; no expone teléfono completo ni tokens |
| Tokens de reparto: hash-only (bcrypt), un solo uso, revocables | `delivery_tokens` + `verifyToken()` |
| Storage `menu-images`: verificación de `location_id` en el path antes de borrar | `deleteMenuImage()` |
| `supabase.secret` nunca viaja al cliente | `lib/supabase/server.ts` solo se usa en `'use server'` |

## ⚠️ Hallazgos abiertos (con mitigación o decisión pendiente)

1. **Policies públicas sin filtro de `location_id`** (`categories_public_read`, `products_public_read`, `local_zone_capacity_public_read`, `allergens`, `diet_labels`, puentes). El catálogo entero de TODOS los locales es legible por API anónima directa. Mitigación parcial: cada query de la app filtra por `location_id`. Riesgo: enumeración del catálogo de otro restaurante vía PostgREST. En el modelo "1 dominio = 1 deployment = 1 DB" el impacto es bajo (una sola empresa por DB), por eso no se cambió. **Pendiente**: si algún día una DB aloja varios restaurantes, endurecer con `USING (location_id = <local público del dominio>)`.
2. **`products_public_read USING (is_available = true)`**: el anónimo no puede leer productos agotados. Consecuencia: el hook de disponibilidad no puede saber *cuándo* vuelve a estar disponible y `getMenu` no los lista. Decisión consciente (el menú no muestra agotados); el hook ya lo trata como no disponible (`useProductAvailability`, fix 0.2.6).
3. **`orders_public_read` por token** — legible solo con el UUID de `delivery_token` (columnas legacy). Verificar tras `migration-driver-id.sql` que las columnas `delivery_token*` legacy se sigan poblando (hoy `createOrder` las llena además de `delivery_tokens`).
4. **Auto-creación de staff en `getCurrentStaff()`** (cualquier email autenticado se auto-registra en el primer local). **Decisión del dueño: no se toca** — el flujo de auth es no negociable. Riesgo aceptado: depender de que Supabase Auth solo permita usuarios invitados/creados por el admin (sin signup abierto — **verificar que "Allow new users to sign up" esté OFF** en Supabase → Authentication → Providers → Email).

## Checklist operativo (ejecutar tras cada cambio de schema)

```bash
# 1. Diagnóstico de visibilidad y errores por tabla (anon vs service):
node --env-file=.env scripts/check-seed.mjs [slug]

# 2. Intento de enumeración cross-tenant con anónimo (debe devolver 0 filas si
#    se endurecen las policies públicas — hoy devuelve filas, ver hallazgo 1):
curl "$SUPABASE_URL/rest/v1/products?select=id" -H "apikey: $ANON_KEY"

# 3. Health check de policies staff: sin GUC no debe listar nada.
```

## Pruebas recomendadas (cuando se añada CI con DB efímera)

- Staff del local A con GUC de A intenta `select * from orders where location_id = <B>` → 0 filas.
- Anónimo pide `/rest/v1/orders` → 401/0 filas.
- Anónimo con token de reparto válido ve SOLO la orden del token (columnas mínimas).
