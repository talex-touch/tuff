import type { ITuffIcon } from '@talex-touch/utils'
import type { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'

/**
 * One icon per provider type. `IntelligenceProviderHeader` and `IntelligenceItem` each carried a
 * private copy of this map; the home model menu is the third reader, so it moved here rather than
 * being pasted again. The keys are the `IntelligenceProviderType` values, and `satisfies` keeps
 * the table complete when a type is added.
 */
const PROVIDER_ICONS = {
  openai: { type: 'class', value: 'i-simple-icons-openai' },
  anthropic: { type: 'class', value: 'i-simple-icons-anthropic' },
  deepseek: { type: 'class', value: 'i-carbon-search-advanced' },
  siliconflow: { type: 'class', value: 'i-carbon-ibm-watson-machine-learning' },
  local: { type: 'class', value: 'i-carbon-bare-metal-server' },
  custom: { type: 'class', value: 'i-carbon-settings' }
} satisfies Record<IntelligenceProviderType, ITuffIcon>

/**
 * Every class the table can render, for the UnoCSS safelist in `uno.config.ts`. UnoCSS's
 * extractor scans templates, not `.ts` modules, so a class that lives only here never has its
 * CSS generated and the icon renders as an empty box — which is what happened when the map
 * moved out of the two `.vue` files. Derived from the table so the safelist cannot drift from it.
 */
export const PROVIDER_ICON_CLASSES: readonly string[] = Object.values(PROVIDER_ICONS).map(
  (icon) => icon.value
)

/**
 * The icon for a provider type. A type outside the enum — possible only from a hand-edited
 * config — gets the `custom` icon: it is a provider we know nothing about, which is what custom
 * means. Own-property lookup so `constructor` and friends cannot resolve to prototype members.
 */
export function providerIconFor(type: string): ITuffIcon {
  return Object.hasOwn(PROVIDER_ICONS, type)
    ? PROVIDER_ICONS[type as keyof typeof PROVIDER_ICONS]
    : PROVIDER_ICONS.custom
}
