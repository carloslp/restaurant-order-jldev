import type { ModifierGroup, Product } from '@/lib/types';
import { formatMXN } from '@/lib/pricing';

export interface GroupValidationResult {
  isValid: boolean;
  isMissing: boolean;
  currentCount: number;
  min: number;
  max: number;
}

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
 * Genera el badge descriptivo para el grupo según las especificaciones del feature:
 * Badges claros de "Obligatorio: elige 1" vs "Opcional"
 */
export function getModifierGroupBadge(group: ModifierGroup): {
  label: string;
  isRequired: boolean;
} {
  if (group.is_required) {
    if (group.max_selections === 1) {
      return { label: 'Obligatorio: elige 1', isRequired: true };
    }
    const min = group.min_selections > 0 ? group.min_selections : 1;
    if (group.max_selections === min) {
      return { label: `Obligatorio: elige ${min}`, isRequired: true };
    }
    return { label: `Obligatorio: elige al menos ${min}`, isRequired: true };
  }

  return { label: 'Opcional', isRequired: false };
}

/**
 * Estado y copy del botón de acción según los Criterios de Aceptación CA-1 y CA-2.
 */
export function getActionButtonState(
  groups: ModifierGroup[],
  selections: Record<string, Set<string>>,
  totalPrice: number
): {
  isValid: boolean;
  pendingGroup: ModifierGroup | null;
  buttonText: string;
  formattedPrice: string;
} {
  const pendingGroup = getFirstPendingRequiredGroup(groups, selections);
  const formattedPrice = formatMXN(totalPrice);

  if (pendingGroup) {
    return {
      isValid: false,
      pendingGroup,
      buttonText: `Selecciona ${pendingGroup.name}`,
      formattedPrice,
    };
  }

  return {
    isValid: true,
    pendingGroup: null,
    buttonText: `Agregar al carrito · ${formattedPrice}`,
    formattedPrice,
  };
}
