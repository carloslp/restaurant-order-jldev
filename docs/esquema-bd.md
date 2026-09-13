# Esquema de Base de Datos — Pedidos, Reservas y Operaciones

**Stack:** Supabase (PostgreSQL)  
**Objetivo:** Definir tablas, columnas, tipos, restricciones y políticas RLS que implementen las decisiones cerradas en la revisión crítica (2026-09-13).  

---  

## 1. Tabla de Locales (multi-local desde v1)

```sql
CREATE TABLE locals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                          -- nombre comercial del local
    subdomain TEXT UNIQUE NOT NULL,              -- ej. "milocal" para milocal.midominio.com
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',  -- IANA timezone
    iva_rate NUMERIC(5,4) NOT NULL DEFAULT 0.16, -- tasa de IVA (ej. 0.16 = 16%)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **RLS:** Las políticas en todas las tablas filtrarán por `location_id` (o join a través de ella) usando `current_setting('app.local_id')::uuid` o similar mediante un GUC establecido por el middleware tras autenticación del staff o por token público (para catálogo/menú).

---

## 2. Catálogo (4 niveles)

### 2.1 Categoría
```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);
```

### 2.2 Producto Base
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0), -- precio con IVA incluido
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, name)
);
```

### 2.3 Grupos de Modificadores
```sql
CREATE TABLE modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,    -- obligatoriedad
    min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INTEGER NOT NULL DEFAULT 0 CHECK (max_selections >= min_selections),
    -- max_selections = 0 significa "ilimitado" (pero limitado por opciones disponibles)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, product_id, name)
);
```

### 2.4 Opciones de Modificador
```sql
CREATE TABLE modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_impact NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- impacto en precio (con IVA incluido)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(location_id, modifier_group_id, name)
);
```

> **Nota:** `price_impact` es el delta que se suma al `base_price` del producto (ya con IVA incluido). El precio final del ítem en el snapshot será:  
> `base_price + SUM(price_impact de opciones seleccionadas)`.

---

## 3. Pedidos

### 3.1 Estados permitidos (enum)
```sql
CREATE TYPE order_status AS ENUM (
    'CREADO',
    'CONFIRMADO_CAJA',
    'EN_PREPARACION',
    'LISTO',
    'LISTO_PARA_ENTREGA',
    'COMPLETADO',
    'CANCELADO'
);
```

### 3.2 Tipos de pedido
```sql
CREATE TYPE order_type AS ENUM ('RECOGER', 'DOMICILIO');
```

### 3.3 Métodos de pago (contra entrega)
```sql
CREATE TYPE payment_method AS ENUM (
    'EFECTIVO_EXACTO',
    'EFECTIVO_CON_CAMBIO',
    'TARJETA_CONTRA_ENTREGA'
);
```

### 3.4 Estado de pago
```sql
CREATE TYPE payment_status AS ENUM ('PENDIENTE', 'COBRADO');
```

