// Seed de datos de prueba (TODO 36): crea órdenes con distintos estados,
// tipos y métodos de pago para ejercitar Reportes / Cierre de Caja.
// Uso:
//   node --env-file=.env scripts/seed-test-data.mjs [slug] [nÓrdenes]
// Idempotente: marca cart_snapshot.version='test-seed' y borra las órdenes
// de test previas del local antes de insertar.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const slug = process.argv[2] ?? 'demo';
const count = Number(process.argv[3] ?? 12);

const { data: local, error: localError } = await supabase
  .from('locals')
  .select('id, name, iva_rate, delivery_fee')
  .eq('slug', slug)
  .maybeSingle();

if (localError || !local) {
  console.error(`No se encontró el local "${slug}".`, localError?.message ?? '');
  process.exit(1);
}

// 1. Limpiar órdenes de test previas de este local.
const { error: delError } = await supabase
  .from('orders')
  .delete()
  .eq('location_id', local.id)
  .like('cart_snapshot->>version', 'test-seed%');
if (delError) {
  console.error('No se pudieron limpiar órdenes de test previas:', delError.message);
  process.exit(1);
}

// 2. Catálogo del local para el snapshot.
const { data: products, error: prodError } = await supabase
  .from('products')
  .select('id, name, base_price')
  .eq('location_id', local.id)
  .limit(5);

if (prodError || !products?.length) {
  console.error('El local no tiene productos — crea el menú antes de seed de órdenes.');
  process.exit(1);
}

const STATUSES = ['CREADO', 'CONFIRMADO_CAJA', 'EN_PREPARACION', 'LISTO', 'LISTO_PARA_ENTREGA', 'COMPLETADO', 'CANCELADO'];
const PAYMENTS = ['EFECTIVO_EXACTO', 'EFECTIVO_CON_CAMBIO', 'TARJETA_CONTRA_ENTREGA'];
const TYPES = ['RECOGER', 'DOMICILIO'];

const rows = [];
for (let i = 0; i < count; i++) {
  const product = products[i % products.length];
  const qty = 1 + (i % 3);
  const subtotal = Number(product.base_price) * qty;
  const orderType = TYPES[i % TYPES.length];
  const deliveryFee = orderType === 'DOMICILIO' ? Number(local.delivery_fee) : 0;
  const iva = Math.round(subtotal * (local.iva_rate / (1 + local.iva_rate)) * 100) / 100;
  const status = STATUSES[i % STATUSES.length];
  const completed = status === 'COMPLETADO';
  // Repartir los días de los últimos 7 para ejercitar la gráfica de ingresos.
  const daysAgo = i % 7;
  const createdAt = new Date(Date.now() - daysAgo * 86400000 - (i % 5) * 3600000).toISOString();

  rows.push({
    location_id: local.id,
    customer_name: `Cliente Test ${i + 1}`,
    customer_phone: '5512345678',
    order_type: orderType,
    payment_method: PAYMENTS[i % PAYMENTS.length],
    delivery_address: orderType === 'DOMICILIO' ? 'Calle Test 123, Col. Centro' : null,
    delivery_references: null,
    eta: createdAt,
    status,
    payment_status: completed ? 'COBRADO' : 'PENDIENTE',
    subtotal,
    iva_amount: iva,
    delivery_fee_amount: deliveryFee,
    total: subtotal + deliveryFee,
    cart_snapshot: {
      version: 'test-seed',
      items: [{ product_id: product.id, product_name: product.name, base_price: Number(product.base_price), quantity: qty, modifiers: [] }],
    },
    created_at: createdAt,
    updated_at: createdAt,
    delivered_at: completed ? createdAt : null,
  });
}

const { error: insertError } = await supabase.from('orders').insert(rows);
if (insertError) {
  console.error('No se pudieron insertar las órdenes de test:', insertError.message);
  process.exit(1);
}

console.log(`✓ ${rows.length} órdenes de test creadas en "${local.name}" (/${slug})`);
console.log('  Verifica Reportes → gráfica de ingresos y Cierre de Caja.');
console.log('  Limpieza: volver a ejecutar este script (borra las órdenes test-seed previas).');
