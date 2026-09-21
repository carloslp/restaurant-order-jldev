// Matriz de precios de envío por distancia y escenarios de prueba.
// Soporta cálculo escalonado por kilómetros entre el local (origen) y el domicilio (destino).

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface DistanceTier {
  id: string;
  name: string; // ej. "Zona 1 (0 - 2 km)"
  minKm: number; // límite inferior exclusivo (o 0 inclusivo)
  maxKm: number; // límite superior inclusivo
  price: number; // tarifa fija para este rango
  pricePerKm?: number; // cargo adicional opcional por km excedente
}

export interface DeliveryMatrixConfig {
  tiers: DistanceTier[];
  maxDeliveryDistanceKm: number; // radio máximo permitido para reparto a domicilio
  fallbackFlatFee: number; // tarifa fija fallback si no hay datos de distancia
}

export interface DeliveryFeeResult {
  fee: number;
  distanceKm: number;
  durationMinutes?: number;
  tier: DistanceTier | null;
  zoneName: string;
  isDeliverable: boolean;
  source: 'OSM_MATRIX' | 'HAVERSINE_FALLBACK' | 'TEST_PRESET' | 'FALLBACK_FLAT';
  reason?: string;
}

/**
 * Matriz de tarifas de prueba en código duro basada en rangos de distancia (km).
 */
export const DEFAULT_DELIVERY_MATRIX: DeliveryMatrixConfig = {
  maxDeliveryDistanceKm: 15,
  fallbackFlatFee: 35,
  tiers: [
    { id: 'tier_1', name: 'Zona 1 (0 - 2 km)', minKm: 0, maxKm: 2, price: 25 },
    { id: 'tier_2', name: 'Zona 2 (2 - 5 km)', minKm: 2, maxKm: 5, price: 40 },
    { id: 'tier_3', name: 'Zona 3 (5 - 8 km)', minKm: 5, maxKm: 8, price: 60 },
    { id: 'tier_4', name: 'Zona 4 (8 - 12 km)', minKm: 8, maxKm: 12, price: 85 },
    { id: 'tier_5', name: 'Zona 5 (12 - 15 km)', minKm: 12, maxKm: 15, price: 120 },
  ],
};

export interface TestDeliveryScenario {
  id: string;
  label: string;
  address: string;
  distanceKm: number;
  coordinates: Coordinates;
  expectedZone: string;
  expectedFee: number;
}

/**
 * Escenarios y domicilios de prueba en código duro para pruebas reproducibles.
 * El restaurante base demo está ubicado en Centro CDMX (19.432608, -99.143612).
 */
export const TEST_DELIVERY_SCENARIOS: Record<string, TestDeliveryScenario> = {
  cerca: {
    id: 'cerca',
    label: 'Cercana (~1.8 km - Zona 1)',
    address: 'Calle López 25, Colonia Centro, CDMX',
    distanceKm: 1.8,
    coordinates: { lat: 19.4342, lng: -99.1415 },
    expectedZone: 'Zona 1 (0 - 2 km)',
    expectedFee: 25,
  },
  media: {
    id: 'media',
    label: 'Media (~4.2 km - Zona 2)',
    address: 'Av. Álvaro Obregón 150, Roma Norte, CDMX',
    distanceKm: 4.2,
    coordinates: { lat: 19.4185, lng: -99.1620 },
    expectedZone: 'Zona 2 (2 - 5 km)',
    expectedFee: 40,
  },
  lejana: {
    id: 'lejana',
    label: 'Lejana (~7.1 km - Zona 3)',
    address: 'Campos Elíseos 204, Polanco, CDMX',
    distanceKm: 7.1,
    coordinates: { lat: 19.4285, lng: -99.1925 },
    expectedZone: 'Zona 3 (5 - 8 km)',
    expectedFee: 60,
  },
  extendida: {
    id: 'extendida',
    label: 'Extendida (~10.5 km - Zona 4)',
    address: 'Av. Miguel Ángel de Quevedo 400, Coyoacán, CDMX',
    distanceKm: 10.5,
    coordinates: { lat: 19.3475, lng: -99.1680 },
    expectedZone: 'Zona 4 (8 - 12 km)',
    expectedFee: 85,
  },
  limite: {
    id: 'limite',
    label: 'Límite (~13.8 km - Zona 5)',
    address: 'Av. Revolución 1600, San Ángel, CDMX',
    distanceKm: 13.8,
    coordinates: { lat: 19.3490, lng: -99.1920 },
    expectedZone: 'Zona 5 (12 - 15 km)',
    expectedFee: 120,
  },
  fuera_de_rango: {
    id: 'fuera_de_rango',
    label: 'Fuera de rango (~22.0 km - No entregable)',
    address: 'Av. Javier Barros Sierra 540, Santa Fe, CDMX',
    distanceKm: 22.0,
    coordinates: { lat: 19.3620, lng: -99.2610 },
    expectedZone: 'Fuera de cobertura',
    expectedFee: 0,
  },
};

/**
 * Evalúa una distancia en kilómetros contra la matriz de configuración de tarifas.
 */
export function evaluateDeliveryMatrix(
  distanceKm: number,
  config: DeliveryMatrixConfig = DEFAULT_DELIVERY_MATRIX,
  source: DeliveryFeeResult['source'] = 'OSM_MATRIX',
  durationMinutes?: number
): DeliveryFeeResult {
  const roundedDist = Math.round(distanceKm * 100) / 100;

  // 1. Validar si excede el radio máximo
  if (roundedDist > config.maxDeliveryDistanceKm) {
    return {
      fee: 0,
      distanceKm: roundedDist,
      durationMinutes,
      tier: null,
      zoneName: 'Fuera de cobertura',
      isDeliverable: false,
      source,
      reason: `La distancia (${roundedDist} km) supera el radio máximo de reparto permitido (${config.maxDeliveryDistanceKm} km).`,
    };
  }

  // 2. Buscar el tramo correspondiente
  // Un tramo aplica si distanceKm > minKm && distanceKm <= maxKm
  // Para el primer tramo (minKm = 0), aplica si 0 <= distanceKm <= maxKm
  const matchedTier = config.tiers.find((tier) => {
    if (tier.minKm === 0) {
      return roundedDist >= 0 && roundedDist <= tier.maxKm;
    }
    return roundedDist > tier.minKm && roundedDist <= tier.maxKm;
  });

  if (!matchedTier) {
    // Si no coincide con un tramo específico pero está dentro de maxDeliveryDistanceKm,
    // usar el último tramo o tarifa fallback
    const lastTier = config.tiers[config.tiers.length - 1];
    return {
      fee: lastTier ? lastTier.price : config.fallbackFlatFee,
      distanceKm: roundedDist,
      durationMinutes,
      tier: lastTier ?? null,
      zoneName: lastTier ? lastTier.name : 'Zona Estándar',
      isDeliverable: true,
      source,
    };
  }

  // 3. Calcular el costo final del tramo
  let fee = matchedTier.price;
  if (matchedTier.pricePerKm && matchedTier.pricePerKm > 0) {
    const extraKm = Math.max(0, roundedDist - matchedTier.minKm);
    fee += extraKm * matchedTier.pricePerKm;
  }

  return {
    fee: Math.round(fee * 100) / 100,
    distanceKm: roundedDist,
    durationMinutes,
    tier: matchedTier,
    zoneName: matchedTier.name,
    isDeliverable: true,
    source,
  };
}
