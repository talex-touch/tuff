import type { ITuffIcon } from '@talex-touch/utils'
import TuffLogo from '~/assets/logo.svg'

export const TUFF_NEXUS_PROVIDER_ID = 'tuff-nexus-default'

export const TUFF_NEXUS_PROVIDER_ICON: ITuffIcon = {
  type: 'url',
  value: TuffLogo,
  colorful: true
}

export function isNexusManagedProvider(provider: {
  id?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  return provider.id === TUFF_NEXUS_PROVIDER_ID || provider.metadata?.origin === 'tuff-nexus'
}
