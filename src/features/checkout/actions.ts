// Acciones de servidor para pedidos (checkout público).
// - Validación de entrada
// - Idempotencia (evitar duplicados por doble submit)
// - Persistencia con service role (salta RLS para insert)

'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getLocalById } from '@/lib/server/local';
import { getMenu } from '@/features/menu/queries';
import { linePrice } from '@/lib/pricing';
import { isValidAddress, isValidName, isValidPhone, isValidReferences } from '@/lib/validation';
import type { Cart, Order, OrderType, PaymentMethod, CartItemModifiers } from '@/lib/types';

export interface CreateOrderInput {
  location_id: string;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  payment_method: PaymentMethod;
  delivery_address?: string | null;
  delivery_references?: string | null;
  eta: string; // ISO
  cart: Cart;
  idempotency_key: string;
}

export interface CreateOrderResult {
  ok: boolean;
  error?: string;
  order?: Order;
  track_token?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const supabase = createServerClient();

  // 1. Validación de entrada
  if (!input.location_id) return { ok: false, error: 'Local no identificado' };
  if (!isValidName(input.customer_name)) return { ok: false, error: 'Nombre inválido' };
  if (!isValidPhone(input.customer_phone)) return { ok: false, error: 'Teléfono inválido' };
  if (!['RECOGER', 'DOMICILIO'].includes(input.order_type)) return { ok: false, error: 'Tipo de pedido inválido' };
  if (!['EFECTIVO_EXACTO', 'EFECTIVO_CON_CAMBIO', 'TARJETA_CONTRA_ENTREGA'].includes(input.payment_method)) {
    return { ok: false, error: 'Método de pago inválido' };
  }
  if (input.order_type === 'DOMICILIO' && !isValidAddress(input.delivery_address ?? '')) {
    return { ok: false, error: 'Dirección inválida para domicilio' };
  }
  if (!isValidReferences(input.delivery_references ?? null)) return { ok: false, error: 'Referencias demasiado largas' };
  if (!input.eta || Number.isNaN(Date.parse(input.eta))) return { ok: false, error: 'Hora estimada inválida' };
  if (!input.cart.items.length) return { ok: false, error: 'Carrito vacío' };
  if (!input.idempotency_key) return { ok: false, error: 'Falta idempotency key' };

  // 2. Idempotencia: buscar una orden previa con la misma key en los últimos 15 min
  const { data: existing } = await supabase
    .from('orders')
    .select('*')
    .eq('location_id', input.location_id)
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle();

  if (existing) {
    return { ok: true, order: existing as Order }; // ya se creó, no duplicar
  }

  // 3. Cargar local y menú para validar precios contra lo que envía el cliente
  const local = await getLocalById(input.location_id);
  if (!local) return { ok: false, error: 'Local no encontrado' };
  const { products } = await getMenu(input.location_id);

  // 4. Reconstruir el snapshot y recalcular precios desde la BD (nunca confiar en el cliente)
  const snapshotItems = [];
  let items_subtotal = 0;
  for (const item of input.cart.items) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return { ok: false, error: `Producto inválido: ${item.product_name}` };
    if (!product.is_available) return { ok: false, error: `${product.name} no está disponible` };

    // Validar modificadores contra la BD
    const mods: CartItemModifiers[] = [];
    for (const m of item.modifiers ?? []) {
      const group = product.modifier_groups?.find((g) => g.id === m.modifier_group_id);
      if (!group) return { ok: false, error: `Grupo de modificadores inválido: ${m.modifier_group_name}` };
      if (group.is_required && (!m.selections.length || m.selections.length < group.min_selections)) {
        return { ok: false, error: `${group.name} es obligatorio (mínimo ${group.min_selections})` };
      }
      if (group.max_selections > 0 && m.selections.length > group.max_selections) {
        return { ok: false, error: `${group.name} admite máximo ${group.max_selections}` };
      }
      const selections = m.selections.map((sel) => {
        const opt = group.options.find((o) => o.id === sel.option_id);
        if (!opt) return null;
        return {
          option_id: opt.id,
          option_name: opt.name,
          price_impact: Number(opt.price_impact),
          quantity: sel.quantity > 0 ? sel.quantity : 1,
        };
      });
      if (selections.some((s) => !s)) return { ok: false, error: `Opción inválida en ${group.name}` };
      mods.push({
        modifier_group_id: group.id,
        modifier_group_name: group.name,
        selections: selections as NonNullable<typeof selections[number]>[],
      });
    }

    const qty = item.quantity > 0 ? Math.floor(item.quantity) : 1;
    const itemPrice = linePrice({
      base_price: Number(product.base_price),
      quantity: qty,
      modifiers: mods.flatMap((m) => m.selections),
    });
    items_subtotal += itemPrice;

    snapshotItems.push({
      product_id: product.id,
      product_name: product.name,
      base_price: Number(product.base_price),
      quantity: qty,
      modifiers: mods,
    });
  }

  // 5. Calcular totales con el IVA del local
  // subtotal público = items_subtotal + delivery fee (si aplica)
  const deliveryFee = input.order_type === 'DOMICILIO' ? local.delivery_fee : 0;
  const subtotal = items_subtotal + deliveryFee;
  const iva_amount = Math.round(subtotal * (local.iva_rate / (1 + local.iva_rate)) * 100) / 100;
  const total = Math.round(subtotal * 100) / 100;

  // 6. Insertar orden (service role salta RLS)
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      location_id: input.location_id,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.trim(),
      order_type: input.order_type,
      payment_method: input.payment_method,
      delivery_address: input.order_type === 'DOMICILIO' ? (input.delivery_address ?? '').trim() || null : null,
      delivery_references: input.order_type === 'DOMICILIO' ? (input.delivery_references ?? '').trim() || null : null,
      eta: input.eta,
      status: 'CREADO',
      payment_status: 'PENDIENTE',
      subtotal,
      iva_amount,
      delivery_fee_amount: input.order_type === 'DOMICILIO' ? local.delivery_fee : 0,
      total,
      cart_snapshot: { version: '1', items: snapshotItems },
      idempotency_key: input.idempotency_key,
    })
    .select()
    .single();

  if (error || !order) {
    console.error('Error insertando order:', error?.message ?? 'sin datos');
    return { ok: false, error: 'No se pudo crear el pedido' };
  }

  revalidatePath('/');
  return { ok: true, order: order as Order };
}