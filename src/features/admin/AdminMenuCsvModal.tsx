// src/features/admin/AdminMenuCsvModal.tsx
'use client';

import { useState, useRef, useTransition } from 'react';
import { 
  validateMenuCsv, 
  importMenuFromCsv, 
  getMenuCsvTemplate, 
  type MenuCsvValidationResult, 
  type MenuImportMode 
} from '@/lib/server/menu-csv';
import { useToast } from '@/components/ui/use-toast';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  PlusCircle, 
  Replace, 
  Info 
} from 'lucide-react';

interface AdminMenuCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  localName?: string;
}

export function AdminMenuCsvModal({ isOpen, onClose, onSuccess, localName }: AdminMenuCsvModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<MenuImportMode>('append');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [validation, setValidation] = useState<MenuCsvValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: 'Formato incorrecto',
        description: 'Por favor selecciona un archivo con extensión .csv',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setIsValidating(true);

    try {
      const text = await file.text();
      setCsvContent(text);
      const res = await validateMenuCsv(text);
      setValidation(res);
    } catch (err: any) {
      toast({
        title: 'Error al leer archivo',
        description: err?.message || 'No se pudo leer el archivo CSV seleccionado.',
        variant: 'destructive',
      });
      setValidation(null);
      setCsvContent(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownloadTemplate = async () => {
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
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo generar la plantilla de ejemplo.',
        variant: 'destructive',
      });
    }
  };

  const handleImport = () => {
    if (!csvContent || !validation || !validation.valid) return;
    if (mode === 'replace' && !confirmReplace) {
      toast({
        title: 'Confirmación requerida',
        description: 'Debes confirmar que comprendes que se sustituirá el menú existente.',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await importMenuFromCsv({
          csvContent,
          mode,
        });

        if (result.ok) {
          toast({
            title: mode === 'replace' ? 'Menú sustituido con éxito' : 'Nuevos ítems importados con éxito',
            description: `Se procesaron ${result.createdCategories} categorías y ${result.createdProducts} productos nuevos${
              result.skippedProducts > 0 ? ` (${result.skippedProducts} productos existentes conservados sin modificar)` : ''
            }.`,
          });
          onSuccess();
          onClose();
        }
      } catch (err: any) {
        toast({
          title: 'Error durante la importación',
          description: err?.message || 'Ocurrió un error al guardar el menú en la base de datos.',
          variant: 'destructive',
        });
      }
    });
  };

  const handleResetFile = () => {
    setFileName(null);
    setCsvContent(null);
    setValidation(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 id="csv-modal-title" className="text-lg font-bold text-zinc-900">
                Importar Menú por CSV
              </h2>
              {localName && (
                <p className="text-xs text-zinc-500 font-medium">Local: {localName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-zinc-600">
          {/* Selector de Modo */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
              Modo de importación
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  mode === 'append'
                    ? 'border-orange-500 bg-orange-50/50 text-zinc-900 shadow-xs ring-1 ring-orange-500/30'
                    : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <PlusCircle className={`w-4 h-4 ${mode === 'append' ? 'text-orange-600' : 'text-zinc-400'}`} />
                  <span>Agregar nuevos ítems</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 font-normal leading-relaxed">
                  Conserva los productos existentes y agrega nuevos platillos o categorías sin modificar lo que ya tienes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  mode === 'replace'
                    ? 'border-red-500 bg-red-50/50 text-zinc-900 shadow-xs ring-1 ring-red-500/30'
                    : 'border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-zinc-900">
                  <Replace className={`w-4 h-4 ${mode === 'replace' ? 'text-red-600' : 'text-zinc-400'}`} />
                  <span>Sustituir todo el menú</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 font-normal leading-relaxed">
                  Elimina el catálogo actual de este local y monta el nuevo menú completo desde el archivo CSV.
                </p>
              </button>
            </div>
          </div>

          {/* Advertencia en modo Sustituir */}
          {mode === 'replace' && (
            <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-red-700">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Acción destructiva</span>
              </div>
              <p className="text-xs text-red-700 leading-relaxed">
                Todas las categorías, platillos y modificadores actuales de este local serán eliminados permanentemente y reemplazados con los datos del CSV.
              </p>
              <label className="flex items-start gap-2.5 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(e) => setConfirmReplace(e.target.checked)}
                  className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs font-semibold text-red-800">
                  Confirmo que deseo reemplazar por completo el catálogo de este local.
                </span>
              </label>
            </div>
          )}

          {/* Selector de Archivo CSV */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Archivo CSV
              </label>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar plantilla de ejemplo</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="menu-csv-input"
            />

            {!fileName ? (
              <label
                htmlFor="menu-csv-input"
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-300 hover:border-orange-500 rounded-2xl bg-zinc-50 hover:bg-orange-50/20 transition-all cursor-pointer text-center group"
              >
                <div className="p-3 bg-white group-hover:bg-orange-100 rounded-2xl shadow-xs border border-zinc-200 transition-colors">
                  <UploadCloud className="w-6 h-6 text-zinc-500 group-hover:text-orange-600" />
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-800">
                  Haz clic para seleccionar o arrastra tu archivo .csv
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Compatible con comas o punto y coma de Excel en español
                </p>
              </label>
            ) : (
              <div className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-5 h-5 text-orange-600 shrink-0" />
                  <div className="truncate">
                    <p className="text-xs font-bold text-zinc-900 truncate">{fileName}</p>
                    <p className="text-[11px] text-zinc-400">
                      {isValidating ? 'Validando contenido...' : 'Archivo listo'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetFile}
                  disabled={isPending}
                  className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Quitar archivo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Resultado de Validación */}
          {validation && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {validation.valid ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Archivo válido para importación</span>
                  </div>

                  {/* Resumen Métrico */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-100">
                      <span className="block text-base font-black text-emerald-700">
                        {validation.summary.categoriesCount}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-800">Categorías</span>
                    </div>
                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-100">
                      <span className="block text-base font-black text-emerald-700">
                        {validation.summary.productsCount}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-800">Productos</span>
                    </div>
                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-100">
                      <span className="block text-base font-black text-emerald-700">
                        {validation.summary.modifierGroupsCount}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-800">Grupos Mod.</span>
                    </div>
                    <div className="p-2 bg-white/80 rounded-lg border border-emerald-100">
                      <span className="block text-base font-black text-emerald-700">
                        {validation.summary.modifierOptionsCount}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-800">Opciones Extra</span>
                    </div>
                  </div>

                  {/* Previsualización de muestra */}
                  {validation.sampleItems.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                        Muestra de platillos detectados:
                      </p>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-emerald-200/80 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-emerald-50/50 text-[11px] text-emerald-900 border-b border-emerald-100">
                            <tr>
                              <th className="py-1.5 px-2.5 font-semibold">Categoría</th>
                              <th className="py-1.5 px-2.5 font-semibold">Producto</th>
                              <th className="py-1.5 px-2.5 font-semibold text-right">Precio</th>
                              <th className="py-1.5 px-2.5 font-semibold text-center">Modificadores</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50 text-zinc-700">
                            {validation.sampleItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-emerald-50/30">
                                <td className="py-1.5 px-2.5 text-zinc-500">{item.category}</td>
                                <td className="py-1.5 px-2.5 font-medium text-zinc-900">{item.product}</td>
                                <td className="py-1.5 px-2.5 text-right font-semibold">${item.price.toFixed(2)}</td>
                                <td className="py-1.5 px-2.5 text-center text-zinc-500">
                                  {item.modifiersCount > 0 ? `${item.modifiersCount} ops` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Errores detectados ({validation.errors.length})</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Corrige los siguientes detalles en tu archivo CSV antes de importar:
                  </p>
                  <ul className="max-h-32 overflow-y-auto space-y-1 text-xs text-amber-900 bg-white/70 p-2.5 rounded-lg border border-amber-200">
                    {validation.errors.map((err, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="font-bold text-amber-700">Fila {err.row}:</span>
                        <span>{err.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-zinc-50/70">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Info className="w-3.5 h-3.5" />
            <span>Los cambios impactan el menú público en tiempo real</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-800 hover:bg-zinc-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                !csvContent || 
                !validation || 
                !validation.valid || 
                (mode === 'replace' && !confirmReplace) || 
                isPending
              }
              className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer ${
                mode === 'replace'
                  ? 'bg-red-600 hover:bg-red-700 active:scale-95 disabled:bg-zinc-300 disabled:cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 active:scale-95 disabled:bg-zinc-300 disabled:cursor-not-allowed'
              }`}
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Importando menú...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {mode === 'replace' ? 'Sustituir menú completo' : 'Agregar nuevos ítems'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
