import { createError, readBody } from 'h3'
import { getPluginBySlug } from '../../utils/pluginsStore'

function buildMarketDownloadUrl(slug: string, version: string): string {
  return `/api/market/plugins/${slug}/download.tpex?version=${encodeURIComponent(version)}`
}

interface InstalledPlugin {
  slug: string
  version: string
}

interface UpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ plugins?: InstalledPlugin[] }>(event)

  if (!body?.plugins || !Array.isArray(body.plugins))
    throw createError({ statusCode: 400, statusMessage: 'plugins array is required.' })

  const updates: UpdateInfo[] = []

  for (const installed of body.plugins) {
    if (!installed.slug || !installed.version)
      continue

    const plugin = await getPluginBySlug(event, installed.slug, {
      includeVersions: true,
      forMarket: true,
    })

    if (!plugin)
      continue

    const versions = plugin.versions ?? []
    const latest = versions.find(v => v.id === plugin.latestVersionId) ?? versions[0]

    if (!latest)
      continue

    const hasUpdate = compareVersions(latest.version, installed.version) > 0

    updates.push({
      slug: installed.slug,
      currentVersion: installed.version,
      latestVersion: latest.version,
      hasUpdate,
      downloadUrl: hasUpdate ? buildMarketDownloadUrl(plugin.slug, latest.version) : undefined,
      changelog: hasUpdate ? (latest.changelog ?? undefined) : undefined,
    })
  }

  return {
    updates,
    checkedAt: new Date().toISOString(),
  }
})

function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => {
    const base = v.split('-').shift() ?? v
    const core = base.split('+').shift() ?? base
    return core.split('.').map(part => Number(part))
  }
  const parts1 = normalize(v1)
  const parts2 = normalize(v2)

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] ?? 0
    const p2 = parts2[i] ?? 0
    if (p1 > p2)
      return 1
    if (p1 < p2)
      return -1
  }
  return 0
}