### 3.5 Tabla de Pedidos
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    -- Datos del cliente (mínimos por tipo)
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, -- formato E.164 opcional, validado en app
    -- Tipo y método
    order_type order_type NOT NULL,
    payment_method payment_method NOT NULL,
    -- Dirección (solo para DOMICILIO)
    delivery_address TEXT,
    delivery_references TEXT,     -- referencias breves
    -- Hora estimada (cliente la elige, validada en app contra horario de cocina)
    eta TIMESTAMPTZ NOT NULL,
    -- Estado y transiciones
    status order_status NOT NULL DEFAULT 'CREADO',
    payment_status payment_status NOT NULL DEFAULT 'PENDIENTE',
    -- Totales (todos con IVA incluido)
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    iva_amount NUMERIC(10,2) NOT NULL CHECK (iva_amount >= 0),
    tip_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0), -- por si cambia decisión futura
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    -- Snapshot del carrito (JSONB con schema fijo)
    cart_snapshot JSONB NOT NULL,
    -- Campos de delivery (preparados para futuro)
    delivery_zone TEXT NULL,                  -- zona para tarifas por distancia futura
    delivery_token UUID NULL,                 -- token de un solo uso para repartidor
    delivery_token_expires_at TIMESTAMPTZ NULL,
    delivery_token_rotated_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,            -- cuando el repartidor confirmó entrega
    -- Auditoría
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,   -- quién creó el pedido (cajero o self-service)
    updated_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_delivery_address CHECK (
        (order_type = 'DOMICILIO' AND delivery_address IS NOT NULL) OR
        (order_type = 'RECOGER' AND delivery_address IS NULL)
    ),
    CONSTRAINT chk_eta_future CHECK (eta > now()),
    CONSTRAINT chk_total_consistency CHECK (
        ABS(total - (subtotal + iva_amount + tip_amount)) < 0.01
    )
);
```

#### 3.5.1 Estructura de `cart_snapshot` (JSONB)
```json
{
  "version": "1",
  "items": [
    {
      "product_id": "uuid",
      "product_name": "string",
      "base_price": 120.00,
      "quantity": 2,
      "modifiers": [
        {
          "modifier_group_id": "uuid",
          "modifier_group_name": "string",
          "selections": [
            {
              "option_id": "uuid",
              "option_name": "string",
              "price_impact": 5.00,
              "quantity": 1
            }
          ]
        }
      ]
    }
  ]
}
```
> El `base_price` y `price_impact` ya incluyen IVA.  
> El `subtotal` de la orden debe igualar `SUM(item.base_price * item.quantity + SUM(option.price_impact * option.quantity))`.  
> El `iva_amount` se calcula como `subtotal * iva_rate` del local (ver trigger o aplicación).  
> El `tip_amount` queda por ahora siempre 0 (se elimina propina del sistema).

### 3.6 Índices y triggers
```sql
-- Índices comunes
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE INDEX idx_orders_eta ON orders(eta);
CREATE INDEX idx_orders_created_at ON orders(created_at);
-- Evitar pedidos duplicados por idempotency key (se manejará en app con una tabla aparte o columna)
```

### 3.7 Política de expiración de `CREADO` (15 min)
Se implementa como **trigger** o **job** (Supabase Cron) que actualiza:
```sql
UPDATE orders
SET status = 'CANCELADO',
    updated_at = now()
WHERE status = 'CREADO'
  AND created_at < now() - interval '15 minutes';
```
> En v1 podemos usar un `supabase cron job` que corra cada minuto. Alternativamente, hacerlo en la Server Action al leer el pedido (filtrar por `created_at > now() - interval '15 minutes'`).

---

## 4. Reservas

### 4.1 Estados de reserva
```sql
CREATE TYPE reservation_status AS ENUM (
    'PENDIENTE',
    'CONFIRMADA',
    'CANCELADA',
    'NO_SHOW'
);
```

### 4.2 Estado de depósito (manual vía WhatsApp)
```sql
CREATE TYPE deposit_status AS ENUM (
    'SIN_DEPOSITO',
    'DEPOSITO_PENDIENTE',
    'DEPOSITADO'
);
```

### 4.3 Tabla de Reservas
```sql
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    -- Datos del titular
    holder_name TEXT NOT NULL,
    holder_phone TEXT NOT NULL,
    -- Detalles de la reserva
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL, -- bloque horario (ej. 20:00)
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    preferred_zone TEXT NOT NULL CHECK (preferred_zone IN ('INTERIOR', 'TERRAZA', 'BARRA')),
    -- Estado y depósito
    status reservation_status NOT NULL DEFAULT 'PENDIENTE',
    deposit_status deposit_status NOT NULL DEFAULT 'SIN_DEPOSITO',
    -- Totales y notas
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_future_datetime CHECK (
        (reservation_date || ' ' || reservation_time)::timestamptz > now()
    )
);
```

### 4.4 Validación de cupo (aforo por zona)
Se asume una tabla `local_zone_capacity` que define el aforo máximo por zona y local:
```sql
CREATE TABLE local_zone_capacity (
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    zone TEXT NOT NULL CHECK (zone IN ('INTERIOR', 'TERRAZA', 'BARRA')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    PRIMARY KEY (location_id, zone)
);
```
> La validación de cupo al crear/actualizar una reserva se hace mediante una **función o trigger** que verifica:  
> `SUM(party_size) de reservas activas (status IN ('PENDIENTE','CONFIRMADA')) en el mismo local, zona y bloque horario <= capacity`.  
> Se puede hacer con una condición `WHERE` en un `INSERT ... SELECT` o mediante una `EXCEPTION` en caso de violación.

---

## 5. Staff y Autenticación

### 5.1 Tabla de Staff
```sql
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,          -- para magic link de Supabase Auth
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'COCINERO')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
> **Auth:** Se usa Supabase Auth con **magic link** (sin contraseñas). El `email` debe coincidir con un registro en `staff`.  
> Al iniciar sesión, el middleware establece un GUC (p.ej. `app.local_id` y `app.staff_id` y `app.staff_role`) a partir del claim `email` → `staff`.  
> Las políticas RLS leen esos GUCs para filtrar.

