// Unit tests de los módulos puros del dominio (sin DB, sin servidor).
// Cubre TODO 13 (engine de promos), 34 (pricing/tokens/validation/slugs).
import { describe, it, expect } from 'vitest';
import { calculateBestDiscount, type DiscountWithUsage } from '@/lib/pricing/discounts';
import { generateToken, hashToken, verifyToken } from '@/lib/tokens';
import { linePrice, pricing, round2 } from '@/lib/pricing';
import { isValidPhone, isValidName, isValidAddress, isValidReferences } from '@/lib/validation';
import { validateLocationSlug } from '@/lib/slugs';
import type { Cart, Discount } from '@/lib/types';

// --- helpers ---------------------------------------------------------------

function makeDiscount(over: Partial<DiscountWithUsage> & { id: string; description: string }): DiscountWithUsage {
  return {
    code: null,
    discount_type: 'PERCENTAGE',
    value: 10,
    min_purchase: 0,
    applies_to_product_ids: null,
    applies_to_category_ids: null,
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    time_of_day_start: null,
    time_of_day_end: null,
    usage_limit_total: null,
    usage_limit_per_customer: null,
    usage_limit_per_day: null,
    is_active: true,
    ...over,
  } as DiscountWithUsage;
}

function makeCart(items: Array<{ product_id: string; product_name: string; base_price: number; quantity: number }>): Cart {
  return {
    items: items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      base_price: i.base_price,
      quantity: i.quantity,
      modifiers: [],
    })),
  };
}

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';

// --- engine de promociones (tarea 13) ---------------------------------------

