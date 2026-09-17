// Tipos del dominio compartidos entre frontend y server actions.
// Espejan el esquema de Supabase (docs/schema.sql).

export type OrderType = 'RECOGER' | 'DOMICILIO';
export type OrderStatus =
  | 'CREADO'
  | 'CONFIRMADO_CAJA'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'LISTO_PARA_ENTREGA'
  | 'COMPLETADO'
  | 'CANCELADO';
export type PaymentMethod = 'EFECTIVO_EXACTO' | 'EFECTIVO_CON_CAMBIO' | 'TARJETA_CONTRA_ENTREGA';
export type PaymentStatus = 'PENDIENTE' | 'COBRADO';
export type ReservationStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'NO_SHOW';
export type DepositStatus = 'SIN_DEPOSITO' | 'DEPOSITO_PENDIENTE' | 'DEPOSITADO';
export type StaffRole = 'ADMIN' | 'CAJERO' | 'COCINERO';

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface Discount {
  id: string;
  location_id: string;
  code: string | null;
  description: string;
  discount_type: DiscountType;
  value: number;
  min_purchase: number;
  applies_to_product_ids: string[] | null;
  applies_to_category_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[] | null;
  time_of_day_start: string | null;
  time_of_day_end: string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  usage_limit_per_day: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface DiscountUsage {
  id: string;
  discount_id: string;
  order_id: string;
  customer_phone: string;
  applied_at: string;
  amount_applied: number;
}

export type Zone = 'INTERIOR' | 'TERRAZA' | 'BARRA';

// --- Catálogo ---
export interface Category {
  id: string;
  location_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ModifierOption {
  id: string;
  modifier_group_id: string;
  name: string;
  price_impact: number; // impacto en precio público (IVA incluido)
  is_active: boolean;
}

export interface ModifierGroup {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number; // 0 = sin límite
  options: ModifierOption[];
}

export interface Product {
  id: string;
  location_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number; // precio público, IVA incluido
  is_available: boolean;
  modifier_groups?: ModifierGroup[];
  allergens?: string[]; // nombres de alérgenos
  diet_labels?: string[]; // nombres de etiquetas dietarias
}

// --- Carrito / snapshot ---
export interface CartModifierSelection {
  option_id: string;
  option_name: string;
  price_impact: number;
  quantity: number;
}

export interface CartItemModifiers {
  modifier_group_id: string;
  modifier_group_name: string;
  selections: CartModifierSelection[];
}

export interface CartItem {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  modifiers: CartItemModifiers[];
}

export interface Cart {
  items: CartItem[];
}

export interface CartSnapshotItem extends CartItem {}
export interface CartSnapshot extends Cart {}

// --- Pedido ---
export interface Order {
  id: string;
  location_id: string;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  payment_method: PaymentMethod;
  delivery_address: string | null;
  delivery_references: string | null;
  eta: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number; // precios públicos (IVA incluido)
  iva_amount: number; // IVA interno (subtotal * rate/(1+rate))
  delivery_fee_amount: number;
  total: number; // subtotal + delivery_fee_amount
  cart_snapshot: CartSnapshot;
  delivery_zone: string | null;
  delivery_token: string | null; // UUID as string
  delivery_token_expires_at: string | null;
  delivery_token_rotated_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}