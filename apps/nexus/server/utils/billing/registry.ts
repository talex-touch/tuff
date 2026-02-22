import type { BillingProvider, BillingProviderKey } from './types'

const providers = new Map<BillingProviderKey, BillingProvider>()

export function registerBillingProvider(provider: BillingProvider): void {
  providers.set(provider.key, provider)
}

export function getBillingProvider(key: BillingProviderKey): BillingProvider | null {
  return providers.get(key) ?? null
}

export function listBillingProviders(): BillingProvider[] {
  return Array.from(providers.values())
}
