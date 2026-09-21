// Tests unitarios de cálculo de costo de envío por distancia y matriz con OSM
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateDeliveryMatrix,
  DEFAULT_DELIVERY_MATRIX,
  TEST_DELIVERY_SCENARIOS,
  type Coordinates,
  type DeliveryMatrixConfig,
} from '@/lib/pricing/deliveryMatrix';
import {
  calculateHaversineDistanceKm,
  calculateDeliveryFee,
  getOsmDistanceMatrix,
} from '@/lib/osm/distanceMatrix';

describe('evaluateDeliveryMatrix', () => {
  it('aplica Zona 1 (0 a 2 km) con costo $25', () => {
    const res0 = evaluateDeliveryMatrix(0);
    expect(res0.isDeliverable).toBe(true);
    expect(res0.zoneName).toBe('Zona 1 (0 - 2 km)');
    expect(res0.fee).toBe(25);

    const res1 = evaluateDeliveryMatrix(1.5);
    expect(res1.isDeliverable).toBe(true);
    expect(res1.zoneName).toBe('Zona 1 (0 - 2 km)');
    expect(res1.fee).toBe(25);

    const res2 = evaluateDeliveryMatrix(2.0);
    expect(res2.isDeliverable).toBe(true);
    expect(res2.zoneName).toBe('Zona 1 (0 - 2 km)');
    expect(res2.fee).toBe(25);
  });

  it('aplica Zona 2 (2 a 5 km) con costo $40', () => {
    const res = evaluateDeliveryMatrix(2.01);
    expect(res.isDeliverable).toBe(true);
    expect(res.zoneName).toBe('Zona 2 (2 - 5 km)');
    expect(res.fee).toBe(40);

    const resMid = evaluateDeliveryMatrix(4.2);
    expect(resMid.fee).toBe(40);

    const res5 = evaluateDeliveryMatrix(5.0);
    expect(res5.fee).toBe(40);
  });

  it('aplica Zona 3 (5 a 8 km) con costo $60', () => {
    const res = evaluateDeliveryMatrix(6.5);
    expect(res.isDeliverable).toBe(true);
    expect(res.zoneName).toBe('Zona 3 (5 - 8 km)');
    expect(res.fee).toBe(60);
  });

  it('aplica Zona 4 (8 a 12 km) con costo $85', () => {
    const res = evaluateDeliveryMatrix(10.5);
    expect(res.isDeliverable).toBe(true);
    expect(res.zoneName).toBe('Zona 4 (8 - 12 km)');
    expect(res.fee).toBe(85);
  });

  it('aplica Zona 5 (12 a 15 km) con costo $120', () => {
    const res = evaluateDeliveryMatrix(13.8);
    expect(res.isDeliverable).toBe(true);
    expect(res.zoneName).toBe('Zona 5 (12 - 15 km)');
    expect(res.fee).toBe(120);

    const res15 = evaluateDeliveryMatrix(15.0);
    expect(res15.fee).toBe(120);
  });

  it('marca como no entregable si supera el radio máximo (15 km)', () => {
    const res151 = evaluateDeliveryMatrix(15.01);
    expect(res151.isDeliverable).toBe(false);
    expect(res151.zoneName).toBe('Fuera de cobertura');
    expect(res151.fee).toBe(0);
    expect(res151.reason).toContain('supera el radio máximo');

    const resFar = evaluateDeliveryMatrix(22);
    expect(resFar.isDeliverable).toBe(false);
    expect(resFar.zoneName).toBe('Fuera de cobertura');
  });

  it('soporta cargos adicionales por km si el tramo define pricePerKm', () => {
    const customConfig: DeliveryMatrixConfig = {
      maxDeliveryDistanceKm: 10,
      fallbackFlatFee: 30,
      tiers: [
        { id: 't1', name: 'Zona Base', minKm: 0, maxKm: 3, price: 30 },
        { id: 't2', name: 'Zona Plus', minKm: 3, maxKm: 10, price: 30, pricePerKm: 10 },
      ],
    };

    // 5 km -> 30 base + (5 - 3) * 10 = 50
    const res = evaluateDeliveryMatrix(5, customConfig);
    expect(res.isDeliverable).toBe(true);
    expect(res.fee).toBe(50);
  });
});

