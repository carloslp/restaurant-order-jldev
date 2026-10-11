// src/features/admin/ZoneCapacityEditor.tsx
// Componente informativo de solo lectura: Aforo derivado automáticamente de restaurant_tables.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getZoneCapacities } from '@/lib/server/reservations';
import type { Zone } from '@/lib/types';
import { CheckCircle2, Info } from 'lucide-react';

const ZONES: { zone: Zone; label: string; hint: string }[] = [
  { zone: 'INTERIOR', label: 'Interior', hint: 'Mesas y salón principal' },
  { zone: 'TERRAZA', label: 'Terraza', hint: 'Área exterior' },
  { zone: 'BARRA', label: 'Barra', hint: 'Asientos en barra' },
];

export function ZoneCapacityEditor() {
  const [capacities, setCapacities] = useState<Record<Zone, number>>({ INTERIOR: 0, TERRAZA: 0, BARRA: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const caps = await getZoneCapacities();
      const map: Record<Zone, number> = { INTERIOR: 0, TERRAZA: 0, BARRA: 0 };
      (caps as Array<{ zone: Zone; capacity: number }>).forEach((c) => {
        map[c.zone] = c.capacity;
      });
      setCapacities(map);
    } catch {
      console.error('ZoneCapacityEditor/load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Cargando aforo de mesas…</p>;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-gray-800">Aforo por zona (Mesas Físicas)</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Métrica calculada en tiempo real como la suma de comensales máximos de las mesas activas. 
          Para ajustar el aforo, gestiona las mesas en <strong>Sala y Mesas</strong>.
        </p>
      </div>

      <div className="p-4 bg-blue-50/60 border-b border-blue-100 flex items-start gap-2 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          El sistema valida la existencia física de una mesa adecuada para el tamaño de cada grupo, protegiendo contra sobreventas.
        </span>
      </div>

      <table className="w-full">
        <tbody className="divide-y divide-gray-100">
          {ZONES.map(({ zone, label, hint }) => (
            <tr key={zone}>
              <td className="p-4">
                <div className="font-medium text-gray-800">{label}</div>
                <div className="text-xs text-gray-500">{hint}</div>
              </td>
              <td className="p-4 text-right">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-900">
                  {capacities[zone] > 0 ? `${capacities[zone]} plazas` : 'Sin mesas activas'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