### 5.2 Token de Repartidor (único uso)
```sql
CREATE TABLE delivery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,           -- bcrypt o similar del token plano que se envía por link
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
> - El token plano tiene 12 caracteres alfanuméricos (se genera en app).  
> - Sólo se almacena su hash.  
> - Al usarlo (`EN_CAMINO → COMPLETADO`), se marca `used_at = now()`.  
> - Se puede regenerar desde caja borrando el viejo y creando uno nuevo (manteniendo `order_id`).  
> - El link es `/track/delivery/<token_plano>`.  
> - Política RLS: solo permite `UPDATE` en `orders` para cambiar `status` a `COMPLETADO` y establecer `delivered_at` si el token coincide y no está usado/revocado y pertenece al local del staff (o es anónimo pero se valida el hash).

---

## 6. Descuentos (Engine Completo)

### 6.1 Tipos de descuento
```sql
CREATE TYPE discount_type AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
```

### 6.2 Tabla de Descuentos (promos automáticas + códigos)
```sql
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locals(id) ON DELETE CASCADE,
    code TEXT UNIQUE,                   -- NULL para promos automáticas
    description TEXT NOT NULL,
    discount_type discount_type NOT NULL,
    value NUMERIC(10,2) NOT NULL CHECK (value >= 0), -- porcentaje (0-100) o monto
    -- Condiciones de aplicación
    min_purchase NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
    applies_to_product_ids UUID[],      -- NULL = todos
    applies_to_category_ids UUID[],     -- NULL = todos
    starts_at TIMESTAMPTZ NULL,
    ends_at TIMESTAMPTZ NULL,
    days_of_week INTEGER[] NULL,        -- arreglo de 0-6 (Dom=0), NULL = todos los días
    time_of_day_start TIME NULL,        -- HH:MM:SS, NULL = todo el día
    time_of_day_end TIME NULL,          -- HH:MM:SS, NULL = todo el día
    usage_limit_total INTEGER NULL,     -- NULL = ilimitado
    usage_limit_per_customer INTEGER NULL, -- NULL = ilimitado
    usage_limit_per_day INTEGER NULL,   -- NULL = ilimitado
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT chk_value_range CHECK (
        (discount_type = 'PERCENTAGE' AND value <= 100) OR
        (discount_type = 'FIXED_AMOUNT' AND value >= 0)
    ),
    CONSTRAINT chk_code_or_auto CHECK (
        (code IS NOT NULL) OR (code IS NULL) -- explícito: permite ambos
    )
);
```

### 6.3 Uso de descuentos (para rastrear límites)
```sql
CREATE TABLE discount_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,       -- para límite por cliente
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount_applied NUMERIC(10,2) NOT NULL CHECK (amount_applied >= 0)
);
```
> El `amount_applied` se calcula en aplicación (basado en el `subtotal` o monto según tipo) y se guarda para auditoría y límites.

---

## 7. Alérgenos / Info Dietaria

### 7.1 Lista fija de alérgenos (según NOM-050 y regulaciones locales)
```sql
CREATE TABLE allergens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,          -- ej. "GLUTEN", "LACTEOS", "FRUTOS_SECO"
    description TEXT
);
```
> Se poblará con los alérgenos obligatorios a declarar (ajustable por giro).  
> Valores típicos: gluten, crustáceos, huevo, pescado, cacahuates, soja, leche, frutos de cáscara, dióxido de azufre, lupino, moluscos.

### 7.2 Relación muchos-a-muchos producto ↔ alérgeno
```sql
CREATE TABLE product_allergens (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    allergen_id UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, allergen_id)
);
```

### 7.3 Etiquetas dietarias (vegetariano, vegano, sin gluten, etc.)
```sql
CREATE TABLE diet_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,          -- ej. "VEGETARIANO", "VEGANO", "SIN_GLUTEN"
    description TEXT
);

