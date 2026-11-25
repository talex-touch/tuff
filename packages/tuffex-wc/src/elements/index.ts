import type { DefineTxElementOptions, TxCustomElementConstructor, TxElementBundle } from '../runtime/factory'
import { TIER_A_BUNDLES } from './tier-a'
import { TIER_B_BUNDLES } from './tier-b'
import { TIER_C_BUNDLES } from './tier-c'

export * from './tier-a'
export * from './tier-b'
export * from './tier-c'

export const ALL_TUFFEX_ELEMENT_BUNDLES: readonly TxElementBundle[] = [
  ...TIER_A_BUNDLES,
  ...TIER_B_BUNDLES,
  ...TIER_C_BUNDLES,
]

export interface RegisterTuffexElementsOptions extends Omit<DefineTxElementOptions, 'tagName'> {
  /** Optional custom tag prefix (defaults to `'tx'`). */
  prefix?: string
  /** Optional subset of canonical tags (e.g. `['tx-button', 'tx-card']`) to register. */
  include?: readonly string[]
  /** Optional list of canonical tags to skip. */
  exclude?: readonly string[]
}

/**
 * Bulk-register all 32 TuffEx Phase-1 modules (36 custom element tags) idempotently.
 * Uses Light DOM (`shadowRoot: false`) by default; pass `{ shadowRoot: true, styles }`
 * for Shadow DOM encapsulation.
 */
export function registerTuffexElements(
  options: RegisterTuffexElementsOptions = {},
): Record<string, TxCustomElementConstructor> {
  const prefix = (options.prefix ?? 'tx').replace(/-+$/, '')
  const includeSet = options.include ? new Set(options.include) : null
  const excludeSet = options.exclude ? new Set(options.exclude) : null
  const registered: Record<string, TxCustomElementConstructor> = {}

  for (const bundle of ALL_TUFFEX_ELEMENT_BUNDLES) {
    if (includeSet && !includeSet.has(bundle.tag))
      continue
    if (excludeSet && excludeSet.has(bundle.tag))
      continue

    const tagName = prefix === 'tx'
      ? bundle.tag
      : bundle.tag.replace(/^tx-/, `${prefix}-`)

    registered[tagName] = bundle.define({
      tagName,
      shadowRoot: options.shadowRoot,
      styles: options.styles,
      registry: options.registry,
    })
  }

  return registered
}
