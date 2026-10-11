vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { describe, it, expect, vi } from 'vitest';
import { 
  joinPublicWaitlist, 
  getWaitlistStatusByToken, 
  seatWaitlistParty 
} from '@/lib/server/waitlist';
import * as localServer from '@/lib/server/local';
import * as authStaff from '@/app/staff/page';
import * as supabaseServer from '@/lib/supabase/server';

describe('Sistema de Fila de Espera Virtual (Waitlist)', () => {
  it('permite a un comensal unirse a la fila y calcula su posición y token de seguimiento', async () => {
    vi.spyOn(localServer, 'getLocalBySlug').mockResolvedValue({
      id: 'local-1',
      name: 'Centro',
      slug: 'centro',
      is_open: true,
    } as any);

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'waitlist-1', tracking_token: 'token-uuid-123' },
          error: null,
        }),
      }),
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'waitlist') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 2, error: null }),
              }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseServer, 'createServerClient').mockReturnValue(mockSupabase as any);

    const result = await joinPublicWaitlist({
      location_slug: 'centro',
      customer_name: 'Familia Ramírez',
      customer_phone: '6671234567',
      party_size: 4,
      preferred_zone: 'INTERIOR',
      notes: 'Carriola',
    });

    expect(result.ok).toBe(true);
    expect(result.trackingToken).toBe('token-uuid-123');
    expect(result.position).toBe(3); // 2 previos + 1
    expect(result.estimatedMinutes).toBe(30);
  });

  it('permite al hostess sentar al comensal en una mesa física disponible', async () => {
    vi.spyOn(authStaff, 'getCurrentStaff').mockResolvedValue({
      user: { id: 'user-1' } as any,
      staff: { id: 'staff-1', location_id: 'local-1', role: 'HOSTESS' } as any,
      local: { id: 'local-1', name: 'Centro' } as any,
    });

    const mockTableUpdate = vi.fn().mockResolvedValue({ error: null });
    const mockWaitlistUpdate = vi.fn().mockResolvedValue({ error: null });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'waitlist') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'waitlist-1', party_size: 4, customer_name: 'Familia Ramírez' },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockWaitlistUpdate,
            }),
          };
        }
        if (table === 'restaurant_tables') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: mockTableUpdate,
              }),
            }),
          };
        }
        return {};
      }),
    };

    vi.spyOn(supabaseServer, 'createServerClient').mockReturnValue(mockSupabase as any);

    const result = await seatWaitlistParty('waitlist-1', 'table-4');
    expect(result.ok).toBe(true);
  });
});
