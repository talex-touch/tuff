import type { MarketPlugin } from '@talex-touch/utils/market'
import { ref, computed } from 'vue'
import { getAuthToken, isAuthenticated } from '~/modules/market/auth-token-service'

const NEXUS_URL = import.meta.env.VITE_NEXUS_URL || 'https://tuff.tagzxia.com'

export interface UserPluginStats {
  total: number
  approved: number
  pending: number
  draft: number
}

export function useUserPlugins() {
  const plugins = ref<MarketPlugin[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastUpdated = ref<number | null>(null)

  const stats = computed<UserPluginStats>(() => {
    const all = plugins.value
    return {
      total: all.length,
      approved: all.filter(p => (p.metadata as any)?.status === 'approved').length,
      pending: all.filter(p => (p.metadata as any)?.status === 'pending').length,
      draft: all.filter(p => (p.metadata as any)?.status === 'draft').length,
    }
  })

  async function loadUserPlugins(): Promise<void> {
    if (loading.value) return

    const authenticated = await isAuthenticated()
    if (!authenticated) {
      error.value = 'NOT_AUTHENTICATED'
      return
    }

    loading.value = true
    error.value = null

    try {
      const token = await getAuthToken()
      if (!token) {
        error.value = 'NO_TOKEN'
        return
      }

      const response = await fetch(`${NEXUS_URL}/api/dashboard/plugins`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          error.value = 'UNAUTHORIZED'
        }
        else {
          error.value = `HTTP_ERROR_${response.status}`
        }
        return
      }

      const data = await response.json()
      plugins.value = normalizePlugins(data.plugins || [])
      lastUpdated.value = Date.now()
    }
    catch (err) {
      console.error('[useUserPlugins] Failed to load:', err)
      error.value = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
    }
    finally {
      loading.value = false
    }
  }

  function normalizePlugins(rawPlugins: any[]): MarketPlugin[] {
    return rawPlugins.map((plugin) => ({
      id: plugin.slug || plugin.id,
      name: plugin.name,
      author: plugin.author?.name,
      version: plugin.latestVersion?.version,
      description: plugin.summary,
      category: plugin.category,
      timestamp: plugin.latestVersion?.createdAt || plugin.updatedAt,
      icon: plugin.iconUrl ?? undefined,
      metadata: {
        status: plugin.status,
        installs: plugin.installs,
        badges: plugin.badges,
        isOfficial: plugin.isOfficial,
        homepage: plugin.homepage,
      },
      readmeUrl: plugin.readmeMarkdown ? `${NEXUS_URL}/api/market/plugins/${plugin.slug}/readme` : undefined,
      homepage: plugin.homepage ?? undefined,
      downloadUrl: plugin.latestVersion?.packageUrl ?? '',
      install: plugin.latestVersion?.packageUrl
        ? {
            type: 'url' as const,
            url: plugin.latestVersion.packageUrl,
            format: 'tpex',
          }
        : undefined,
      providerId: 'nexus',
      providerName: 'Tuff Nexus',
      providerType: 'tpexApi',
      providerTrustLevel: 'official' as const,
      trusted: true,
      official: plugin.isOfficial || false,
    }))
  }

  function clear(): void {
    plugins.value = []
    error.value = null
    lastUpdated.value = null
  }

  return {
    plugins,
    stats,
    loading,
    error,
    lastUpdated,
    loadUserPlugins,
    clear,
  }
}
