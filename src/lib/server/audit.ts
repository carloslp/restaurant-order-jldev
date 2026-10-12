// src/lib/server/audit.ts
import { createServerClient } from '@/lib/supabase/server';

export interface AuditLogEntry {
  locationId?: string | null;
  staffId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Registra una acción de staff en la tabla audit_log para trazabilidad y cumplimiento.
 * Falla de manera silenciosa en log para no bloquear la operación de negocio si la tabla aún no existe.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('audit_log').insert({
      location_id: entry.locationId ?? null,
      staff_id: entry.staffId ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
    });

    if (error) {
      console.warn('[AuditLog] No se pudo guardar el registro de auditoría:', error.message);
    }
  } catch (err) {
    console.warn('[AuditLog] Error inesperado registrando auditoría:', err);
  }
}
