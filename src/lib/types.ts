// Tipos compartidos entre cliente y servidor

export interface Local {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  iva_rate: number;     // Ej: 0.16 para 16%
  delivery_fee: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_open?: boolean;
  is_catalog_only?: boolean;
  reservations_enabled?: boolean;
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
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_open?: boolean;
  is_catalog_only?: boolean;
  reservations_enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Enums del esquema (docs/schema.sql)
// ---------------------------------------------------------------------------

export type OrderType = 'RECOGER' | 'DOMICILIO' | 'EN_MESA';

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

export type TableStatus = 'LIBRE' | 'RESERVADA' | 'OCUPADA' | 'EN_LIMPIEZA';

export type TableQrStatus = 'INACTIVO' | 'ABIERTO';

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
  comments?: string;
}

export interface Cart {
  items: CartItem[];
  location_id?: string | null;
  location_name?: string | null;
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
  notes?: string | null;
  eta: string; // ISO
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  iva_amount: number;
  delivery_fee_amount: number;
  total: number;
  cart_snapshot: OrderCartSnapshot;
  delivery_zone: string | null;
  table_id?: string | null;
  table_number?: string | null;
  session_id?: string | null;
  idempotency_key?: string | null;
  // Repartidor asignado (staff.id)
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

// ---------------------------------------------------------------------------
// Reservas y Aforo
// ---------------------------------------------------------------------------

export interface Reservation {
  id: string;
  location_id: string;
  holder_name: string;
  holder_phone: string;
  reservation_date: string; // YYYY-MM-DD
  reservation_time: string; // HH:mm
  party_size: number;
  preferred_zone: Zone;
  table_id?: string | null;
  table_ids?: string[] | null;
  table_number?: string | null;
  table_numbers?: string[] | null;
  status: ReservationStatus;
  deposit_status: DepositStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface ZoneCapacity {
  location_id: string;
  zone: Zone;
  capacity: number;
}

export interface RestaurantTable {
  id: string;
  location_id: string;
  zone: Zone;
  table_number: string;
  min_capacity: number;
  max_capacity: number;
  is_active: boolean;
  status: TableStatus;
  qr_status: TableQrStatus;
  qr_token: string;
  current_session_id?: string | null;
  current_guests?: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocalShift {
  id: string;
  location_id: string;
  day_of_week: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  shift_name: string; // Ej: 'Comida', 'Cena'
  open_time: string; // "13:00"
  close_time: string; // "17:00"
  slot_interval_minutes: number;
  turn_duration_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
  created_at?: string;
}

export interface PublicReservationInput {
  location_slug: string;
  holder_name: string;
  holder_phone: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  preferred_zone: Zone;
  table_id?: string | null;
  table_ids?: string[] | null;
  notes?: string | null;
}

export interface ZoneAvailabilityInfo {
  zone: Zone;
  capacity: number;
  reserved: number;
  available: number;
  canBook: boolean;
  availableTables?: RestaurantTable[];
}

export interface SlotAvailability {
  time: string; // "14:00"
  zones: Record<Zone, ZoneAvailabilityInfo>;
  isAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Fila de Espera Virtual (Waitlist / Walk-in)
// ---------------------------------------------------------------------------

export type WaitlistStatus = 'EN_ESPERA' | 'LLAMADO' | 'SENTADO' | 'CANCELADO' | 'NO_SHOW';
export type WaitlistZonePreference = Zone | 'CUALQUIERA';

export interface WaitlistParty {
  id: string;
  location_id: string;
  table_id?: string | null;
  table_ids?: string[] | null;
  table_number?: string | null;
  table_numbers?: string[] | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  preferred_zone: WaitlistZonePreference;
  status: WaitlistStatus;
  tracking_token: string;
  estimated_wait_minutes?: number | null;
  called_at?: string | null;
  seated_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JoinWaitlistInput {
  location_slug: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  preferred_zone: WaitlistZonePreference;
  notes?: string | null;
}

export interface PublicWaitlistStatusResponse {
  ok: boolean;
  party?: {
    id: string;
    customer_name: string;
    party_size: number;
    preferred_zone: WaitlistZonePreference;
    status: WaitlistStatus;
    position: number;
    totalWaiting: number;
    estimatedMinutes: number;
    called_at?: string | null;
    seated_at?: string | null;
    table_number?: string | null;
    table_numbers?: string[] | null;
    created_at: string;
  };
  localName?: string;
  localSlug?: string;
  error?: string;
}