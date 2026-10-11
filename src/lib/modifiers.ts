import type { ModifierGroup, Product } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

export interface GroupValidationResult {
  isValid: boolean;
  isMissing: boolean;
  currentCount: number;
  min: number;
  max: number;
}

export interface CanonicalModifierState {
  isComplete: boolean;
  missingGroups: string[];
  calculatedPrice: number;
}

/**
 * ENABLER E-01: Retorna un objeto canónico de estado de modificadores.
 * Valida consistencia de selecciones obligatorias y calcula el precio total.
 */
export function getCanonicalModifierState(
  product: Product,
  selections: Record<string, Set<string>>,
  quantity = 1
): CanonicalModifierState {
  const groups = product.modifier_groups || [];
  const missingGroups: string[] = [];

  for (const group of groups) {
    const selected = selections[group.id] || new Set();
    const status = validateGroupSelections(group, selected);
    if (status.isMissing) {
      missingGroups.push(group.name);
    }
  }

  const calculatedPrice = calculateProductTotalPrice(product, selections, quantity);

  return {
    isComplete: missingGroups.length === 0,
    missingGroups,
    calculatedPrice,
  };
}

export const validateModifierState = getCanonicalModifierState;


/**
 * Valida si las opciones seleccionadas para un grupo cumplen con los requisitos mínimos y máximos.
 */
export function validateGroupSelections(
  group: ModifierGroup,
  selectedIds: Set<string> | undefined
): GroupValidationResult {
  const count = selectedIds ? selectedIds.size : 0;
  const minRequired = group.is_required
    ? Math.max(1, group.min_selections || 0)
    : (group.min_selections || 0);
  const isMissing = count < minRequired;
  const exceedsMax = group.max_selections > 0 && count > group.max_selections;

  return {
    isValid: !isMissing && !exceedsMax,
    isMissing,
    currentCount: count,
    min: minRequired,
    max: group.max_selections,
  };
}

/**
 * Encuentra el primer grupo obligatorio que aún no tiene cubierta su selección mínima.
 */
export function getFirstPendingRequiredGroup(
  groups: ModifierGroup[],
  selections: Record<string, Set<string>>
): ModifierGroup | null {
  for (const group of groups) {
    const selected = selections[group.id] || new Set();
    const status = validateGroupSelections(group, selected);
    if (status.isMissing) {
      return group;
    }
  }
  return null;
}

/**
 * Calcula el precio total del producto sumando el precio base más el impacto de modificadores seleccionados.
 */
export function calculateProductTotalPrice(
  product: Product,
  selections: Record<string, Set<string>>,
  quantity = 1
): number {
  const groups = product.modifier_groups || [];
  let extraPerUnit = 0;

  for (const group of groups) {
    const selectedIds = selections[group.id] || new Set();
    for (const opt of group.options) {
      if (selectedIds.has(opt.id)) {
        extraPerUnit += opt.price_impact;
      }
    }
  }

  return (product.base_price + extraPerUnit) * quantity;
}

export interface ToggleOptionResult {
  nextSelections: Set<string>;
  blocked: boolean;
  limitWarning?: string;
}

/**
 * Alterna la selección de una opción respetando reglas de radio (máx 1),
 * checkboxes con tope (máx N) y genera el microcopy de límite inline cuando se bloquea una selección adicional.
 */
export function toggleGroupOption(
  group: ModifierGroup,
  currentSelected: Set<string>,
  optionId: string
): ToggleOptionResult {
  const next = new Set(currentSelected);

  // Si ya estaba seleccionada: deseleccionarla
  if (next.has(optionId)) {
    next.delete(optionId);
    return {
      nextSelections: next,
      blocked: false,
    };
  }

  // Si es selección única (radio): reemplazar selección anterior
  if (group.max_selections === 1) {
    next.clear();
    next.add(optionId);
    return {
      nextSelections: next,
      blocked: false,
    };
  }

  // Si es selección múltiple con tope y ya alcanzó el límite: bloquear y mostrar microcopy
  if (group.max_selections > 1 && currentSelected.size >= group.max_selections) {
    return {
      nextSelections: currentSelected,
      blocked: true,
      limitWarning: `Máximo ${group.max_selections} opciones permitidas`,
    };
  }

  // Selección permitida
  next.add(optionId);
  return {
    nextSelections: next,
    blocked: false,
  };
}

