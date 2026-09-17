// src/lib/pricing/discounts.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBestDiscount, DiscountWithUsage } from './discounts';
import type { Cart, Discount } from '@/lib/types';

const mockCart: Cart = {
  items: [
    {
      product_id: 'p1',
      product_name: 'Pizza',
      base_price: 100,
      quantity: 1,
      modifiers: [],
    },
    {
      product_id: 'p2',
      product_name: 'Refresco',
      base_price: 20,
      quantity: 2,
      modifiers: [],
    },
  ],
};

const mockDiscounts: DiscountWithUsage[] = [
  {
    id: 'd1',
    location_id: 'loc1',
    code: 'PROMO10',
    description: '10% Descuento',
    discount_type: 'PERCENTAGE',
    value: 10,
    min_purchase: 0,
    is_active: true,
    applies_to_product_ids: [],
    applies_to_category_ids: [],
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    time_of_day_start: null,
    time_of_day_end: null,
    usage_limit_total: null,
    usage_limit_per_customer: null,
    usage_limit_per_day: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  },
  {
    id: 'd2',
    location_id: 'loc1',
    code: null,
    description: 'Auto $5',
    discount_type: 'FIXED_AMOUNT',
    value: 5,
    min_purchase: 100,
    is_active: true,
    applies_to_product_ids: [],
    applies_to_category_ids: [],
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    time_of_day_start: null,
    time_of_day_end: null,
    usage_limit_total: null,
    usage_limit_per_customer: null,
    usage_limit_per_day: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  },
];

describe('calculateBestDiscount', () => {
  it('should apply promo code if provided and valid', () => {
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, mockDiscounts, 'PROMO10');
    expect(result.total_saved).toBe(14);
    expect(result.final_subtotal).toBe(126);
    expect(result.applied_discount?.type).toBe('CODE');
  });

  it('should apply automatic discount if no code is provided', () => {
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, mockDiscounts, null);
    expect(result.total_saved).toBe(5);
    expect(result.final_subtotal).toBe(135);
    expect(result.applied_discount?.type).toBe('AUTO');
  });

  it('should return no discount if subtotal is below minimum purchase', () => {
    const subtotal = 50;
    const result = calculateBestDiscount(mockCart, subtotal, mockDiscounts, null);
    expect(result.total_saved).toBe(0);
    expect(result.final_subtotal).toBe(50);
    expect(result.applied_discount).toBeNull();
  });

  it('should prioritize code over automatic discount', () => {
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, mockDiscounts, 'PROMO10');
    expect(result.applied_discount?.type).toBe('CODE');
    expect(result.total_saved).toBe(14);
  });

  it('should not apply inactive discounts', () => {
    const inactiveDiscounts = mockDiscounts.map(d => ({ ...d, is_active: false }));
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, inactiveDiscounts, 'PROMO10');
    expect(result.total_saved).toBe(0);
  });

  it('should respect total usage limits', () => {
    const limitedDiscount = [{ 
        ...mockDiscounts[1], 
        usage_limit_total: 10, 
        current_usage_total: 10 
    }];
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, limitedDiscount, null);
    expect(result.total_saved).toBe(0);
  });

  it('should respect customer usage limits', () => {
    const limitedDiscount = [{ 
        ...mockDiscounts[1], 
        usage_limit_per_customer: 1, 
        current_usage_customer: 1 
    }];
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, limitedDiscount, null);
    expect(result.total_saved).toBe(0);
  });

  it('should respect daily usage limits', () => {
    const limitedDiscount = [{ 
        ...mockDiscounts[1], 
        usage_limit_per_day: 5, 
        current_usage_day: 5 
    }];
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, limitedDiscount, null);
    expect(result.total_saved).toBe(0);
  });

  it('should apply scoped percentage discount only to eligible products', () => {
    const scopedDiscount: DiscountWithUsage[] = [{
      ...mockDiscounts[0],
      applies_to_product_ids: ['p1'], // Only Pizza (100)
      code: 'PIZZA10'
    }];
    const subtotal = 140; // Pizza(100) + Refrescos(40)
    const result = calculateBestDiscount(mockCart, subtotal, scopedDiscount, 'PIZZA10');
    expect(result.total_saved).toBe(10); // 10% of 100, not 140
    expect(result.final_subtotal).toBe(130);
  });

  it('should respect temporal windows (future start date)', () => {
    const futureDiscount = [{
      ...mockDiscounts[1],
      starts_at: new Date(Date.now() + 86400000).toISOString() // Tomorrow
    }];
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, futureDiscount, null);
    expect(result.total_saved).toBe(0);
  });

  it('should respect temporal windows (past end date)', () => {
    const expiredDiscount = [{
      ...mockDiscounts[1],
      ends_at: new Date(Date.now() - 86400000).toISOString() // Yesterday
    }];
    const subtotal = 140;
    const result = calculateBestDiscount(mockCart, subtotal, expiredDiscount, null);
    expect(result.total_saved).toBe(0);
  });
});
