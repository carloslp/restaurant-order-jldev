// Acciones de servidor para pedidos (checkout público).
// - Validación de entrada
// - Idempotencia (evitar duplicados por doble submit)
// - Persistencia con service role (salta RLS para insert)
// - Generación de token de reparto
// - Aplicación de descuentos y promociones

'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { getLocalById } from '@/lib/server/local';
import { getMenu } from '@/features/menu/queries';
import { linePrice } from '@/lib/pricing';
import { isValidAddress, isValidName, isValidPhone, isValidReferences } from '@/lib/validation';
import { generateToken, hashToken } from '@/lib/tokens';
import { calculateBestDiscount } from '@/lib/pricing/discounts';
import { calculateDeliveryFee } from '@/lib/osm/distanceMatrix';
import type { Coordinates } from '@/lib/pricing/deliveryMatrix';
import type { Cart, Order, OrderType, PaymentMethod, CartItemModifiers, Discount } from '@/lib/types';

export interface CreateOrderInput {
  location_id: string; // ID de la location (path), revalidado server-side contra la DB
  customer_name?: string;
  customer_phone?: string;
  order_type: OrderType;
  table_id?: string | null;
  table_number?: string | null;
  session_id?: string | null;
  payment_method: PaymentMethod;
  delivery_address?: string | null;
  delivery_references?: string | null;
  notes?: string | null;
  eta: string; // ISO
  cart: Cart;
  idempotency_key?: string; // Made optional as column missing in orders table
  promo_code?: string | null; // Added for Task 11
}

export interface CreateOrderResult {
  ok: boolean;
  error?: string;
  order?: Order;
  track_token?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // Revalidar la location contra la DB (el cliente la pasa, el server decide).
  // La location se maneja por path: el cliente la obtiene de /{location}/checkout.
  const local = await getLocalById(input.location_id);
  if (!local) {
    return { ok: false, error: 'Local no identificado' };
  }
  if (local.is_open === false) {
    return { ok: false, error: 'Esta sucursal se encuentra cerrada para pedidos en este momento.' };
  }
  if (local.is_catalog_only) {
    return { ok: false, error: 'Esta sucursal tiene el menú en modo solo visualización. No se aceptan pedidos en línea.' };
  }
  const location_id = local.id;

  // FEATURE F-03: Protección multisede: verificar que el carrito no pertenezca a otra sucursal
  if (input.cart.location_id && input.cart.location_id !== location_id) {
    return {
      ok: false,
      error: 'Los productos en tu carrito pertenecen a otra sucursal. Por favor vacía tu carrito para continuar.',
    };
  }

  const supabase = createServerClient();

  // 1. Validación de entrada
  if (input.order_type === 'EN_MESA') {
    if (input.customer_name && !isValidName(input.customer_name)) {
      return { ok: false, error: 'Nombre inválido' };
    }
  } else {
    if (!isValidName(input.customer_name ?? '')) return { ok: false, error: 'Nombre inválido' };
    if (!isValidPhone(input.customer_phone ?? '')) return { ok: false, error: 'Teléfono inválido' };
  }
  if (!['RECOGER', 'DOMICILIO', 'EN_MESA'].includes(input.order_type)) return { ok: false, error: 'Tipo de pedido inválido' };
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

  // 2. Generar tokens:
  // - deliveryTokenUuid → SEGUIMIENTO DEL CLIENTE: UUID que vive en
  //   orders.delivery_token y alimenta el link /track/{uuid} (solo lectura).
  // - plainToken → REPARTIDOR: token de un solo uso que se guarda SOLO hasheado
  //   en delivery_tokens. NO se devuelve al cliente: su link se genera desde
  //   Caja (regenerateDeliveryToken → /track/repartidor/{token}) cuando se
  //   necesita compartirlo, después del pedido.
  const deliveryTokenUuid = randomUUID();
  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 horas

  // 3. Idempotencia: omitido temporalmente ya que la columna no existe en la BD
  // const { data: existing } = await supabase
  //   .from('orders')
  //   .select('*')
  //   .eq('location_id', location_id)
  //   .eq('idempotency_key', input.idempotency_key)
  //   .maybeSingle();
  //
  // if (existing) {
  //   return { ok: true, order: existing as Order };
  // }

  // 4. Cargar local y menú para validar precios contra lo que envía el cliente
  const { products } = await getMenu(location_id);
  
  // Fetch available discounts for this location
  const { data: discounts, error: discError } = await supabase
    .from('discounts')
    .select('*')
    .eq('location_id', location_id)
    .eq('is_active', true);

  if (discError) {
    console.error('Error fetching discounts:', discError);
    // We continue without discounts rather than failing the whole order
  }

