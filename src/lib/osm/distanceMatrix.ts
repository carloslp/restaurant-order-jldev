// Cliente de cálculo de distancia vial mediante OpenStreetMap (OSRM Table / Distance Matrix)
// y geocodificación con Nominatim, con fallback a fórmula geodésica Haversine.

import {
  type Coordinates,
  type DeliveryFeeResult,
  type DeliveryMatrixConfig,
  DEFAULT_DELIVERY_MATRIX,
  TEST_DELIVERY_SCENARIOS,
  evaluateDeliveryMatrix,
} from '@/lib/pricing/deliveryMatrix';

/**
 * Calcula la distancia ortodrómica en línea recta (fórmula de Haversine) entre dos coordenadas.
 * Aplica un factor promedio de curvatura vial (~1.28x) para aproximar la distancia real de manejo
 * cuando no hay conexión con el servicio de ruteo.
 */
export function calculateHaversineDistanceKm(
  origin: Coordinates,
  destination: Coordinates,
  applyRoadWindingFactor = true
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;

  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (destination.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistanceKm = R * c;

  // Factor de desvío vial (tortuosidad de la red urbana)
  const factor = applyRoadWindingFactor ? 1.28 : 1.0;
  return Math.round(straightDistanceKm * factor * 100) / 100;
}

export interface OsmMatrixResponse {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Consulta la matriz de distancias viales usando el servicio público de OSRM (Table API).
 * Formato OSRM: {longitud},{latitud} (longitud primero).
 */
export async function getOsmDistanceMatrix(
  origin: Coordinates,
  destination: Coordinates,
  timeoutMs = 3000
): Promise<OsmMatrixResponse | null> {
  // Validar coordenadas
  if (
    typeof origin.lat !== 'number' ||
    typeof origin.lng !== 'number' ||
    typeof destination.lat !== 'number' ||
    typeof destination.lng !== 'number'
  ) {
    return null;
  }

  // OSRM table URL: /table/v1/driving/{lon1},{lat1};{lon2},{lat2}?annotations=distance,duration
  const coordsParam = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://router.project-osrm.org/table/v1/driving/${coordsParam}?annotations=distance,duration`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`OSRM distance matrix responded with status ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.distances || !data.distances[0] || data.distances[0][1] == null) {
      return null;
    }

    const distanceMeters = data.distances[0][1];
    const durationSeconds = data.durations?.[0]?.[1] ?? 0;

    return {
      distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
      durationMinutes: Math.round((durationSeconds / 60) * 10) / 10,
    };
  } catch (error) {
    // Si falla por timeout o error de red, retornamos null para activar el fallback
    console.warn('OSRM distance matrix fetch error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Geocodifica una dirección de texto a coordenadas usando OSM Nominatim
 * o matching rápido con los escenarios de prueba en código duro.
 */
export async function geocodeAddressWithOsm(
  address: string,
  timeoutMs = 3000
): Promise<Coordinates | null> {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return null;

  // 1. Revisar si coincide con algún escenario de prueba en código duro
  for (const scenario of Object.values(TEST_DELIVERY_SCENARIOS)) {
    if (
      normalized.includes(scenario.id) ||
      normalized.includes(scenario.label.toLowerCase()) ||
      normalized.includes(scenario.address.toLowerCase())
    ) {
      return scenario.coordinates;
    }
  }

  // 2. Consultar Nominatim OSM
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RestaurantOrderApp/1.0 (delivery-calculator)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { lat, lng };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export interface CalculateDeliveryFeeInput {
  origin: Coordinates;
  destinationAddress?: string | null;
  destinationCoordinates?: Coordinates | null;
  testScenarioKey?: string | null;
  config?: DeliveryMatrixConfig;
  localFallbackFee?: number;
}

/**
 * Función principal orquestadora:
 * Obtiene la distancia entre el local (origen) y el destino mediante OSM o fallback,
 * y evalúa la matriz de tarifas por kilómetro.
 */
export async function calculateDeliveryFee(
  input: CalculateDeliveryFeeInput
): Promise<DeliveryFeeResult> {
  const config = input.config ?? DEFAULT_DELIVERY_MATRIX;

  // 1. Si se solicita un escenario de prueba específico en código duro:
  if (input.testScenarioKey && TEST_DELIVERY_SCENARIOS[input.testScenarioKey]) {
    const scenario = TEST_DELIVERY_SCENARIOS[input.testScenarioKey];
    return evaluateDeliveryMatrix(
      scenario.distanceKm,
      config,
      'TEST_PRESET',
      Math.round(scenario.distanceKm * 2.5) // ~2.5 min/km en ciudad
    );
  }

  // 2. Determinar coordenadas de destino
  let destCoords = input.destinationCoordinates;
  if (!destCoords && input.destinationAddress) {
    // Si la dirección coincide con una clave de prueba directa:
    const matchedScenario = Object.entries(TEST_DELIVERY_SCENARIOS).find(([key, s]) =>
      input.destinationAddress!.toLowerCase().includes(key) ||
      input.destinationAddress!.toLowerCase().includes(s.address.toLowerCase())
    );
    if (matchedScenario) {
      return evaluateDeliveryMatrix(
        matchedScenario[1].distanceKm,
        config,
        'TEST_PRESET',
        Math.round(matchedScenario[1].distanceKm * 2.5)
      );
    }

    destCoords = await geocodeAddressWithOsm(input.destinationAddress, 3000);
  }

  // 3. Si no hay coordenadas de destino disponibles, usar tarifa fallback fija
  if (!destCoords) {
    const isExplicitAddress = Boolean(input.destinationAddress && input.destinationAddress.trim().length > 0);
    return {
      fee: input.localFallbackFee ?? config.fallbackFlatFee,
      distanceKm: 0,
      tier: null,
      zoneName: isExplicitAddress ? 'Por confirmar' : 'Tarifa Fija (Sin geolocalizar)',
      isDeliverable: true,
      source: 'FALLBACK_FLAT',
      failedToCalculate: isExplicitAddress,
      reason: isExplicitAddress
        ? 'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte'
        : 'No se pudieron determinar las coordenadas del domicilio; se aplica tarifa base.',
    };
  }

  // 4. Intentar obtener distancia vial real con OpenStreetMap (OSRM)
  const osmResult = await getOsmDistanceMatrix(input.origin, destCoords, 3000);
  if (osmResult) {
    return evaluateDeliveryMatrix(
      osmResult.distanceKm,
      config,
      'OSM_MATRIX',
      osmResult.durationMinutes
    );
  }

  // 5. Fallback a distancia geodésica con Haversine + factor vial
  const fallbackDistanceKm = calculateHaversineDistanceKm(input.origin, destCoords);
  const fallbackResult = evaluateDeliveryMatrix(
    fallbackDistanceKm,
    config,
    'HAVERSINE_FALLBACK',
    Math.round(fallbackDistanceKm * 2.8)
  );

  return {
    ...fallbackResult,
    failedToCalculate: true,
    reason: 'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte',
  };
}
