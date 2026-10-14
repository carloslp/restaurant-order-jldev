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
 * Extended Discount interface for the calculation engine to include current usage counts.
 */
export interface DiscountWithUsage extends Discount {
  current_usage_total?: number;
  current_usage_customer?: number;
  current_usage_day?: number;
}

/**
 * Evalúa la elegibilidad de un código de descuento y proporciona retroalimentación contextual específica (CA-2.4).
 */
export function evaluatePromoCodeEligibility(
  requestedCode: string,
  availableDiscounts: DiscountWithUsage[],
  subtotal: number
): { valid: boolean; reason?: string; missingAmount?: number; minPurchase?: number } {
  if (!requestedCode?.trim()) return { valid: false, reason: 'Código requerido' };

  const codeDiscount = availableDiscounts.find(
    (d) => d.code?.toLowerCase() === requestedCode.toLowerCase().trim()
  );

  if (!codeDiscount || !codeDiscount.is_active) {
    return { valid: false, reason: 'Cupón no válido o inactivo' };
  }

  if (subtotal < codeDiscount.min_purchase) {
    const missing = codeDiscount.min_purchase - subtotal;
    return {
      valid: false,
      reason: `Te faltan $${missing.toFixed(2)} para usar este cupón (mínimo $${codeDiscount.min_purchase.toFixed(2)})`,
      missingAmount: missing,
      minPurchase: codeDiscount.min_purchase,
    };
  }

  return { valid: true };
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
  availableDiscounts: DiscountWithUsage[],
  requestedCode?: string | null
): DiscountCalculation {
  let bestDiscount: { discount: DiscountWithUsage; saved: number; type: 'CODE' | 'AUTO' } | null = null;

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

function isDiscountEligible(discount: DiscountWithUsage, cart: Cart, subtotal: number): boolean {
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

  // 5. Time of day
  if (discount.time_of_day_start || discount.time_of_day_end) {
    const currentTime = now.toTimeString().slice(0, 5); // "HH:mm"
    if (discount.time_of_day_start && currentTime < discount.time_of_day_start) return false;
    if (discount.time_of_day_end && currentTime > discount.time_of_day_end) return false;
  }

  // 6. Usage Limits
  if (discount.usage_limit_total !== null && 
      discount.current_usage_total !== undefined && 
      discount.current_usage_total >= discount.usage_limit_total) {
    return false;
  }
  if (discount.usage_limit_per_customer !== null && 
      discount.current_usage_customer !== undefined && 
      discount.current_usage_customer >= discount.usage_limit_per_customer) {
    return false;
  }
  if (discount.usage_limit_per_day !== null && 
      discount.current_usage_day !== undefined && 
      discount.current_usage_day >= discount.usage_limit_per_day) {
    return false;
  }

  // 7. Scope check
  if ((discount.applies_to_product_ids?.length || 0) > 0 || (discount.applies_to_category_ids?.length || 0) > 0) {
    const hasEligibleItem = cart.items.some(item => {
      const productMatch = discount.applies_to_product_ids?.includes(item.product_id);
      // Note: Category check handled via product_ids in this client-side logic 
      // or expected to be pre-filtered by server action.
      return productMatch;
    });
    if (!hasEligibleItem) return false;
  }

  return true;
}

function calculateSavings(discount: DiscountWithUsage, cart: Cart, subtotal: number): number {
  if (discount.discount_type === 'FIXED_AMOUNT') {
    return Math.min(discount.value, subtotal);
  }

  if (discount.discount_type === 'PERCENTAGE') {
    if ((discount.applies_to_product_ids?.length || 0) === 0 && (discount.applies_to_category_ids?.length || 0) === 0) {
      return Math.round((subtotal * (discount.value / 100)) * 100) / 100;
    } else {
      let eligibleSum = 0;
      for (const item of cart.items) {
        if (discount.applies_to_product_ids?.includes(item.product_id)) {
          eligibleSum += (item.base_price || 0) * item.quantity;
        }
      }
      return Math.round((eligibleSum * (discount.value / 100)) * 100) / 100;
    }
  }

  return 0;
}