  // 5. Reconstruir el snapshot y recalcular precios desde la BD (nunca confiar en el cliente)
  const snapshotItems = [];
  let items_subtotal = 0;
  for (const item of input.cart.items) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) return { ok: false, error: `El producto "${item.product_name}" ya no está disponible en el menú. Remuévelo o reemplázalo para continuar.` };
    if (!product.is_available) {
      return {
        ok: false,
        error: `El platillo "${product.name}" se ha agotado. Por favor remuévelo o reemplázalo en tu carrito para continuar con el pedido.`,
      };
    }

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
      comments: item.comments?.trim() || undefined,
    });
  }

  // 6. Calcular descuentos
  const discountResult = calculateBestDiscount(
    input.cart,
    items_subtotal,
    (discounts || []) as Discount[],
    input.promo_code
  );
  
  const discountedSubtotal = discountResult.final_subtotal;

  // 7. Calcular costo de envío por matriz de distancia (si es a DOMICILIO)
  let deliveryFee = 0;
  let deliveryZone: string | null = null;

  if (input.order_type === 'DOMICILIO') {
    const origin: Coordinates =
      local.latitude != null && local.longitude != null
        ? { lat: local.latitude, lng: local.longitude }
        : { lat: 19.432608, lng: -99.143612 }; // Fallback CDMX Centro demo

    const deliveryResult = await calculateDeliveryFee({
      origin,
      destinationAddress: input.delivery_address,
      localFallbackFee: local.delivery_fee,
    });

    if (!deliveryResult.isDeliverable) {
      return {
        ok: false,
        error: deliveryResult.reason ?? 'La dirección está fuera de nuestra zona de cobertura.',
      };
    }

    deliveryFee = deliveryResult.fee;
    deliveryZone = deliveryResult.zoneName;
  }

  if (input.order_type === 'EN_MESA' && input.table_id) {
    const { data: tbl } = await supabase
      .from('restaurant_tables')
      .select('id, qr_status, table_number')
      .eq('id', input.table_id)
      .eq('location_id', location_id)
      .maybeSingle();

    if (tbl && tbl.qr_status !== 'ABIERTO') {
      return {
        ok: false,
        error: `La mesa ${tbl.table_number || ''} no tiene una sesión QR abierta en este momento. Por favor avisa al mesero para abrir tu mesa.`,
      };
    }
  }

  const subtotal = discountedSubtotal;
  const iva_amount = Math.round(subtotal * (local.iva_rate / (1 + local.iva_rate)) * 100) / 100;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  // 8. Insertar orden (service role salta RLS)
  // Si es comanda de mesa, pasa directo a EN_PREPARACION para que caiga de inmediato a cocina
  const initialStatus = input.order_type === 'EN_MESA' ? 'EN_PREPARACION' : 'CREADO';

  const resolvedCustomerName = input.order_type === 'EN_MESA'
    ? (input.table_number
        ? (input.customer_name?.trim() && !input.customer_name.startsWith(`Mesa ${input.table_number}`)
            ? `Mesa ${input.table_number} · ${input.customer_name.trim()}`
            : (input.customer_name?.trim() || `Mesa ${input.table_number}`))
        : (input.customer_name?.trim() || 'Mesa Salón'))
    : (input.customer_name ?? '').trim();

  const resolvedCustomerPhone = input.order_type === 'EN_MESA'
    ? (input.customer_phone?.trim() || '0000000000')
    : (input.customer_phone ?? '').trim();

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      location_id,
      customer_name: resolvedCustomerName,
      customer_phone: resolvedCustomerPhone,
      order_type: input.order_type,
      table_id: input.table_id || null,
      session_id: input.session_id || null,
      payment_method: input.payment_method,
      delivery_address: input.order_type === 'DOMICILIO' ? (input.delivery_address ?? '').trim() || null : null,
      delivery_references: input.order_type === 'DOMICILIO' ? (input.delivery_references ?? '').trim() || null : null,
      eta: input.eta,
      status: initialStatus,
      payment_status: 'PENDIENTE',
      subtotal,
      iva_amount,
      delivery_fee_amount: deliveryFee,
      total,
      cart_snapshot: { version: '1', items: snapshotItems, notes: input.notes?.trim() || null },
      delivery_zone: deliveryZone,
      delivery_token: deliveryTokenUuid,
      delivery_token_expires_at: expiresAt,
      delivery_token_rotated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !order) {
    console.error('createOrder/insert:', error);
    // Nunca exponer el error crudo de la DB al cliente público.
    return { ok: false, error: 'No se pudo crear el pedido. Verifica tus datos e inténtalo de nuevo.' };
  }

  // 9. Registrar uso del descuento si se aplicó uno
  if (discountResult.applied_discount) {
    const { error: usageError } = await supabase
      .from('discount_usages')
      .insert({
        discount_id: discountResult.applied_discount.discount_id,
        order_id: order.id,
        customer_phone: resolvedCustomerPhone,
        amount_applied: discountResult.total_saved,
      });
    if (usageError) console.error('Failed to record discount usage:', usageError);
  }

  // 10. Insertar registro de token de reparto
  const { error: tokenError } = await supabase
    .from('delivery_tokens')
    .insert({
      order_id: order.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (tokenError) {
    console.error('createOrder/deliveryToken:', tokenError);
    return { ok: false, error: 'No se pudo generar el enlace de seguimiento. Inténtalo de nuevo.' };
  }

  revalidatePath('/');

  // 11. El cliente recibe SU link de seguimiento: el UUID de
  // orders.delivery_token, que /track/[token] resuelve en modo cliente
  // (stepper "Seguimiento en Vivo", solo lectura). El token del repartidor
  // queda hasheado en delivery_tokens; su link se genera desde Caja cuando se
  // necesite (regenerateDeliveryToken), no aquí.
  const trackToken = (order as Order).delivery_token ?? deliveryTokenUuid;
  return { ok: true, order: order as Order, track_token: trackToken };
}