/**
 * Tokens de accesibilidad de selección táctil y contraste de foco WCAG 2.2 AA (ENABLER E-01).
 */
export const ACCESSIBLE_TOUCH_TARGET = 'min-w-[44px] min-h-[44px]';
export const ACCESSIBLE_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2';

/**
 * Genera el badge descriptivo para el grupo según las especificaciones de US-01:
 * "Obligatorio (elige 1)" vs "Opcional"
 */
export function getModifierGroupBadge(
  group: ModifierGroup,
  currentCount?: number
): {
  label: string;
  isRequired: boolean;
} {
  if (group.is_required) {
    const min = group.min_selections > 0 ? group.min_selections : 1;
    if (currentCount !== undefined) {
      return { label: `Obligatorio (${currentCount}/${min})`, isRequired: true };
    }
    if (group.max_selections === 1 || (!group.max_selections && (group.min_selections ?? 1) === 1)) {
      return { label: 'Obligatorio (elige 1)', isRequired: true };
    }
    if (group.max_selections === min) {
      return { label: `Obligatorio (elige ${min})`, isRequired: true };
    }
    return { label: `Obligatorio (elige al menos ${min})`, isRequired: true };
  }

  return { label: 'Opcional', isRequired: false };
}

/**
 * Genera el microcopy contextual guiado para grupos obligatorios incompletos (US-01).
 * Convierte el nombre del grupo a una indicación clara y accesible.
 * Ej: "Tipo de Salsa" -> "Selecciona 1 salsa"
 *     "Término de la carne" -> "Selecciona 1 término de la carne"
 *     "Salsas" -> "Selecciona 1 salsa"
 */
export function formatPendingGroupPrompt(group: ModifierGroup, remaining = 1): string {
  let name = group.name.trim();

  // Quitar prefijo "Tipo de " / "Tipos de " / "Selección de "
  name = name.replace(/^(tipos?|selecci[oó]n)\s+de\s+/i, '').trim();

  // Singularizar si solo falta 1 y termina en s plural en español
  if (remaining === 1) {
    if (/ciones$/i.test(name)) {
      name = name.replace(/ciones$/i, 'ción');
    } else if (/s$/i.test(name) && !/tres|dos|mes|país|carne|base/i.test(name)) {
      name = name.slice(0, -1);
    }
  }

  const lowerName = name.charAt(0).toLowerCase() + name.slice(1);
  return `Selecciona ${remaining} ${lowerName}`;
}

/**
 * Estado y copy del botón de acción según los Criterios de Aceptación de US-01.
 */
export function getActionButtonState(
  groups: ModifierGroup[],
  selections: Record<string, Set<string>>,
  totalPrice: number,
  mode: 'guided' | 'generic' = 'guided'
): {
  isValid: boolean;
  pendingGroup: ModifierGroup | null;
  buttonText: string;
  formattedPrice: string;
} {
  const pendingGroup = getFirstPendingRequiredGroup(groups, selections);
  const formattedPrice = formatMXN(totalPrice);

  if (pendingGroup) {
    const selectedIds = selections[pendingGroup.id] || new Set();
    const minRequired = pendingGroup.is_required
      ? Math.max(1, pendingGroup.min_selections || 0)
      : (pendingGroup.min_selections || 0);
    const remaining = Math.max(1, minRequired - selectedIds.size);

    return {
      isValid: false,
      pendingGroup,
      buttonText:
        mode === 'generic'
          ? 'Elige opciones obligatorias'
          : formatPendingGroupPrompt(pendingGroup, remaining),
      formattedPrice,
    };
  }

  return {
    isValid: true,
    pendingGroup: null,
    buttonText: `Agregar al pedido • ${formattedPrice}`,
    formattedPrice,
  };
}
