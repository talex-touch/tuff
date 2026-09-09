import type { ITuffIcon } from '@talex-touch/utils'
import type { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import type { ProviderChannelKind } from './provider-channel-type'

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
const PROVIDER_CHANNEL_ICONS: Readonly<Partial<Record<ProviderChannelKind, ITuffIcon>>> =
  Object.freeze({
    bailian: { type: 'class', value: 'i-simple-icons-qwen' },
    volcengine: { type: 'class', value: 'i-simple-icons-bytedance' }
  })

export const PROVIDER_ICON_CLASSES: readonly string[] = Array.from(
  new Set([
    ...Object.values(PROVIDER_ICONS).map((icon) => icon.value),
    ...Object.values(PROVIDER_CHANNEL_ICONS).map((icon) => icon.value)
  ])
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

/** A channel's adapter mark takes precedence over its shared runtime `custom` type. */
export function providerIconForChannel(channelType: ProviderChannelKind, type: string): ITuffIcon {
  return Object.hasOwn(PROVIDER_CHANNEL_ICONS, channelType)
    ? PROVIDER_CHANNEL_ICONS[channelType]!
    : providerIconFor(type)
}

/**
 * The icons for the local AI CLIs, keyed by the seeded provider id the main process gives each
 * one. `pi-cli-default` is `PI_CLI_PROVIDER_ID` in `main/modules/ai/providers/pi-cli-runtime.ts`;
 * repeated here rather than imported because the renderer cannot reach main-process modules.
 *
 * Only pi exists as a provider today. omp, codex and claude are being added by the local-CLI
 * providers task, which also threads an `origin` through the transport; when that lands, this
 * table is keyed by origin instead of by seeded id and grows one row per CLI. The shape is
 * already the one that task's design names.
 */
const CLI_PROVIDER_ICONS: Readonly<Record<string, ITuffIcon>> = Object.freeze({
  'pi-cli-default': { type: 'class', value: 'i-simple-icons-pi' }
})

/** Every class `providerIconForId` can add on top of `PROVIDER_ICONS`, for the same safelist. */
export const PROVIDER_ID_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(CLI_PROVIDER_ICONS).map((icon) => icon.value)))
)

/**
 * The icon for a provider *instance*: a CLI gets its own mark, anything else the type's icon.
 *
 * pi and a local Ollama are both `type: 'local'`, so by type alone they share the server glyph,
 * and two chips side by side with the same mark tell the user nothing. Own-property lookup, as in
 * `providerIconFor`, so `constructor` cannot resolve to a prototype member.
 */
export function providerIconForId(providerId: string, type: string): ITuffIcon {
  return Object.hasOwn(CLI_PROVIDER_ICONS, providerId)
    ? CLI_PROVIDER_ICONS[providerId]
    : providerIconFor(type)
}
