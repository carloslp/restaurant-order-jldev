// src/features/admin/ZoneCapacityEditor.tsx
// Editor del aforo por zona (INTERIOR / TERRAZA / BARRA) para el local actual.
// Cierra la tarea 25-26 del TODO: settings de aforo del local.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getZoneCapacities, upsertZoneCapacity } from '@/lib/server/reservations';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import type { Zone } from '@/lib/types';

const ZONES: { zone: Zone; label: string; hint: string }[] = [
  { zone: 'INTERIOR', label: 'Interior', hint: 'Mesas y salón principal' },
  { zone: 'TERRAZA', label: 'Terraza', hint: 'Área exterior' },
  { zone: 'BARRA', label: 'Barra', hint: 'Asientos en barra' },
];

export function ZoneCapacityEditor() {
  const { toast } = useToast();
  const [capacities, setCapacities] = useState<Record<Zone, number>>({ INTERIOR: 0, TERRAZA: 0, BARRA: 0 });
  const [loading, setLoading] = useState(true);
  const { saving, formError, submit } = useServerForm();

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
      // El form muestra el error; no silenciar en consola.
      console.error('ZoneCapacityEditor/load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (zone: Zone) => {
    const ok = await submit(async () => {
      await upsertZoneCapacity(zone, capacities[zone]);
      toast({ title: 'Éxito', description: `Aforo de ${zone.toLowerCase()} actualizado` });
    });
    if (ok) await load();
  };

  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Cargando aforo…</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800">Aforo por zona (reservas)</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Comensales máximos por franja. Usa <strong>0</strong> para desactivar la zona del calendario de reservas.
        </p>
      </div>
      <FormAlert message={formError} />
      <table className="w-full">
        <tbody className="divide-y divide-gray-100">
          {ZONES.map(({ zone, label, hint }) => (
            <tr key={zone}>
              <td className="p-4">
                <div className="font-medium text-gray-800">{label}</div>
                <div className="text-xs text-gray-500">{hint}</div>
              </td>
              <td className="p-4 w-32">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={capacities[zone]}
                  onChange={(e) => setCapacities((prev) => ({ ...prev, [zone]: Number(e.target.value) || 0 }))}
                  disabled={saving}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary disabled:bg-gray-50"
                  aria-label={`Aforo ${label}`}
                />
              </td>
              <td className="p-4 text-right">
                <button
                  onClick={() => handleSave(zone)}
                  disabled={saving}
                  className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Guardar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