describe('Escenarios de prueba en código duro (TEST_DELIVERY_SCENARIOS)', () => {
  it('todos los escenarios de prueba tienen datos válidos y coherentes', () => {
    for (const [key, s] of Object.entries(TEST_DELIVERY_SCENARIOS)) {
      expect(s.id).toBe(key);
      expect(s.address.length).toBeGreaterThan(5);
      expect(s.coordinates.lat).toBeTypeOf('number');
      expect(s.coordinates.lng).toBeTypeOf('number');
      expect(s.distanceKm).toBeGreaterThan(0);

      const evaluated = evaluateDeliveryMatrix(s.distanceKm);
      expect(evaluated.zoneName).toBe(s.expectedZone);
      expect(evaluated.fee).toBe(s.expectedFee);
    }
  });
});

describe('calculateHaversineDistanceKm', () => {
  it('retorna 0 para el mismo punto', () => {
    const p1: Coordinates = { lat: 19.4326, lng: -99.1436 };
    const dist = calculateHaversineDistanceKm(p1, p1);
    expect(dist).toBe(0);
  });

  it('calcula distancia razonable entre Centro y Roma Norte en CDMX', () => {
    const centro: Coordinates = { lat: 19.432608, lng: -99.143612 };
    const roma: Coordinates = { lat: 19.4185, lng: -99.1620 };

    const straightDist = calculateHaversineDistanceKm(centro, roma, false);
    // En línea recta son ~2.5 - 3.0 km
    expect(straightDist).toBeGreaterThan(2.0);
    expect(straightDist).toBeLessThan(3.5);

    // Con factor vial (1.28x)
    const roadDist = calculateHaversineDistanceKm(centro, roma, true);
    expect(roadDist).toBeGreaterThan(straightDist);
  });
});

describe('calculateDeliveryFee con multi-local', () => {
  const localCentro: Coordinates = { lat: 19.432608, lng: -99.143612 };
  const localSur: Coordinates = { lat: 19.300000, lng: -99.150000 };
  const destinoNorte: Coordinates = { lat: 19.480000, lng: -99.140000 };

  it('calcula diferente distancia y tarifa según las coordenadas del local de origen', async () => {
    // Desde Centro hasta Norte
    const resCentro = await calculateDeliveryFee({
      origin: localCentro,
      destinationCoordinates: destinoNorte,
    });

    // Desde Sur hasta Norte (mucho más lejos)
    const resSur = await calculateDeliveryFee({
      origin: localSur,
      destinationCoordinates: destinoNorte,
    });

    expect(resCentro.distanceKm).toBeLessThan(resSur.distanceKm);
    expect(resCentro.isDeliverable).toBe(true);
    // Desde el sur de CDMX hasta el norte son > 20 km -> fuera de cobertura
    expect(resSur.isDeliverable).toBe(false);
  });

  it('evalúa escenario de prueba directamente por clave', async () => {
    const res = await calculateDeliveryFee({
      origin: localCentro,
      testScenarioKey: 'media',
    });

    expect(res.source).toBe('TEST_PRESET');
    expect(res.distanceKm).toBe(4.2);
    expect(res.fee).toBe(40);
    expect(res.zoneName).toBe('Zona 2 (2 - 5 km)');
  });

  it('retorna tarifa fija de fallback si no hay coordenadas ni dirección', async () => {
    const res = await calculateDeliveryFee({
      origin: localCentro,
      localFallbackFee: 35,
    });

    expect(res.source).toBe('FALLBACK_FLAT');
    expect(res.fee).toBe(35);
    expect(res.isDeliverable).toBe(true);
  });
});

describe('getOsmDistanceMatrix con mock de red', () => {
  it('parsea correctamente la respuesta de la API de OSRM Table', async () => {
    const origin: Coordinates = { lat: 19.43, lng: -99.14 };
    const dest: Coordinates = { lat: 19.41, lng: -99.16 };

    const mockResponse = {
      code: 'Ok',
      distances: [
        [0, 3850], // 3850 metros = 3.85 km
        [3850, 0],
      ],
      durations: [
        [0, 720], // 720 segundos = 12 min
        [720, 0],
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await getOsmDistanceMatrix(origin, dest);
    expect(result).not.toBeNull();
    expect(result?.distanceKm).toBe(3.85);
    expect(result?.durationMinutes).toBe(12);

    global.fetch = originalFetch;
  });

  it('retorna null si la respuesta de OSRM no es exitosa (activando fallback)', async () => {
    const origin: Coordinates = { lat: 19.43, lng: -99.14 };
    const dest: Coordinates = { lat: 19.41, lng: -99.16 };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await getOsmDistanceMatrix(origin, dest);
    expect(result).toBeNull();

    global.fetch = originalFetch;
  });
});