describe('calculateBestDiscount', () => {
  it('aplica un código exacto y no apila con automáticas (no-stacking)', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const code = makeDiscount({ id: 'c1', description: 'Código', code: 'BIENVENIDO10', value: 5 });
    const auto = makeDiscount({ id: 'a1', description: 'Auto 50%', value: 50 });
    const res = calculateBestDiscount(cart, 100, [auto, code], 'BIENVENIDO10');
    expect(res.applied_discount?.type).toBe('CODE');
    expect(res.total_saved).toBe(5);
    expect(res.final_subtotal).toBe(95);
  });

  it('el código es case-insensitive', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const code = makeDiscount({ id: 'c1', description: 'Código', code: 'bienvenido10', value: 10 });
    expect(calculateBestDiscount(cart, 100, [code], 'BIENVENIDO10').total_saved).toBe(10);
  });

  it('código inexistente no bloquea las automáticas', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const auto = makeDiscount({ id: 'a1', description: 'Auto 10%', value: 10 });
    const res = calculateBestDiscount(cart, 100, [auto], 'NOEXISTE');
    expect(res.applied_discount?.type).toBe('AUTO');
    expect(res.total_saved).toBe(10);
  });

  it('sin elegibles → sin descuento', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const res = calculateBestDiscount(cart, 100, [], 'X');
    expect(res.total_saved).toBe(0);
    expect(res.applied_discount).toBeNull();
    expect(res.final_subtotal).toBe(100);
  });

  it('porcentaje sobre el subtotal completo', () => {
    const cart = makeCart([
      { product_id: P1, product_name: 'Tacos', base_price: 150, quantity: 2 },
      { product_id: P2, product_name: 'Agua', base_price: 25, quantity: 1 },
    ]);
    const auto = makeDiscount({ id: 'a1', description: '10%', value: 10 });
    // subtotal = 150*2 + 25 = 325 → 10% = 32.5
    expect(calculateBestDiscount(cart, 325, [auto]).total_saved).toBe(32.5);
  });

  it('porcentaje con alcance: solo sobre productos elegibles', () => {
    const cart = makeCart([
      { product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 2 },
      { product_id: P2, product_name: 'Agua', base_price: 100, quantity: 1 },
    ]);
    const auto = makeDiscount({
      id: 'a1',
      description: '50% solo tacos',
      value: 50,
      applies_to_product_ids: [P1],
    });
    // elegible = 100*2 = 200 → 50% = 100 (el agua no cuenta)
    expect(calculateBestDiscount(cart, 300, [auto]).total_saved).toBe(100);
  });

  it('descuento fijo limitado al subtotal (nunca negativo)', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Agua', base_price: 30, quantity: 1 }]);
    const auto = makeDiscount({ id: 'a1', description: '50 pesos', discount_type: 'FIXED_AMOUNT', value: 50 });
    const res = calculateBestDiscount(cart, 30, [auto]);
    expect(res.total_saved).toBe(30);
    expect(res.final_subtotal).toBe(0);
  });

  it('mínimo de compra no alcanzado → no aplica', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Agua', base_price: 30, quantity: 1 }]);
    const auto = makeDiscount({ id: 'a1', description: 'min 200', value: 10, min_purchase: 200 });
    expect(calculateBestDiscount(cart, 30, [auto]).applied_discount).toBeNull();
  });

  it('ventana temporal: futura y pasada no aplican; activa sí', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const future = makeDiscount({ id: 'f', description: 'futura', value: 10, starts_at: new Date(Date.now() + 86400000).toISOString() });
    const past = makeDiscount({ id: 'p', description: 'pasada', value: 10, ends_at: new Date(Date.now() - 86400000).toISOString() });
    const active = makeDiscount({ id: 'ok', description: 'activa', value: 10, starts_at: new Date(Date.now() - 3600000).toISOString() });
    expect(calculateBestDiscount(cart, 100, [future]).applied_discount).toBeNull();
    expect(calculateBestDiscount(cart, 100, [past]).applied_discount).toBeNull();
    expect(calculateBestDiscount(cart, 100, [active]).total_saved).toBe(10);
  });

  it('día de la semana excluido no aplica', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const today = new Date().getDay();
    const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today);
    const excluded = makeDiscount({ id: 'x', description: 'otros días', value: 10, days_of_week: otherDays });
    expect(calculateBestDiscount(cart, 100, [excluded]).applied_discount).toBeNull();
  });

  it('límites de uso (total, cliente, día) agotados no aplican', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const total = makeDiscount({ id: 'x', description: 'total', value: 10, usage_limit_total: 5, current_usage_total: 5 });
    const cliente = makeDiscount({ id: 'y', description: 'cliente', value: 10, usage_limit_per_customer: 1, current_usage_customer: 1 });
    const dia = makeDiscount({ id: 'z', description: 'día', value: 10, usage_limit_per_day: 2, current_usage_day: 2 });
    expect(calculateBestDiscount(cart, 100, [total]).applied_discount).toBeNull();
    expect(calculateBestDiscount(cart, 100, [cliente]).applied_discount).toBeNull();
    expect(calculateBestDiscount(cart, 100, [dia]).applied_discount).toBeNull();
  });

  it('promo inactiva no aplica', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const off = makeDiscount({ id: 'x', description: 'pausada', value: 10, is_active: false });
    expect(calculateBestDiscount(cart, 100, [off]).applied_discount).toBeNull();
  });

  it('entre automáticas gana la que ahorra más', () => {
    const cart = makeCart([{ product_id: P1, product_name: 'Tacos', base_price: 100, quantity: 1 }]);
    const ten = makeDiscount({ id: 'a', description: '10%', value: 10 });
    const thirty = makeDiscount({ id: 'b', description: '30%', value: 30 });
    const res = calculateBestDiscount(cart, 100, [ten, thirty]);
    expect(res.applied_discount?.discount_id).toBe('b');
    expect(res.total_saved).toBe(30);
  });
});

// --- tokens -------------------------------------------------------------------

describe('tokens', () => {
  it('generateToken: longitud y alfabeto sin caracteres ambiguos', () => {
    const token = generateToken(12);
    expect(token).toHaveLength(12);
    expect(token).toMatch(/^[A-HJ-NP-Zabcdefghijkmnopqrstuvwxyz23456789]+$/);
    expect(token).not.toMatch(/[0O1lI]/);
  });

  it('generateToken: dos llamadas generan tokens distintos', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('hashToken/verifyToken: roundtrip ok', () => {
    const token = generateToken(10);
    const hash = hashToken(token);
    expect(hash.startsWith('$2')).toBe(true);
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken(generateToken(10), hash)).toBe(false);
  });

  it('verifyToken con hash inválido devuelve false sin lanzar', () => {
    expect(verifyToken('abc', '')).toBe(false);
    expect(verifyToken('abc', 'no-es-bcrypt')).toBe(false);
  });
});

