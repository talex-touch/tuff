import { type InjectionKey, ref } from 'vue'

export interface DocsPrimaryDemoTracker {
  /**
   * Claims the primary interactive React/WC showcase slot for a component slug
   * on the current docs page. Only the first registered wrapper claims the slot.
   */
  claimPrimary: (slug: string, instanceId: string) => boolean
  /** Releases the primary slot when the owning demo unmounts or switches slug. */
  releasePrimary: (slug: string, instanceId: string) => void
  /** Returns whether `instanceId` owns the primary showcase slot for `slug`. */
  isPrimary: (slug: string, instanceId: string) => boolean
  /** Clears all registered owners (e.g. when the rendered document key changes). */
  reset: () => void
}

export const DOCS_PRIMARY_DEMO_KEY: InjectionKey<DocsPrimaryDemoTracker> = Symbol('docs-primary-demo')

export function createDocsPrimaryDemoTracker(): DocsPrimaryDemoTracker {
  const owners = ref<Record<string, string>>({})

  function claimPrimary(slug: string, instanceId: string): boolean {
    const normalized = slug.trim().toLowerCase()
    if (!normalized || !instanceId)
      return false
    const current = owners.value[normalized]
    if (!current) {
      owners.value = { ...owners.value, [normalized]: instanceId }
      return true
    }
    return current === instanceId
  }

  function releasePrimary(slug: string, instanceId: string): void {
    const normalized = slug.trim().toLowerCase()
    if (!normalized || owners.value[normalized] !== instanceId)
      return
    const next = { ...owners.value }
    delete next[normalized]
    owners.value = next
  }

  function isPrimary(slug: string, instanceId: string): boolean {
    const normalized = slug.trim().toLowerCase()
    if (!normalized || !instanceId)
      return true
    const current = owners.value[normalized]
    return !current || current === instanceId
  }

  function reset(): void {
    if (Object.keys(owners.value).length > 0)
      owners.value = {}
  }

  return {
    claimPrimary,
    releasePrimary,
    isPrimary,
    reset,
  }
}
