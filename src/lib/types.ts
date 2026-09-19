// Tipos compartidos entre cliente y servidor

export interface Local {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;     // Ej: 0.16 para 16%
  delivery_fee: number;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  location_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface StaffFormData {
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface LocalFormData {
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
}

// ---------------------------------------------------------------------------
// Enums del esquema (docs/schema.sql)
// ---------------------------------------------------------------------------

export type OrderType = 'RECOGER' | 'DOMICILIO';

export type PaymentMethod = 'EFECTIVO_EXACTO' | 'EFECTIVO_CON_CAMBIO' | 'TARJETA_CONTRA_ENTREGA';

export type OrderStatus =
  | 'CREADO'
  | 'CONFIRMADO_CAJA'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'LISTO_PARA_ENTREGA'
  | 'COMPLETADO'
  | 'CANCELADO';

export type PaymentStatus = 'PENDIENTE' | 'COBRADO';

export type ReservationStatus = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'NO_SHOW';

export type DepositStatus = 'SIN_DEPOSITO' | 'DEPOSITO_PENDIENTE' | 'DEPOSITADO';

export type Zone = 'INTERIOR' | 'TERRAZA' | 'BARRA';

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

// ---------------------------------------------------------------------------
// Menú (catálogo)
// created_at/updated_at opcionales: algunos constructores en cliente no los traen.
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  location_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ModifierOption {
  id: string;
  location_id: string;
  modifier_group_id: string;
  name: string;
  price_impact: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ModifierGroup {
  id: string;
  location_id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number; // 0 = sin límite
  options: ModifierOption[];
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  location_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  is_available: boolean;
  created_at?: string;
  updated_at?: string;
  // Enriquecidos por las queries (no columnas de la tabla):
  modifier_groups?: ModifierGroup[];
  allergens?: string[];
  diet_labels?: string[];
}

// ---------------------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------------------

export interface CartItemSelection {
  option_id: string;
  option_name: string;
  price_impact: number;
  quantity: number;
}

export interface CartItemModifiers {
  modifier_group_id: string;
  modifier_group_name: string;
  selections: CartItemSelection[];
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

// ---------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------

export interface OrderCartSnapshot {
  version: string;
  items: CartItem[];
}

export interface Order {
  id: string;
  location_id: string;
  customer_name: string;
  customer_phone: string;
  order_type: OrderType;
  payment_method: PaymentMethod;
  delivery_address: string | null;
  delivery_references: string | null;
  eta: string; // ISO
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  iva_amount: number;
  delivery_fee_amount: number;
  total: number;
  cart_snapshot: OrderCartSnapshot;
  delivery_zone: string | null;
  // Repartidor asignado (requiere docs/migration-driver-id.sql; opcional para
  // compatibilidad mientras la migración se aplica).
  driver_id?: string | null;
  delivery_token: string | null;
  delivery_token_expires_at: string | null;
  delivery_token_rotated_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// Descuentos (engine completo)
// ---------------------------------------------------------------------------

export interface Discount {
  id: string;
  location_id: string;
  code: string | null; // NULL = promo automática
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
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}