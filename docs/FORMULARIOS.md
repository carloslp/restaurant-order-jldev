# Convención de formularios y manejo de errores

**Regla de oro:** el error crudo de Supabase/PostgREST/Zod **nunca** llega al usuario. El crudo se loguea en servidor; al usuario llega un mensaje en español vía `AppError`.

## Server (Server Actions)

1. **Validación**: `parseOrThrow(Schema, payload)` (de `@/lib/errors`) en lugar de `Schema.parse()`. Lanza `AppError` con `fieldErrors` por campo.
2. **Números**: usar `zNumberES('mensaje')` (de `@/lib/validation`) — es `z.coerce.number()` con mensaje en español; evita el `Invalid input: expected number, received NaN` en inglés cuando el form manda basura.
3. **Queries Supabase**: `queryOrThrow(supabase.from(...)...single(), { action, fallback })` — loguea el crudo y lanza `AppError` con `parsePostgrestError()`.
4. **Deletes/updates sin select**: `if (error) { console.error('acción:', error); throw new AppError(parsePostgrestError(error, 'fallback')); }`.
5. **Mensajes del dominio**: `throw new AppError('mensaje', { fieldErrors: { campo: '...' } })`.

### Mapa PG/PGRST → usuario (parsePostgrestError)
| Código | Mensaje |
|---|---|
| `23505` | Ya existe un registro con esos datos |
| `23503` | Referencia inválida |
| `23514` | No cumple reglas del sistema |
| `23502` | Falta un dato obligatorio |
| `PGRST116` | Registro no encontrado |
| `PGRST204/200/201` | Error de configuración (bug nuestro) |
| storage `Bucket not found` / `too large` | Mensajes específicos |

## Cliente (formularios)

1. **Hook**: `useServerForm()` (de `@/lib/forms`) → `{ saving, formError, fieldErrors, clearFieldError, submit }`.
2. **Submit**: `const ok = await submit(async () => { ...action... });` — si `!ok`, **conservar los valores** del form (no limpiar nada).
3. **UI**:
   - `<FormAlert message={formError} />` arriba del form (persistente, no solo toast).
   - `<FieldError id="campo-error" message={fieldErrors.campo} />` bajo cada input + `clearFieldError('campo')` al escribir.
   - `{...fieldAria('campo-error', !!fieldErrors.campo)}` para accesibilidad.
4. **Nunca** mostrar `err.message` directo; si se maneja un catch manual, usar `toUserMessage(err, 'fallback')` (barrera anti-crudo).

## Componentes/utilidades
- `src/lib/errors.ts` — `AppError`, `parsePostgrestError`, `formatZodError`, `toUserMessage`, `parseOrThrow`, `queryOrThrow`.
- `src/lib/forms.ts` — `useServerForm`.
- `src/components/ui/form-error.tsx` — `FormAlert`, `FieldError`, `fieldAria`.
- `src/lib/validation.ts` — `zNumberES` para todos los schemas numéricos.
- `tests/errors.test.ts` — 25 unit tests del catálogo (`npm run test`).

## Checklist para formularios nuevos
- [ ] Schema con `zNumberES` para numéricos y mensajes custom en español.
- [ ] Server Action con `parseOrThrow` + `queryOrThrow`.
- [ ] Cliente con `useServerForm` + `FormAlert` + `FieldError` por campo.
- [ ] Al fallar: conservar valores; toast solo para éxito.
- [ ] Duplicados/FK validados antes del insert con `AppError` + `fieldErrors`.
