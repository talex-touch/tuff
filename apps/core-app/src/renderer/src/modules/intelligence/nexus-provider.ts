import type { ITuffIcon } from '@talex-touch/utils'
import TuffLogo from '~/assets/logo.svg'

/**
 * Renderer-side Nexus provider module.
 *
 * The identity constant and predicate live in @talex-touch/utils so main and renderer cannot
 * classify a provider differently (#537) — this file re-exports them so the five components that
 * already import from here keep working, and owns the one piece that is genuinely renderer-only:
 * the logo, which is a bundled asset.
 */
export {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID,
  TUFF_NEXUS_PROVIDER_ORIGIN
} from '@talex-touch/utils/intelligence/nexus-provider'

export const TUFF_NEXUS_PROVIDER_ICON: ITuffIcon = {
  type: 'url',
  value: TuffLogo,
  colorful: true
}
