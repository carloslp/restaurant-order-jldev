// Server action para estimar la tarifa de entrega por distancia usando OSM y la matriz de precios.
'use server';

import { getLocalById } from '@/lib/server/local';
import { calculateDeliveryFee } from '@/lib/osm/distanceMatrix';
import type { Coordinates, DeliveryFeeResult } from '@/lib/pricing/deliveryMatrix';

export interface EstimateDeliveryInput {
  locationId: string;
  address?: string | null;
  coordinates?: Coordinates | null;
  testScenarioKey?: string | null;
}

export interface EstimateDeliveryResult {
  ok: boolean;
  error?: string;
  data?: DeliveryFeeResult;
  calculationFailed?: boolean;
}

// Coordenadas fallback por defecto si el local aún no tiene coordenadas cargadas en la BD (CDMX Centro)
const DEFAULT_LOCAL_COORDS: Coordinates = {
  lat: 19.432608,
  lng: -99.143612,
};

export async function estimateDeliveryFee(
  input: EstimateDeliveryInput
): Promise<EstimateDeliveryResult> {
  try {
    const local = await getLocalById(input.locationId);
    if (!local) {
      return { ok: false, error: 'Local no encontrado' };
    }

    const origin: Coordinates =
      local.latitude != null && local.longitude != null
        ? { lat: local.latitude, lng: local.longitude }
        : DEFAULT_LOCAL_COORDS;

    const result = await calculateDeliveryFee({
      origin,
      destinationAddress: input.address,
      destinationCoordinates: input.coordinates,
      testScenarioKey: input.testScenarioKey,
      localFallbackFee: local.delivery_fee,
    });

    if (result.failedToCalculate) {
      return {
        ok: true,
        calculationFailed: true,
        data: result,
        error: 'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte',
      };
    }

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    console.error('estimateDeliveryFee error:', error);
    return {
      ok: false,
      calculationFailed: true,
      error: 'No pudimos calcular la distancia exacta. El costo de envío se confirmará al contactarte',
    };
  }
}
