import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { StorePlugin } from '@talex-touch/utils/store'
import type { Ref } from 'vue'
import { computed, onMounted } from 'vue'
import { useStoreData } from '~/composables/store/useStoreData'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'

type PluginWithInstallSource = ITouchPlugin & {
  installSource?: {
    source?: unknown
    metadata?: Record<string, unknown> | null
    clientMetadata?: Record<string, unknown> | null
  } | null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeMatchKey(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function readInstallSource(plugin: ITouchPlugin): PluginWithInstallSource['installSource'] {
  const value = (plugin as PluginWithInstallSource).installSource
  if (!value || typeof value !== 'object') return null
  return value
}

function readRecordString(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string {
  if (!record) return ''
  for (const key of keys) {
    const value = normalizeText(record[key])
    if (value) return value
  }
  return ''
}

function readRecordValue(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!record) return undefined
  for (const key of keys) {
    const value = record[key]
    if (value) return value
  }
  return undefined
}

function normalizeUrlCandidate(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return normalizeUrlCandidate((value as Record<string, unknown>).url)
  }

  const raw = normalizeText(value)
  if (!raw) return ''

  if (raw.startsWith('git+https://')) {
    return raw.slice(4)
  }

  const sshMatch = raw.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i)
  if (sshMatch?.[1]) {
    return `https://github.com/${sshMatch[1]}`
  }

  return raw
}

function isGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.toLowerCase() === 'github.com'
  } catch {
    return false
  }
}

function buildNexusPluginUrl(pluginId: string): string {
  const baseUrl = getAuthBaseUrl().replace(/\/$/, '')
  const url = new URL('/store', `${baseUrl}/`)
  url.searchParams.set('plugin', pluginId)
  return url.toString()
}

function matchesStorePlugin(plugin: ITouchPlugin, storePlugin: StorePlugin): boolean {
  const installSource = readInstallSource(plugin)
  const metadata = installSource?.metadata
  const clientMetadata = installSource?.clientMetadata
  const storeId = normalizeMatchKey(storePlugin.id)
  const storeName = normalizeMatchKey(storePlugin.name)
  const source = normalizeMatchKey(installSource?.source)
  const pluginKeys = new Set(
    [
      plugin.name,
      readRecordString(metadata, 'officialId', 'pluginId'),
      readRecordString(clientMetadata, 'pluginId', 'pluginName')
    ]
      .map(normalizeMatchKey)
      .filter(Boolean)
  )

  if ((storeId && pluginKeys.has(storeId)) || (storeName && pluginKeys.has(storeName))) {
    return true
  }

  return Boolean(
    source &&
    (normalizeMatchKey(storePlugin.downloadUrl) === source ||
      normalizeMatchKey(storePlugin.install?.type === 'url' ? storePlugin.install.url : '') ===
        source)
  )
}

export function usePluginExternalLinks(
  plugin: Ref<ITouchPlugin>,
  options: { manifest?: Ref<Record<string, unknown> | null> } = {}
) {
  const { plugins: storePlugins, loadStorePlugins } = useStoreData()

  const nexusStorePlugin = computed(() =>
    storePlugins.value.find(
      (storePlugin) =>
        storePlugin.providerId === 'tuff-nexus' &&
        storePlugin.providerType === 'tpexApi' &&
        matchesStorePlugin(plugin.value, storePlugin)
    )
  )

  const nexusPublishUrl = computed(() => {
    const storePlugin = nexusStorePlugin.value
    return storePlugin ? buildNexusPluginUrl(storePlugin.id) : ''
  })

  const githubRepositoryUrl = computed(() => {
    const installSource = readInstallSource(plugin.value)
    const metadata = installSource?.metadata
    const candidates = [
      readRecordValue(
        options.manifest?.value,
        'repository',
        'repo',
        'homepage',
        'repositoryUrl',
        'sourceUrl'
      ),
      readRecordValue(metadata, 'repository', 'repo', 'homepage', 'repositoryUrl', 'sourceUrl'),
      nexusStorePlugin.value?.homepage,
      readRecordValue(nexusStorePlugin.value?.metadata, 'repository', 'repo', 'homepage')
    ]

    return candidates.map(normalizeUrlCandidate).find((url) => url && isGithubUrl(url)) ?? ''
  })

  onMounted(() => {
    void loadStorePlugins()
  })

  return {
    githubRepositoryUrl,
    nexusPublishUrl,
    nexusStorePlugin
  }
}
