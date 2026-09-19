import { useState, useEffect, useCallback } from 'react';
import {
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  toggleStaffActive,
  inviteStaff,
} from '@/lib/server/staff';
import { useToast } from '@/components/ui/use-toast';
import { FormAlert, FieldError, fieldAria } from '@/components/ui/form-error';
import { useServerForm } from '@/lib/forms';
import type { Staff, StaffFormData } from '@/lib/types';

interface StaffMember extends Staff {}

const initialFormData: StaffFormData = {
  email: '',
  full_name: '',
  is_active: true,
};

export function AdminStaff() {
  const { toast } = useToast();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState<StaffFormData>(initialFormData);
  const [showForm, setShowForm] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invitePassword, setInvitePassword] = useState('');
  const { saving, formError, fieldErrors, clearFieldError, submit } = useServerForm();

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listStaff();
      setStaffList(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit(async () => {
      if (editingStaff) {
        await updateStaff(editingStaff.id, formData);
        toast({ title: 'Éxito', description: 'Staff actualizado' });
      } else {
        await createStaff(formData);
        toast({ title: 'Éxito', description: 'Staff creado (sin invitación de acceso)' });
      }
    });
    if (!ok) return;
    setShowForm(false);
    setEditingStaff(null);
    setFormData(initialFormData);
    loadStaff();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invitePassword && invitePassword.length < 8) {
      toast({ title: 'Error', description: 'La contraseña debe tener al menos 8 caracteres', variant: 'destructive' });
      return;
    }
    setInviting(true);
    const ok = await submit(async () => {
      const result = await inviteStaff({
        email: formData.email,
        full_name: formData.full_name,
        password: invitePassword || undefined,
      });
      toast({
        title: 'Éxito',
        description:
          result.mode === 'password'
            ? 'Staff creado con contraseña. Ya puede iniciar sesión con email + contraseña.'
            : 'Invitación enviada. El staff recibirá un magic link por email.',
      });
    });
    setInviting(false);
    if (!ok) return;
    setShowForm(false);
    setEditingStaff(null);
    setFormData(initialFormData);
    setInvitePassword('');
    loadStaff();
  };

  const handleEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFormData({
      email: staff.email,
      full_name: staff.full_name,
      is_active: staff.is_active,
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingStaff(null);
    setFormData(initialFormData);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingStaff(null);
    setFormData(initialFormData);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este miembro del staff? Esta acción no se puede deshacer.')) return;
    const ok = await submit(async () => {
      await deleteStaff(id);
      toast({ title: 'Eliminado', description: 'Miembro del staff eliminado' });
    });
    if (ok) loadStaff();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const ok = await submit(async () => {
      await toggleStaffActive(id, isActive);
      toast({ title: 'Éxito', description: isActive ? 'Staff activado' : 'Staff desactivado' });
    });
    if (ok) loadStaff();
  };

  if (loading) {
    return <div className="flex justify-center py-8">Cargando staff...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestión de Staff</h2>
        <button onClick={handleNew} className="btn-primary">
          + Nuevo Staff
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">
                {editingStaff ? 'Editar Staff' : 'Nuevo Staff'}
              </h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <form onSubmit={editingStaff ? handleSubmit : handleInvite} className="p-4 space-y-4">
              <FormAlert message={formError} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); clearFieldError('email'); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  required
                  disabled={!!editingStaff}
                  {...fieldAria('staff-email-error', !!fieldErrors.email)}
                />
                <FieldError id="staff-email-error" message={fieldErrors.email} />
                {editingStaff && (
                  <p className="mt-1 text-xs text-gray-500">El email no se puede cambiar. Elimina y recrea si es necesario.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => { setFormData({ ...formData, full_name: e.target.value }); clearFieldError('full_name'); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                  required
                  {...fieldAria('staff-name-error', !!fieldErrors.full_name)}
                />
                <FieldError id="staff-name-error" message={fieldErrors.full_name} />
              </div>

              {editingStaff && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Activo</span>
                  </label>
                </div>
              )}

              {!editingStaff && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña (opcional)
                  </label>
                  <input
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary"
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Si la defines, el staff entra directo con email + contraseña. Si la dejas vacía, se le envía un magic link por email.
                  </p>
                </div>
              )}
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancelar
                </button>
                {editingStaff ? (
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? 'Guardando...' : 'Actualizar'}
                  </button>
                ) : (
                  <button type="submit" disabled={inviting} className="btn-primary">
                    {inviting ? 'Enviando...' : 'Crear e Invitar'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Nombre</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Email</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Estado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Vinculado a Auth</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Creado</th>
              <th className="text-left p-3 text-sm font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-gray-50">
                <td className="p-3 font-medium">{staff.full_name}</td>
                <td className="p-3 text-sm text-gray-600">{staff.email}</td>
                <td className="p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={staff.is_active}
                      onChange={(e) => handleToggleActive(staff.id, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{staff.is_active ? 'Activo' : 'Inactivo'}</span>
                  </label>
                </td>
                <td className="p-3 text-sm">
                  {staff.auth_user_id ? (
                    <span className="text-green-600">✓ Sí</span>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </td>
                <td className="p-3 text-sm text-gray-500">
                  {new Date(staff.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(staff)}
                      className="text-sm text-primary hover:underline"
                    >
                      Editar
                    </button>
                    {staff.auth_user_id && !editingStaff && (
                      <button
                        onClick={() => handleDelete(staff.id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  No hay miembros del staff. Crea el primero para empezar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Cómo funciona el acceso del staff</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
          <li>Si defines una <strong>contraseña</strong> al crear el staff, puede iniciar sesión de inmediato con email + contraseña.</li>
          <li>Si no la defines, se envía un <strong>magic link</strong> al email indicado (acceso sin contraseña).</li>
          <li>Al primer acceso, se vincula automáticamente su cuenta Supabase Auth al registro de staff.</li>
          <li>Si olvida su contraseña, puede recuperarla desde <code>/recuperar</code>.</li>
          <li>Un staff desactivado no puede acceder al panel aunque tenga credenciales válidas.</li>
        </ul>
      </div>
    </div>
  );
}