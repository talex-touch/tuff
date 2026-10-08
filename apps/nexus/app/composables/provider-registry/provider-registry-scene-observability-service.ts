import { $fetch as rawFetch } from 'ofetch'
import type {
  ProviderCapabilityRecord,
  ProviderHealthCheckEntry,
  ProviderUsageLedgerEntry,
  SceneRegistryRecord,
  SceneRunResult,
} from '~/utils/provider-registry-admin'

/** `GET …/usage` and `GET …/health` answer a page with the filtered total. */
export interface ProviderObservabilityPage<Entry> {
  entries?: Entry[]
  page?: number
  limit?: number
  total?: number
}

function readTotal(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function createProviderRegistrySceneObservabilityService(fetcher: typeof rawFetch = rawFetch) {
  async function seedRegistry() {
    await fetcher('/api/dashboard/provider-registry/seed', { method: 'POST' })
  }

  async function loadRegistryCollections() {
    const [capabilityResult, sceneResult, usageResult, healthResult, unhealthyResult] = await Promise.all([
      fetcher<{ capabilities: ProviderCapabilityRecord[] }>('/api/dashboard/provider-registry/capabilities'),
      fetcher<{ scenes: SceneRegistryRecord[] }>('/api/dashboard/provider-registry/scenes'),
      fetcher<ProviderObservabilityPage<ProviderUsageLedgerEntry>>('/api/dashboard/provider-registry/usage', {
        query: { limit: 25 },
      }),
      fetcher<ProviderObservabilityPage<ProviderHealthCheckEntry>>('/api/dashboard/provider-registry/health', {
        query: { limit: 25 },
      }),
      // Only its total: the health card counts every check that did not pass.
      fetcher<ProviderObservabilityPage<ProviderHealthCheckEntry>>('/api/dashboard/provider-registry/health', {
        query: { status: 'degraded,unhealthy', limit: 1 },
      }),
    ])

    const usageEntries = usageResult.entries ?? []
    return {
      capabilities: capabilityResult.capabilities ?? [],
      healthEntries: healthResult.entries ?? [],
      scenes: sceneResult.scenes ?? [],
      usageEntries,
      // The ledger's own count, not the 25-row window's length.
      usageTotal: readTotal(usageResult.total, usageEntries.length),
      unhealthyTotal: readTotal(unhealthyResult.total, 0),
    }
  }

  /** One server page of the usage ledger; `query` is `buildUsageListQuery`'s. */
  async function listUsageEntries(query: Record<string, string | number>) {
    return await fetcher<ProviderObservabilityPage<ProviderUsageLedgerEntry>>('/api/dashboard/provider-registry/usage', { query })
  }

  /** One server page of the health checks; `query` is `buildHealthListQuery`'s. */
  async function listHealthChecks(query: Record<string, string | number>) {
    return await fetcher<ProviderObservabilityPage<ProviderHealthCheckEntry>>('/api/dashboard/provider-registry/health', { query })
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
    listHealthChecks,
    listUsageEntries,
    loadRegistryCollections,
    runScene,
    seedRegistry,
    updateScene,
  }
}
