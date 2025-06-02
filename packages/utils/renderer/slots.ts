import { VNode } from 'vue';

type SlotSelector = string | string[] | ((name: string) => boolean);
type VNodePredicate = (node: VNode) => boolean;

/**
 * Normalizes a slot input into a flat array of VNodes.
 *
 * @param input - Slot input, which can be a function, VNode, or array of VNodes.
 * @returns A flat array of VNodes.
 *
 * @example
 * ```ts
 * // Normalize a mixed slot manually (VNode | VNode[] | () => VNode[])
 * const vnodes = normalizeSlot(this.$slots.default);
 * ```
 */
export function normalizeSlot(input: unknown): VNode[] {
  if (!input) return [];

  if (typeof input === 'function') {
    return normalizeSlot(input());
  }

  if (Array.isArray(input)) {
    return input.flatMap(normalizeSlot);
  }

  return [input as VNode];
}

/**
 * Recursively flattens a list of VNodes and filters them using an optional predicate.
 *
 * @param nodes - The VNodes to flatten and filter.
 * @param predicate - Optional function to filter VNodes.
 * @returns A flat array of VNodes that satisfy the predicate.
 *
 * @example
 * ```ts
 * // Flatten children of a given vnode array, filtering by custom type
 * const flat = flattenVNodes(vnodes, vnode => typeof vnode.type === 'object');
 * ```
 */
export function flattenVNodes(
  nodes: VNode[],
  predicate?: VNodePredicate
): VNode[] {
  const result: VNode[] = [];

  for (const node of nodes) {
    if (!node) continue;

    if (predicate?.(node)) {
      result.push(node);
    } else if (node.children) {
      const children = normalizeSlot(node.children);
      result.push(...flattenVNodes(children, predicate));
    }
  }

  return result;
}

/**
 * Extracts and flattens VNodes from one or more named slots,
 * optionally filtered by a VNode predicate.
 *
 * @param slots - The slots object (e.g., this.$slots).
 * @param slotSelector - Slot name(s) or a function to select slot names.
 * @param predicate - Optional function to filter VNodes.
 * @returns A flat array of matching VNodes from the selected slots.
 *
 * @example
 * ```ts
 * // 1. Extract from default slot and keep only nodes with name === 'MyComponent'
 * const result1 = extractFromSlots(this.$slots, 'default', vnode => vnode.type?.name === 'MyComponent');
 *
 * // 2. Extract all VNodes from 'header' and 'footer' slots
 * const result2 = extractFromSlots(this.$slots, ['header', 'footer']);
 *
 * // 3. Extract all VNodes from slots whose names start with 'section-'
 * const result3 = extractFromSlots(this.$slots, name => name.startsWith('section-'));
 * ```
 */
export function extractFromSlots(
  slots: Record<string, unknown>,
  slotSelector: SlotSelector = 'default',
  predicate?: VNodePredicate
): VNode[] {
  const selectedSlotNames = resolveSlotNames(slots, slotSelector);

  const vnodes = selectedSlotNames.flatMap((name) =>
    normalizeSlot(slots[name])
  );

  return flattenVNodes(vnodes, predicate);
}

/**
 * Resolves slot names from the selector input.
 *
 * @param slots - The slots object.
 * @param selector - A string, string array, or function.
 * @returns An array of matched slot names.
 */
function resolveSlotNames(
  slots: Record<string, unknown>,
  selector: SlotSelector
): string[] {
  if (typeof selector === 'string') {
    return slots[selector] ? [selector] : [];
  }

  if (Array.isArray(selector)) {
    return selector.filter((name) => !!slots[name]);
  }

  if (typeof selector === 'function') {
    return Object.keys(slots).filter(selector);
  }

  return [];
}
