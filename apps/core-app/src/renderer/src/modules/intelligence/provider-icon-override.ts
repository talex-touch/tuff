import type { ITuffIcon } from '@talex-touch/utils'
import { parseIconIdentifier } from '@talex-touch/tuffex/icon-picker'
import { getProviderChannelType, type ProviderChannelKind } from './provider-channel-type'
import { providerIconForChannel } from './provider-icons'

/**
 * A provider's icon, honouring the one the user picked.
 *
 * Deliberately not in `provider-icons.ts`: `uno.config.ts` imports that module
 * to build its safelist, and UnoCSS's config loader evaluates it outside Vite's
 * alias table. A runtime import of `@talex-touch/tuffex/icon-picker` there would
 * have to resolve against `dist`, which is not built during a fresh dev start —
 * the config would throw before the app ever renders. That module's own header
 * already records the constraint ("has only type-level imports, so the config
 * loader can evaluate it"); this file is where the runtime half lives.
 */

/** Where the picked identifier is persisted on a provider. */
export const PROVIDER_ICON_METADATA_KEY = 'icon'
/** Where the picked plate shape is persisted. */
export const PROVIDER_ICON_SHAPE_METADATA_KEY = 'iconShape'

export interface ProviderIconSubject {
  type: string
  baseUrl?: string
  metadata?: Record<string, unknown>
}

/**
 * The identifier the user picked for this provider, or `''` — which is both
 * "never picked one" and the empty value `TxIconPicker` binds with `v-model`.
 */
export function providerIconIdentifier(provider: ProviderIconSubject): string {
  const raw = provider.metadata?.[PROVIDER_ICON_METADATA_KEY]
  return typeof raw === 'string' ? raw : ''
}

/**
 * The icon a provider row should draw: the user's pick first, then the
 * channel's adapter mark, then the runtime type's glyph.
 *
 * A malformed identifier — hand-edited config, a value from an older schema —
 * falls through to the adapter mark rather than rendering an empty box.
 *
 * `channelType` is accepted rather than derived so a caller editing a draft can
 * pass the type being selected, which is not yet on the provider.
 */
export function resolveProviderIcon(
  provider: ProviderIconSubject,
  channelType: ProviderChannelKind = getProviderChannelType(provider)
): ITuffIcon {
  const picked = parseIconIdentifier(providerIconIdentifier(provider)) as ITuffIcon | null
  return picked ?? providerIconForChannel(channelType, provider.type)
}