CREATE TABLE product_diet_labels (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    diet_label_id UUID NOT NULL REFERENCES diet_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, diet_label_id)
);
```
> Estas etiquetas se muestran en la ficha del producto (iconos o texto).  
> No hay búsqueda/filtro por alérgeno o etiqueta en v1 (se deja para futuro).

---

## 8. Vistas y Reportes (ejemplo: cierre de caja)

### 8.1 Vista de resumen diario por local
```sql
CREATE VIEW v_daily_cashier_summary AS
SELECT
    o.location_id,
    l.name AS local_name,
    o.created_at::date AS fecha,
    COUNT(*) FILTER (WHERE o.status = 'COMPLETADO') AS pedidos_completados,
    COUNT(*) FILTER (WHERE o.status = 'CANCELADO') AS pedidos_cancelados,
    SUM(o.total) FILTER (WHERE o.status = 'COMPLETADO') AS total_ventas,
    SUM(o.total) FILTER (WHERE o.payment_method = 'EFECTIVO_EXACTO' AND o.status = 'COMPLETADO') AS efectivo_exacto,
    SUM(o.total) FILTER (WHERE o.payment_method = 'EFECTIVO_CON_CAMBIO' AND o.status = 'COMPLETADO') AS efectivo_con_cambio,
    SUM(o.total) FILTER (WHERE o.payment_method = 'TARJETA_CONTRA_ENTREGA' AND o.status = 'COMPLETADO') AS tarjeta,
    SUM(o.iva_amount) FILTER (WHERE o.status = 'COMPLETADO') AS iva_recaudado,
    COUNT(DISTINCT o.customer_phone) AS clientes_unicos
FROM orders o
JOIN locals l ON o.location_id = l.id
WHERE o.created_at >= current_date
  AND o.created_at < current_date + interval '1 day'
GROUP BY o.location_id, l.name, o.created_at::date;
```
> Esta vista se puede consumir desde la pantalla de Caja para el cierre del día.  
> Se añaden filtros por cajero si se requiere (`created_by`).

---

## 9. Políticas RLS (Resumen)

Todas las tablas tendrán habilitado Row Level Security y usarán **políticas que filtran por `location_id`** (obtenido del GUC `app.local_id` establecido tras autenticación o, para endpoints públicos como catálogo/menú, usando un rol `anon` que permite solo `SELECT` sin filtrar por local pero sí por `is_active`).

### 9.1 Ejemplo: política para `orders` (staff)
```sql
-- Permite al staff ver y modificar solo órdenes de su location
CREATE POLICY orders_location_isolation ON orders
FOR ALL
USING (location_id = current_setting('app.local_id')::uuid)
WITH CHECK (location_id = current_setting('app.local_id')::uuid);
```

### 9.2 Ejemplo: política para `categories` (público - solo lectura activa)
```sql
-- Permite a cualquiera (anon) leer categorías activas de cualquier location (para el menú público)
CREATE POLICY categories_public_read ON categories
FOR SELECT
USING (is_active = true);
```
> En este caso, el menú público no necesita saber el location (el subdominio ya lo implica en la request; el backend puede fijar el `location_id` a partir del subdominio y entonces aplicar la política de aislamiento también al `anon` si se desea, pero está bien dejarlo así para cachear en CDN).

### 9.3 Políticas para tokens de repartidor (anon)
```sql
-- Permite leer el hash del token solo si coincide con el proporcionado y no está usado/revocado
CREATE POLICY delivery_tokens_anon_read ON delivery_tokens
FOR SELECT
USING (
    token_hash = crypt(current_setting('app.token_plain'), token_hash) AND
    used_at IS NULL AND
    revoked_at IS NULL AND
    expires_at > now()
);
-- Permite marcar como usado (solo UPDATE en used_at) si se cumple lo anterior
CREATE POLICY delivery_tokens_anon_use ON delivery_tokens
FOR UPDATE
USING (
    token_hash = crypt(current_setting('app.token_plain'), token_hash) AND
    used_at IS NULL AND
    revoked_at IS NULL AND
    expires_at > now()
)
SET (used_at = now());
```

---  

## 10. Próximos pasos

1. **Crear las tablas** en Supabase usando el SQL anterior (ajustar nombres si hay colisiones).  
2. **Habilitar RLS** en cada tabla y aplicar las políticas.  
3. **Crear los GUCs** (`app.local_id`, `app.staff_id`, `app.staff_role`, `app.token_plain`) en el middleware (Next.js Server Actions o Edge Functions) después de autenticar o extraer del subdominio/token.  
4. **Definir triggers** para:  
   - actualizar `updated_at` (trigger genérico).  
   - validar cupo de reservas (función + trigger).  
   - consistencia de totales en `orders` (opcional, se puede hacer en app).  
5. **Poblar datos maestros**: alérgenos, etiquetas dietarias, zonas y capacidades por local (si se conoce).  
6. **Crear índices adicionales** según consultas frecuentes (se irán añadiendo en base a observación).  

---  

*Documento generado el 2026-09-13 basado en la spec y decisiones cerradas.*