// --- pricing ------------------------------------------------------------------

describe('pricing', () => {
  it('linePrice: base + modificadores × cantidad', () => {
    expect(
      linePrice({
        base_price: 50,
        quantity: 2,
        modifiers: [
          { price_impact: 10, quantity: 1 },
          { price_impact: 5, quantity: 2 },
        ],
      })
    ).toBe((50 + 10 + 10) * 2);
  });

  it('pricing: IVA interno = subtotal * rate/(1+rate)', () => {
    const res = pricing({ base_price: 100, quantity: 1, modifiers: [], iva_rate: 0.16, delivery_fee: 0 });
    // 100 * 0.16/1.16 = 13.7931... → 13.79
    expect(res.iva_amount).toBe(13.79);
    expect(res.total).toBe(100);
  });

  it('pricing: envío suma al subtotal y al IVA interno', () => {
    const res = pricing({ base_price: 100, quantity: 1, modifiers: [], iva_rate: 0.16, delivery_fee: 30 });
    expect(res.subtotal).toBe(130);
    expect(res.iva_amount).toBe(round2(130 * (0.16 / 1.16)));
  });

  it('round2 redondea a 2 decimales', () => {
    expect(round2(13.79555)).toBe(13.8);
    expect(round2(0.005)).toBe(0.01);
  });
});

// --- validation ----------------------------------------------------------------

describe('validation', () => {
  it('teléfonos válidos e inválidos', () => {
    expect(isValidPhone('5512345678')).toBe(true);
    expect(isValidPhone('+52 55 1234 5678')).toBe(true);
    expect(isValidPhone('(55) 1234-5678')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abcdefghij')).toBe(false);
  });

  it('nombres: mínimo 2 chars tras trim', () => {
    expect(isValidName('Juan')).toBe(true);
    expect(isValidName('  Ana  ')).toBe(true);
    expect(isValidName('A')).toBe(false);
    expect(isValidName('   ')).toBe(false);
  });

  it('direcciones: mínimo 5 chars', () => {
    expect(isValidAddress('Av. Reforma 123')).toBe(true);
    expect(isValidAddress('Calle')).toBe(true); // 5 chars exactos = válido
    expect(isValidAddress('C 12')).toBe(false); // 4 chars
    expect(isValidAddress('   ')).toBe(false);
  });

  it('referencias: opcional, máx 120', () => {
    expect(isValidReferences(null)).toBe(true);
    expect(isValidReferences('')).toBe(true);
    expect(isValidReferences('Portón azul')).toBe(true);
    expect(isValidReferences('x'.repeat(121))).toBe(false);
  });
});

// --- slugs ----------------------------------------------------------------------

describe('validateLocationSlug', () => {
  it('rechaza cortos, largos, mayúsculas y caracteres inválidos', () => {
    expect(validateLocationSlug('ab')).toMatch(/al menos 3/);
    expect(validateLocationSlug('a'.repeat(64))).toMatch(/Máximo/);
    expect(validateLocationSlug('Centro')).toMatch(/minúsculas/);
    expect(validateLocationSlug('centro!')).toMatch(/minúsculas/);
  });

  it('rechaza rutas reservadas del sistema', () => {
    for (const r of ['api', 'staff', 'login', 'setup', 'track', 'checkout']) {
      expect(validateLocationSlug(r)).toMatch(/reservada/);
    }
  });

  it('acepta slugs válidos y rechaza espacios', () => {
    expect(validateLocationSlug('centro')).toBeNull();
    expect(validateLocationSlug('plaza-norte-2')).toBeNull();
    expect(validateLocationSlug('plaza- norte-2')).not.toBeNull();
  });
});
