import { describe, it, expect, vi } from 'vitest';
import { updateOrderStatus } from '@/lib/server/order';
import * as authStaff from '@/app/staff/page';
import * as supabaseServer from '@/lib/supabase/server';

describe('Integridad de Check Constraints en Órdenes (Rechazo Explícito 23514)', () => {
  it('debe fallar explícitamente y reportar error si la base de datos devuelve error 23514 en updateOrderStatus', async () => {
    // Mock staff
    vi.spyOn(authStaff, 'getCurrentStaff').mockResolvedValue({
      user: { id: 'user-1' } as any,
      staff: { id: 'staff-1', location_id: 'loc-1', role: 'COCINERO' } as any,
      local: { id: 'loc-1', name: 'Centro' } as any,
    });

    let updateAttempts = 0;
    const mockOrder = {
      id: 'order-1',
      status: 'CONFIRMADO_CAJA',
      location_id: 'loc-1',
      subtotal: 100,
      delivery_fee_amount: 20,
      total: 120,
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
      }),
    });

    const mockUpdate = vi.fn().mockImplementation(() => {
      updateAttempts++;
      return {
        eq: vi.fn().mockImplementation(() => {
          return Promise.resolve({
            error: {
              code: '23514',
              message: 'new row violates check constraint "chk_total_consistency"',
            },
          });
        }),
      };
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: mockSelect,
            update: mockUpdate,
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    };

    vi.spyOn(supabaseServer, 'createServerClient').mockReturnValue(mockSupabase as any);

    const result = await updateOrderStatus('order-1', 'EN_PREPARACION');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('inconsistencias de datos');
    // No debe haber intentado un segundo update silencioso
    expect(updateAttempts).toBe(1);
  });
});
