import { $fetch as rawFetch } from 'ofetch'
import type {
  ProviderCapabilityRecord,
  ProviderHealthCheckEntry,
  ProviderUsageLedgerEntry,
  SceneRegistryRecord,
  SceneRunResult,
} from '~/utils/provider-registry-admin'

export function createProviderRegistrySceneObservabilityService(fetcher: typeof rawFetch = rawFetch) {
  async function seedRegistry() {
    await fetcher('/api/dashboard/provider-registry/seed', { method: 'POST' })
  }

  async function loadRegistryCollections() {
    const [capabilityResult, sceneResult, usageResult, healthResult] = await Promise.all([
      fetcher<{ capabilities: ProviderCapabilityRecord[] }>('/api/dashboard/provider-registry/capabilities'),
      fetcher<{ scenes: SceneRegistryRecord[] }>('/api/dashboard/provider-registry/scenes'),
      fetcher<{ entries: ProviderUsageLedgerEntry[] }>('/api/dashboard/provider-registry/usage', {
        query: { limit: 25 },
      }),
      fetcher<{ entries: ProviderHealthCheckEntry[] }>('/api/dashboard/provider-registry/health', {
        query: { limit: 25 },
      }),
    ])

    return {
      capabilities: capabilityResult.capabilities ?? [],
      healthEntries: healthResult.entries ?? [],
      scenes: sceneResult.scenes ?? [],
      usageEntries: usageResult.entries ?? [],
    }
  }

  async function createScene(body: Record<string, unknown>) {
    await fetcher('/api/dashboard/provider-registry/scenes', { method: 'POST', body })
  }

  async function updateScene(sceneId: string, body: Record<string, unknown>) {
    await fetcher(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(sceneId)}`, {
      method: 'PATCH',
      body,
    })
  }

  async function deleteScene(sceneId: string) {
    await fetcher(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(sceneId)}`, {
      method: 'DELETE',
    })
  }

  async function runScene(sceneId: string, body: Record<string, unknown>) {
    return await fetcher<{ run: SceneRunResult }>(`/api/dashboard/provider-registry/scenes/${encodeURIComponent(sceneId)}/run`, {
      method: 'POST',
      body,
    })
  }

  return {
    createScene,
    deleteScene,
    loadRegistryCollections,
    runScene,
    seedRegistry,
    updateScene,
  }
}
