import type { TuffIntelligenceStorageAdapter } from './types'

export function assertStorageAdapter(
  adapter: TuffIntelligenceStorageAdapter | null | undefined,
): TuffIntelligenceStorageAdapter {
  if (!adapter) {
    throw new Error('[tuff-intelligence] Missing storage adapter. You must inject a TuffIntelligenceStorageAdapter implementation.')
  }
  return adapter
}
