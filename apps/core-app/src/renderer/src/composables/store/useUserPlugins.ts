import type { StorePlugin } from '@talex-touch/utils/store'
import { computed, ref } from 'vue'
import { uploadNexusWithAuth, fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { isAuthenticated } from '~/modules/store/auth-token-service'
import { createRendererLogger } from '~/utils/renderer-log'

export type UserPluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
export type UserPluginStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type UserPluginVersionStatus = 'pending' | 'approved' | 'rejected'

export interface UserPluginVersion {
  id: string
  pluginId: string
  channel: UserPluginChannel
  version: string
  packageUrl?: string
  packageSize?: number
  changelog?: string | null
  manifest?: Record<string, unknown> | null
  status: UserPluginVersionStatus
  reviewedAt?: string | null
  rejectReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface UserPluginRecord {
  id: string
  userId: string
  slug: string
  name: string
  summary: string
  category: string
  artifactType?: 'plugin' | 'layout' | 'theme'
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: { name?: string } | null
  status: UserPluginStatus
  readmeMarkdown?: string | null
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  versions?: UserPluginVersion[]
  latestVersion?: UserPluginVersion | null
  hasPendingReview?: boolean
  pendingReviewCount?: number
}

export interface UserPluginTimelineEvent {
  id: string
  pluginId: string
  versionId?: string | null
  eventType: string
  actorRole: 'owner' | 'admin' | 'system'
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  meta?: Record<string, unknown> | null
  createdAt: string
}

export interface UserPluginStats {
  total: number
  approved: number
  pending: number
  draft: number
}

const userPluginsLog = createRendererLogger('UserPlugins')

export function useUserPlugins() {
  const plugins = ref<StorePlugin[]>([])
  const records = ref<UserPluginRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastUpdated = ref<number | null>(null)

  const stats = computed<UserPluginStats>(() => {
    const all = plugins.value
    return {
      total: all.length,
      approved: all.filter(
        (p) => (p.metadata as { status?: string } | undefined)?.status === 'approved'
      ).length,
      pending: all.filter(
        (p) => (p.metadata as { status?: string } | undefined)?.status === 'pending'
      ).length,
      draft: all.filter((p) => (p.metadata as { status?: string } | undefined)?.status === 'draft')
        .length
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
      const baseUrl = getAuthBaseUrl()
      const response = await fetchNexusWithAuth(
        '/api/dashboard/plugins',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json'
          }
        },
        'user-plugins'
      )

      if (!response) {
        error.value = 'NO_TOKEN'
        return
      }
      if (!response.ok) {
        if (response.status === 401) {
          error.value = 'UNAUTHORIZED'
        } else {
          error.value = `HTTP_ERROR_${response.status}`
        }
        return
      }

      const data = (await response.json()) as { plugins?: UserPluginRecord[] }
      records.value = data.plugins ?? []
      plugins.value = normalizePlugins(records.value, baseUrl)
      lastUpdated.value = Date.now()
    } catch (err) {
      userPluginsLog.error('Failed to load', err)
      error.value = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
    } finally {
      loading.value = false
    }
  }

  function normalizePlugins(rawPlugins: UserPluginRecord[], baseUrl: string): StorePlugin[] {
    return rawPlugins.flatMap((plugin) => {
      const id = plugin.slug ?? plugin.id
      if (!id) {
        return []
      }
      const name = plugin.name ?? id
      return [
        {
          id,
          name,
          author: plugin.author?.name,
          version: plugin.latestVersion?.version,
          description: plugin.summary,
          category: plugin.category,
          timestamp: plugin.latestVersion?.createdAt || plugin.updatedAt,
          iconUrl: plugin.iconUrl ?? undefined,
          metadata: {
            status: plugin.status,
            installs: plugin.installs,
            badges: plugin.badges,
            isOfficial: plugin.isOfficial,
            homepage: plugin.homepage,
            pluginId: plugin.id,
            slug: plugin.slug,
            latestVersionStatus: plugin.latestVersion?.status,
            latestVersionChannel: plugin.latestVersion?.channel
          },
          readmeUrl: plugin.readmeMarkdown
            ? `${baseUrl}/api/store/plugins/${plugin.slug}/readme`
            : undefined,
          homepage: plugin.homepage ?? undefined,
          downloadUrl: plugin.latestVersion?.packageUrl ?? '',
          install: plugin.latestVersion?.packageUrl
            ? {
                type: 'url' as const,
                url: plugin.latestVersion.packageUrl,
                format: 'tpex'
              }
            : undefined,
          providerId: 'nexus',
          providerName: 'Tuff Nexus',
          providerType: 'tpexApi',
          providerTrustLevel: 'official' as const,
          trusted: true,
          official: plugin.isOfficial || false
        }
      ]
    })
  }

  function resolveErrorMessage(text: string, fallback: string): string {
    if (!text) return fallback
    try {
      const parsed = JSON.parse(text) as { statusMessage?: unknown; message?: unknown }
      const message =
        typeof parsed.statusMessage === 'string'
          ? parsed.statusMessage
          : typeof parsed.message === 'string'
            ? parsed.message
            : ''
      return message || text
    } catch {
      return text
    }
  }

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchNexusWithAuth(path, init, `user-plugins:${path}`)
    if (!response) throw new Error('NOT_AUTHENTICATED')
    if (!response.ok) {
      const text = await response.text()
      throw new Error(resolveErrorMessage(text, `HTTP_ERROR_${response.status}`))
    }
    return await response.json<T>()
  }

  async function uploadJson<T>(
    path: string,
    formData: FormData,
    method: 'POST' | 'PATCH' | 'PUT' = 'POST'
  ): Promise<T> {
    const response = await uploadNexusWithAuth(
      path,
      formData,
      `user-plugins-upload:${path}`,
      method
    )
    if (!response) throw new Error('NOT_AUTHENTICATED')
    if (!response.ok) {
      const text = await response.text()
      throw new Error(resolveErrorMessage(text, `HTTP_ERROR_${response.status}`))
    }
    return await response.json<T>()
  }

  async function loadPluginDetail(pluginId: string): Promise<UserPluginRecord> {
    const data = await requestJson<{ plugin: UserPluginRecord }>(
      `/api/dashboard/plugins/${pluginId}`
    )
    return data.plugin
  }

  async function loadPluginTimeline(pluginId: string): Promise<UserPluginTimelineEvent[]> {
    const data = await requestJson<{ timeline: UserPluginTimelineEvent[] }>(
      `/api/dashboard/plugins/${pluginId}/timeline`
    )
    return data.timeline ?? []
  }

  async function updatePlugin(input: {
    pluginId: string
    name: string
    summary: string
    category: string
    readme: string
    homepage?: string
  }): Promise<UserPluginRecord> {
    const formData = new FormData()
    formData.append('name', input.name)
    formData.append('summary', input.summary)
    formData.append('category', input.category)
    formData.append('readme', input.readme)
    if (input.homepage) formData.append('homepage', input.homepage)
    const data = await uploadJson<{ plugin: UserPluginRecord }>(
      `/api/dashboard/plugins/${input.pluginId}`,
      formData,
      'PATCH'
    )
    await loadUserPlugins()
    return data.plugin
  }

  async function updatePluginStatus(pluginId: string, status: UserPluginStatus): Promise<void> {
    await requestJson(`/api/dashboard/plugins/${pluginId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    await loadUserPlugins()
  }

  async function previewPackage(packageFile: File): Promise<{
    manifest: Record<string, unknown> | null
    readmeMarkdown: string | null
    iconDataUrl?: string | null
    hasIcon?: boolean
  }> {
    const formData = new FormData()
    formData.append('package', packageFile)
    return await uploadJson('/api/dashboard/plugins/package/preview', formData)
  }

  async function createPluginWithInitialVersion(input: {
    slug: string
    name: string
    summary: string
    category: string
    readme: string
    artifactType?: 'plugin' | 'layout' | 'theme'
    homepage?: string
    packageFile: File
    iconFile?: File | null
    initialVersion: string
    initialChannel: UserPluginChannel
    initialChangelog: string
  }): Promise<UserPluginRecord> {
    const formData = new FormData()
    formData.append('slug', input.slug)
    formData.append('name', input.name)
    formData.append('summary', input.summary)
    formData.append('category', input.category)
    formData.append('artifactType', input.artifactType ?? 'plugin')
    formData.append('readme', input.readme)
    formData.append('package', input.packageFile)
    formData.append('initialVersion', input.initialVersion)
    formData.append('initialChannel', input.initialChannel)
    formData.append('initialChangelog', input.initialChangelog)
    if (input.homepage) formData.append('homepage', input.homepage)
    if (input.iconFile) formData.append('icon', input.iconFile)
    const data = await uploadJson<{ plugin: UserPluginRecord }>('/api/dashboard/plugins', formData)
    await loadUserPlugins()
    return data.plugin
  }

  async function publishVersion(input: {
    pluginId: string
    version: string
    channel: UserPluginChannel
    changelog: string
    packageFile: File
  }): Promise<UserPluginVersion> {
    const formData = new FormData()
    formData.append('version', input.version)
    formData.append('channel', input.channel)
    formData.append('changelog', input.changelog)
    formData.append('package', input.packageFile)
    const data = await uploadJson<{ version: UserPluginVersion }>(
      `/api/dashboard/plugins/${input.pluginId}/versions`,
      formData
    )
    await loadUserPlugins()
    return data.version
  }

  async function reeditVersion(input: {
    pluginId: string
    versionId: string
    changelog: string
    packageFile: File
  }): Promise<UserPluginVersion> {
    const formData = new FormData()
    formData.append('changelog', input.changelog)
    formData.append('package', input.packageFile)
    const data = await uploadJson<{ version: UserPluginVersion }>(
      `/api/dashboard/plugins/${input.pluginId}/versions/${input.versionId}/reedit`,
      formData,
      'PATCH'
    )
    await loadUserPlugins()
    return data.version
  }

  async function deleteVersion(pluginId: string, versionId: string): Promise<void> {
    await requestJson(`/api/dashboard/plugins/${pluginId}/versions/${versionId}`, {
      method: 'DELETE'
    })
    await loadUserPlugins()
  }

  async function clear(): Promise<void> {
    plugins.value = []
    records.value = []
    error.value = null
    lastUpdated.value = null
  }

  return {
    plugins,
    records,
    stats,
    loading,
    error,
    lastUpdated,
    loadUserPlugins,
    loadPluginDetail,
    loadPluginTimeline,
    updatePlugin,
    updatePluginStatus,
    previewPackage,
    createPluginWithInitialVersion,
    publishVersion,
    reeditVersion,
    deleteVersion,
    clear
  }
}
