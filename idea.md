# Idea Principal

Plataforma multi-tenant de pedidos y reservas para restaurantes, construida con Next.js 16 y Supabase. Cada restaurante opera como un local independiente con aislamiento de datos mediante RLS y subdominios. El sistema cubre el flujo completo: menú público, carrito, checkout, panel de staff (cocina, caja, admin), seguimiento de pedidos para repartidores y gestión de promociones.

## Características clave ya implementadas

- **Multi-local**: Cada local tiene su propio subdominio y configuración (IVA, zona horaria, costo de envío).
- **Autenticación de staff**: Magic link exclusivamente para emails existentes en la tabla `staff`. No hay registro abierto.
- **Panel de staff por rol**:
  - Cocinero: Vista de cocina (KDS) con columnas Por preparar, En preparación y Listos, actualizada en tiempo real.
  - Cajero: Gestión de pedidos activos (confirmar, enviar a cocina, marcar como entregado/cancelado) y historial.
  - Admin: Dashboard con datos del local y módulos pendientes (menú, promos, reservas, reportes).
- **Realtime**: Suscripción a cambios en `orders` mediante Supabase Realtime, con filtros por `location_id` y policy de seguridad que usa JWT del staff.
- **Vista segura**: `staff_orders_view` expone solo datos necesarios para staff (sin teléfono completo ni tokens de entrega).
- **Enriquecimiento de metadata**: Tras magic link, el callback escribe `location_id`, `role` y `full_name` en `user_metadata` del usuario de Supabase Auth.
- **Middleware de protección**: Proxy de Next.js 16 que protege rutas `/staff/*` redirigiendo al login cuando no hay sesión.

## Lo que falta por desarrollar

### 1. Frontend público (cliente)
- [ ] **Landing page**: Menú por categorías, filtros, búsqueda y carrito persistente.
- [ ] **Checkout**: Recogida de datos (nombre, teléfono, tipo de orden, dirección si es domicilio), simulación de pago (por ahora sin pasarela) y creación de orden.
- [ ] **Página de tracking**: `/track/[token]` para que el cliente vea el estado de su pedido en tiempo real.
- [ ] ** Leyenda de IVA incluido**: Mensaje visible en menú y checkout según regulación mexicana (Ley Federal de Protección al Consumidor Art. 76 Bis).

### 2. Panel de admin (pendiente)
- [ ] **Gestión de menú**: CRUD de categorías y productos (precio, descripción, imagen, alérgenos, etiquetas dietarias, disponibilidad).
- [ ] **Motor de promociones**: 
  - Códigos de descuento (únicos o múltiples usos).
  - Promociones automáticas (ej. 2x1, descuento por categoría).
  - Descuento manual en checkout (por staff, sin apilar con otras promociones).
  - UI para crear, editar y ver promociones activas.
- [ ] **Gestión de reservas**: 
  - Calendario de disponibilidad por local y franja horaria.
  - Creación de reserva con depósito manual (el cliente paga vía WhatsApp y el staff marca como pagada).
  - Recordatorios y lista de reservas del día.
- [ ] **Reportes y estadísticas**: Ventas diarias, productos más vendidos, promedio de ticket, etc.
- [ ] **Gestión de staff**: Alta/baja/edición de staff (solo admin puede crear staff, vinculado a un local y rol).

### 3. Repartidor y tracking
- [ ] **View de track para repartidor**: Enlace único (ej. `/track/repartidor/[token]`) que muestra solo pedidos asignados al repartidor, con estado y opción de marcar como entregado (luego pasa a solo lectura).
- [ ] **Asignación de repartidor**: Campo en la orden para asignar a un repartidor (por ahora manual en admin o vía script).

### 4. Configuración por local
- [ ] **Zona horaria**: Configurable por local (predeterminado Ciudad de México).
- [ ] **IVA ajustable**: Por local con valor por defecto 16% (editable en admin).
- [ ] **Costo de envío**: Por zona de delivery (configurable en admin).
- [ ] **Aforo y tiempos**: Configuración de capacidad máxima y tiempo estimado de preparación por local.

### 5.Datos y seguridad
- [ ] **Alérgenos y etiquetas dietarias**: Lista fija (ej. contiene gluten, vegetariano, vegano, sin lactosa) asociada a productos.
- [ ] **Políticas de RLS**: Revisar y asegurar que todas las tablas tengan políticas adecuadas para multi-tenant.
- [ ] **Manejo de errores y logging**: Centralizado en el servidor y en el cliente.
- [ ] **Pruebas**: Tests unitarios y de integración para flujos críticos (checkout, auth, actualización de estado).

### 6. Infraestructura y despliegue
- [ ] **Variables de entorno**: Documentar todas las variables necesarias (Supabase URL, claves, etc.).
- [ ] **Script de despliegue**: Guía para desplegar en Vercel o similar y configurar Supabase.
- [ ] **Monitoreo**: Alertas de caída y métricas de uso.

## Próximos pasos sugeridos

1. Construir el frontend público (landing, menú, checkout) usando los mismos componentes y estilos que el staff panel.
2. Implementar el motor de promociones en el panel de admin.
3. Añadir la vista de track para repartidor y el flujo de asignación.
4. Configurar la zona horaria y el IVA por local en el admin.
5. Escribir pruebas y ajustar el rendimiento antes del lanzamiento.

Nota: Todas las features deben seguir el principio de "preferir funcionalidad nativa de WooCommerce" aunque aquí estamos construyendo desde cero, por lo que usaremos las capacidades de Supabase y Next.js para replicar lo necesario sin sobreingeniería.