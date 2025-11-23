import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { ref } from 'vue'

interface OfficialManifestVersionEntry {
  version: string
  path: string
  timestamp?: string
}

interface OfficialManifestEntry {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  path: string
  timestamp?: string
  metadata?: {
    readme_path?: string
    [key: string]: unknown
  }
  versions?: OfficialManifestVersionEntry[]
}

export interface OfficialPluginListItem {
  id: string
  name: string
  author?: string
  version: string
  category?: string
  description?: string
  downloadUrl: string
  readmeUrl?: string
  official: boolean
  icon?: string
  metadata?: Record<string, unknown>
  timestamp?: string
}

const MANIFEST_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/plugins.json'
const MANIFEST_BASE_URL =
  'https://raw.githubusercontent.com/talex-touch/tuff-official-plugins/main/'

/**
 * Composable for managing market plugin data
 * Handles loading official plugins from manifest and caching
 */
export function useMarketData() {
  const officialPlugins = ref<OfficialPluginListItem[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const lastUpdated = ref<number | null>(null)

  let rendererChannel: ITouchClientChannel | undefined
  let channelLoadFailed = false

  function mapManifestEntry(entry: OfficialManifestEntry): OfficialPluginListItem {
    const normalizedPath = entry.path.replace(/^\//, '')
    const downloadUrl = new URL(normalizedPath, MANIFEST_BASE_URL).toString()

    let readmeUrl: string | undefined
    const readmePath = entry.metadata?.readme_path
    if (readmePath && readmePath.trim().length > 0) {
      readmeUrl = new URL(readmePath.replace(/^\//, ''), MANIFEST_BASE_URL).toString()
    }

    const metadata = entry.metadata ?? {}
    let icon: string | undefined
    if (typeof metadata.icon_class === 'string' && metadata.icon_class.trim().length > 0) {
      icon = metadata.icon_class.trim()
    } else if (typeof metadata.icon === 'string' && metadata.icon.trim().length > 0) {
      const trimmed = metadata.icon.trim()
      icon = trimmed.startsWith('i-') ? trimmed : `i-${trimmed}`
    }

    return {
      id: entry.id,
      name: entry.name,
      author: entry.author,
      version: entry.version,
      category: entry.category,
      description: entry.description,
      downloadUrl,
      readmeUrl,
      official: true,
      icon,
      metadata: entry.metadata,
      timestamp: entry.timestamp
    }
  }

  async function fetchManifestDirect(): Promise<{
    plugins: OfficialPluginListItem[]
    fetchedAt: number
  }> {
    const response = await fetch(MANIFEST_URL, {
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`OFFICIAL_PLUGIN_HTTP_${response.status}`)
    }

    const body = await response.json()
    if (!Array.isArray(body)) {
      throw new TypeError('OFFICIAL_PLUGIN_INVALID_MANIFEST')
    }

    const plugins = body.map((entry: OfficialManifestEntry) => mapManifestEntry(entry))
    return { plugins, fetchedAt: Date.now() }
  }

  function isElectronRenderer(): boolean {
    return Boolean(typeof window !== 'undefined' && window.process?.type === 'renderer')
  }

  async function getRendererChannel(): Promise<ITouchClientChannel | undefined> {
    if (rendererChannel) return rendererChannel
    if (channelLoadFailed || !isElectronRenderer()) return undefined

    try {
      const module = await import('~/modules/channel/channel-core')
      rendererChannel = module.touchChannel as ITouchClientChannel
      return rendererChannel
    } catch (error) {
      channelLoadFailed = true
      console.warn('[Market] Failed to load channel-core module:', error)
      return undefined
    }
  }

  async function loadOfficialPlugins(force = false): Promise<void> {
    if (loading.value) return

    loading.value = true
    errorMessage.value = ''

    try {
      let result: { plugins: OfficialPluginListItem[]; fetchedAt: number } | null = null

      const channel = await getRendererChannel()
      if (channel) {
        try {
          const response: any = await channel.send('plugin:official-list', { force })

          if (!response || !Array.isArray(response.plugins)) {
            throw new Error(response?.error || 'OFFICIAL_PLUGIN_FETCH_FAILED')
          }

          result = {
            plugins: response.plugins as OfficialPluginListItem[],
            fetchedAt: typeof response.fetchedAt === 'number' ? response.fetchedAt : Date.now()
          }
        } catch (error) {
          console.warn('[Market] Failed to load official plugins via IPC, fallback to HTTP:', error)
        }
      }

      if (!result) {
        result = await fetchManifestDirect()
      }

      officialPlugins.value = result.plugins
      lastUpdated.value = result.fetchedAt
    } catch (error: any) {
      console.error('[Market] Failed to load official plugins:', error)
      const reason =
        typeof error?.message === 'string' && error.message.trim().length > 0
          ? error.message.trim()
          : ''
      const shouldExposeReason =
        reason && !reason.startsWith('OFFICIAL_PLUGIN_') && reason !== 'OFFICIAL_PLUGIN_FETCH_FAILED'

      errorMessage.value = shouldExposeReason ? reason : 'market.error.loadFailed'
    } finally {
      loading.value = false
    }
  }

  return {
    officialPlugins,
loading,
    errorMessage,
    lastUpdated,
    loadOfficialPlugins
  }
}
