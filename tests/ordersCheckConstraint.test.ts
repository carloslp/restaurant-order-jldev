import { describe, it, expect, vi } from 'vitest';
import { updateOrderStatus } from '@/lib/server/order';
import * as authStaff from '@/app/staff/page';
import * as supabaseServer from '@/lib/supabase/server';

describe('Resiliencia de Check Constraints en Órdenes (AutoHeal 23514)', () => {
  it('debe autorreparar y reintentar si la base de datos devuelve error 23514 en updateOrderStatus', async () => {
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

    const mockUpdate = vi.fn().mockImplementation((payload) => {
      updateAttempts++;
      return {
        eq: vi.fn().mockImplementation(() => {
          if (updateAttempts === 1) {
            // Primer intento falla por check constraint (23514)
            return Promise.resolve({
              error: {
                code: '23514',
                message: 'new row violates check constraint "chk_eta_future"',
              },
            });
          }
          // Segundo intento (auto-sanitizado) tiene éxito
          expect(payload.eta).toBeDefined();
          return Promise.resolve({ error: null });
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
        return {};
      }),
    };

    vi.spyOn(supabaseServer, 'createServerClient').mockReturnValue(mockSupabase as any);

    const result = await updateOrderStatus('order-1', 'EN_PREPARACION');

    expect(result.ok).toBe(true);
    expect(updateAttempts).toBe(2);
  });
});
