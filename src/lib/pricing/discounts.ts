// src/lib/pricing/discounts.ts
import type { Discount, Cart, Order } from '@/lib/types';

export interface AppliedDiscount {
  discount_id: string;
  description: string;
  amount_saved: number;
  type: 'CODE' | 'AUTO' | 'MANUAL';
}

export interface DiscountCalculation {
  final_subtotal: number;
  total_saved: number;
  applied_discount: AppliedDiscount | null;
}

/**
 * Evaluates a cart against a set of potential discounts.
 * Rules:
 * 1. Priority: Promo Code > Automatic > Manual.
 * 2. Only one discount can be applied (no stacking).
 * 3. Validates temporal windows, minimum purchase, and scope.
 */
export function calculateBestDiscount(
  cart: Cart,
  currentSubtotal: number,
  availableDiscounts: Discount[],
  requestedCode?: string | null
): DiscountCalculation {
  let bestDiscount: { discount: Discount; saved: number; type: 'CODE' | 'AUTO' } | null = null;

  // 1. Try to find a matching Promo Code first (Highest Priority)
  if (requestedCode) {
    const codeDiscount = availableDiscounts.find(d => d.code?.toLowerCase() === requestedCode?.toLowerCase());
    if (codeDiscount && isDiscountEligible(codeDiscount, cart, currentSubtotal)) {
      const saved = calculateSavings(codeDiscount, cart, currentSubtotal);
      return {
        final_subtotal: currentSubtotal - saved,
        total_saved: saved,
        applied_discount: {
          discount_id: codeDiscount.id,
          description: codeDiscount.description,
          amount_saved: saved,
          type: 'CODE',
        },
      };
    }
  }

  // 2. Try Automatic Discounts
  const autoDiscounts = availableDiscounts.filter(d => !d.code);
  for (const d of autoDiscounts) {
    if (isDiscountEligible(d, cart, currentSubtotal)) {
      const saved = calculateSavings(d, cart, currentSubtotal);
      if (!bestDiscount || saved > bestDiscount.saved) {
        bestDiscount = { discount: d, saved, type: 'AUTO' };
      }
    }
  }

  if (bestDiscount) {
    return {
      final_subtotal: currentSubtotal - bestDiscount.saved,
      total_saved: bestDiscount.saved,
      applied_discount: {
        discount_id: bestDiscount.discount.id,
        description: bestDiscount.discount.description,
        amount_saved: bestDiscount.saved,
        type: bestDiscount.type,
      },
    };
  }

  return {
    final_subtotal: currentSubtotal,
    total_saved: 0,
    applied_discount: null,
  };
}

function isDiscountEligible(discount: Discount, cart: Cart, subtotal: number): boolean {
  // 1. Basic state
  if (!discount.is_active) return false;

  // 2. Minimum purchase
  if (subtotal < discount.min_purchase) return false;

  // 3. Temporal window (Date)
  const now = new Date();
  if (discount.starts_at && new Date(discount.starts_at) > now) return false;
  if (discount.ends_at && new Date(discount.ends_at) < now) return false;

  // 4. Day of week
  if (discount.days_of_week && discount.days_of_week.length > 0) {
    const today = now.getDay(); // 0-6
    if (!discount.days_of_week.includes(today)) return false;
  }

  // 5. Time of day (Simplified check)
  if (discount.time_of_day_start || discount.time_of_day_end) {
    const currentTime = now.toTimeString().slice(0, 5); // "HH:mm"
    if (discount.time_of_day_start && currentTime < discount.time_of_day_start) return false;
    if (discount.time_of_day_end && currentTime > discount.time_of_day_end) return false;
  }

  // 6. Scope check (if it applies to specific products/categories)
  // If both are empty, it applies to the whole order.
  if ((discount.applies_to_product_ids?.length || 0) > 0 || (discount.applies_to_category_ids?.length || 0) > 0) {
    const hasEligibleItem = cart.items.some(item => {
      const productMatch = discount.applies_to_product_ids?.includes(item.product_id);
      // Note: Category check would require fetching product categories, 
      // which is usually done at the server level before calling this.
      // For now, we assume product_ids are the primary scope.
      return productMatch;
    });
    if (!hasEligibleItem) return false;
  }

  return true;
}

function calculateSavings(discount: Discount, cart: Cart, subtotal: number): number {
  if (discount.discount_type === 'FIXED_AMOUNT') {
    return Math.min(discount.value, subtotal);
  }

  if (discount.discount_type === 'PERCENTAGE') {
    // If it's a general discount, apply to subtotal.
    // If it's scoped to products, it should only apply to those products.
    if ((discount.applies_to_product_ids?.length || 0) === 0 && (discount.applies_to_category_ids?.length || 0) === 0) {
      return Math.round((subtotal * (discount.value / 100)) * 100) / 100;
    } else {
      // Scoped percentage: sum of eligible items * percentage
      let eligibleSum = 0;
      for (const item of cart.items) {
        if (discount.applies_to_product_ids?.includes(item.product_id)) {
          // Simple approximation: base price * qty. 
          // Better to pass the calculated line prices from the order engine.
          eligibleSum += (item.base_price || 0) * item.quantity;
        }
      }
      return Math.round((eligibleSum * (discount.value / 100)) * 100) / 100;
    }
  }

  return 0;
}
