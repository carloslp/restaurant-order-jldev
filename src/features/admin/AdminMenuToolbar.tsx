// src/features/admin/AdminMenuToolbar.tsx
'use client';

import { useState } from 'react';
import { exportMenuToCsv, getMenuCsvTemplate } from '@/lib/server/menu-csv';
import { useToast } from '@/components/ui/use-toast';
import { AdminMenuCsvModal } from '@/features/admin/AdminMenuCsvModal';
import { 
  Download, 
  Upload, 
  FileText, 
  RefreshCw 
} from 'lucide-react';
import type { Local } from '@/lib/types';

interface AdminMenuToolbarProps {
  local: Local | null;
  onMenuUpdated: () => void;
}

export function AdminMenuToolbar({ local, onMenuUpdated }: AdminMenuToolbarProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const csv = await exportMenuToCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      const localSlug = local?.slug || 'menu';
      a.href = url;
      a.download = `menu-${localSlug}-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: 'Se ha descargado el archivo CSV con el menú completo de este local.',
      });
    } catch (err: any) {
      toast({
        title: 'Error al exportar menú',
        description: err?.message || 'No se pudo generar el archivo CSV del menú.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      const template = await getMenuCsvTemplate();
      const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-menu-ejemplo.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: 'Error al descargar plantilla',
        description: err?.message || 'No se pudo generar la plantilla CSV.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-900 text-white rounded-2xl shadow-sm border border-zinc-800">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
            <span>Gestión Masiva de Catálogo (CSV)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Descarga, respalda o actualiza platillos y modificadores de forma ágil desde Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Descargar Plantilla */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Descargar plantilla CSV con ejemplos"
          >
            {isDownloadingTemplate ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline">Plantilla</span>
          </button>

          {/* Botón Exportar */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-xs"
            title="Exportar menú actual a CSV"
          >
            {isExporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-orange-400" />
            )}
            <span>Exportar CSV</span>
          </button>

          {/* Botón Importar */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white rounded-xl transition-all cursor-pointer active:scale-95 shadow-xs"
            title="Importar menú desde archivo CSV"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar CSV</span>
          </button>
        </div>
      </div>

      <AdminMenuCsvModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={onMenuUpdated}
        localName={local?.name}
      />
    </>
  );
}
