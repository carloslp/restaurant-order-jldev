import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe('Database seed & auth linking verification', () => {
  let localId: string;
  let adminStaffId: string;

  beforeAll(async () => {
    // Find the demo local
    const { data: locals } = await supabase
      .from('locals')
      .select('id, name, subdomain')
      .eq('subdomain', 'localhost')
      .maybeSingle();

    expect(locals).not.toBeNull();
    localId = locals!.id;
    console.log('Found local:', locals);
  });

  it('should have the demo local with subdomain localhost', async () => {
    const { data, error } = await supabase
      .from('locals')
      .select('*')
      .eq('subdomain', 'localhost')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.subdomain).toBe('localhost');
    expect(data.name).toBe('Restaurante Demo JLDev');
  });

  it('should have 4 categories for the local', async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('location_id', localId)
      .eq('is_active', true);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(4);
    expect(data!.map(c => c.name).sort()).toEqual([
      'Acompañamientos',
      'Bebidas',
      'Hamburguesas',
      'Postres',
    ]);
  });

  it('should have 10 products for the local', async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('location_id', localId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(10);
    expect(data!.every(p => p.is_available === true)).toBe(true);
  });

  it('should have staff with auth_user_id linked', async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('location_id', localId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(3);

    const admin = data!.find(s => s.email === 'admin@demo.com');
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('ADMIN');
    expect(admin!.auth_user_id).not.toBeNull();
    expect(admin!.auth_user_id).not.toBe('');

    adminStaffId = admin!.id;
    console.log('Admin staff:', admin);
  });

  it('should have auth users matching staff emails', async () => {
    const { data: staff } = await supabase
      .from('staff')
      .select('email, auth_user_id')
      .eq('location_id', localId);

    for (const s of staff!) {
      const { data: authUser, error } = await supabase.auth.admin.getUserById(s.auth_user_id!);
      expect(error).toBeNull();
      expect(authUser.user).not.toBeNull();
      expect(authUser.user!.email).toBe(s.email);
      console.log(`Linked: ${s.email} -> ${s.auth_user_id}`);
    }
  });

  it('should have modifier groups and options for products', async () => {
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('location_id', localId);

    const productIds = products!.map(p => p.id);

    const { data: groups, error } = await supabase
      .from('modifier_groups')
      .select('*, options(*)')
      .in('product_id', productIds);

    expect(error).toBeNull();
    expect(groups).not.toBeNull();
    expect(groups!.length).toBeGreaterThan(0);

    // Each burger should have 3 modifier groups (Término, Extras, Salsas)
    const burgers = products!.filter(p => ['Clásica', 'Doble', 'Veggie'].includes(p.name));
    for (const burger of burgers) {
      const burgerGroups = groups!.filter(g => g.product_id === burger.id);
      expect(burgerGroups.length).toBe(3);
    }
  });

  it('should have allergens and diet labels linked to products', async () => {
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('location_id', localId);

    const productIds = products!.map(p => p.id);

    const { data: allergens, error: aError } = await supabase
      .from('product_allergens')
      .select('*')
      .in('product_id', productIds);

    expect(aError).toBeNull();
    expect(allergens!.length).toBeGreaterThan(0);

    const { data: dietLabels, error: dError } = await supabase
      .from('product_diet_labels')
      .select('*')
      .in('product_id', productIds);

    expect(dError).toBeNull();
    expect(dietLabels!.length).toBeGreaterThan(0);
  });

  it('should have local zone capacity configured', async () => {
    const { data, error } = await supabase
      .from('local_zone_capacity')
      .select('*')
      .eq('location_id', localId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(3);
    expect(data!.map(z => z.zone).sort()).toEqual(['BARRA', 'INTERIOR', 'TERRAZA']);
  });
});

describe('Admin API simulation (listProducts)', () => {
  let localId: string;
  let adminAuthUserId: string;

  beforeAll(async () => {
    const { data: local } = await supabase
      .from('locals')
      .select('id')
      .eq('subdomain', 'localhost')
      .single();
    localId = local!.id;

    const { data: admin } = await supabase
      .from('staff')
      .select('auth_user_id')
      .eq('email', 'admin@demo.com')
      .single();
    adminAuthUserId = admin!.auth_user_id;
  });

  it('should simulate getAdminContext and listProducts query', async () => {
    // Simulate what getAdminContext does: set app.local_id GUC
    await supabase.rpc('set_config', {
      name: 'app.local_id',
      value: localId,
      is_local: true,
    });

    // Simulate listProducts query
    const { data, error } = await supabase
      .from('products')
      .select('*, modifier_groups(id, name, is_required, min_selections, max_selections, options(id, name, price_impact, is_active))')
      .order('name', { ascending: true });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(10);

    // Verify structure
    const clasica = data!.find(p => p.name === 'Clásica');
    expect(clasica).not.toBeNull();
    expect(clasica!.modifier_groups).toHaveLength(3);
    expect(clasica!.modifier_groups[0].options).toHaveLength(3); // Término
  });
});