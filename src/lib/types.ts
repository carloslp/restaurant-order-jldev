// Tipos compartidos entre cliente y servidor

export interface Local {
  id: string;
  name: string;
  subdomain: string;
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
  subdomain: string;
  timezone: string;
  iva_rate: number;
  delivery_fee: number;
}