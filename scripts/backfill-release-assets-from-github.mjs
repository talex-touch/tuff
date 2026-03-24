import { createHash } from 'node:crypto'
import process from 'node:process'
import { getArgValue, hasFlag, toBool } from './lib/argv-utils.mjs'
import { fetchWithTimeout, normalizeBaseUrl } from './lib/http-utils.mjs'

function normalizeSha(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text)
    return null
  return /^[a-f0-9]{64}$/.test(text) ? text : null
}

function parseShaFromDigest(digest) {
  const text = String(digest || '').trim().toLowerCase()
  if (!text)
    return null
  if (text.startsWith('sha256:'))
    return normalizeSha(text.slice('sha256:'.length))
  return normalizeSha(text)
}

function normalizeUrl(url) {
  return String(url || '').trim()
}

function pairKey(platform, arch) {
  return `${platform}/${arch}`
}

function inferPlatform(filename) {
  const lower = filename.toLowerCase()
  if (lower.includes('windows') || lower.endsWith('.exe'))
    return 'win32'
  if (lower.includes('macos') || lower.endsWith('.dmg') || lower.endsWith('.zip'))
    return 'darwin'
  if (lower.includes('ubuntu') || lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.snap'))
    return 'linux'
  return null
}

function inferArch(filename) {
  const lower = filename.toLowerCase()
  if (lower.includes('universal'))
    return 'universal'
  if (lower.includes('arm64') || lower.includes('aarch64'))
    return 'arm64'
  return 'x64'
}

function inferPlatformArch(filename) {
  const platform = inferPlatform(filename)
  if (!platform)
    return null
  return {
    platform,
    arch: inferArch(filename)
  }
}

function extname(filename) {
  const index = filename.lastIndexOf('.')
  if (index < 0)
    return ''
  return filename.slice(index).toLowerCase()
}

function pickPreferredCandidate(existing, candidates) {
  if (candidates.length === 0)
    return null

  const exact = candidates.find(item => item.filename === existing.filename)
  if (exact)
    return exact

  const scoreByPlatformExt = {
    win32: {
      '.exe': 20
    },
    darwin: {
      '.dmg': 20,
      '.zip': 10
    },
    linux: {
      '.appimage': 20,
      '.deb': 15,
      '.snap': 10
    }
  }

  const scored = candidates.map((item) => {
    const lower = item.filename.toLowerCase()
    const itemExt = extname(item.filename)
    const extScore = scoreByPlatformExt[existing.platform]?.[itemExt] ?? 0
    let score = extScore

    if (itemExt && itemExt === extname(existing.filename))
      score += 30
    if (lower.includes('setup'))
      score += 10
    if (lower.includes('tuff'))
      score += 5
    if (lower.includes('elevate') || lower.includes('esbuild'))
      score -= 100

    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.item ?? null
}

function fileSha256Hex(content) {
  return createHash('sha256').update(content).digest('hex')
}

function buildGitHubHeaders(token, extra = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    ...extra,
  }

  if (token)
    headers.Authorization = `Bearer ${token}`

  return headers
}

async function fetchGitHubRelease(repo, tag, githubToken, timeoutMs) {
  const releaseUrl = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
  const releaseResp = await fetchWithTimeout(
    releaseUrl,
    {
      headers: buildGitHubHeaders(githubToken)
    },
    timeoutMs
  )

  if (!releaseResp.ok) {
    const body = await releaseResp.text().catch(() => '')
    throw new Error(`Failed to fetch GitHub release (${releaseResp.status}): ${body || releaseUrl}`)
  }

  const payload = await releaseResp.json()
  const assets = Array.isArray(payload?.assets) ? payload.assets : []

  return {
    releaseUrl,
    release: payload,
    assets,
  }
}

async function fetchManifestAsset(manifestAsset, githubToken, timeoutMs) {
  if (!manifestAsset?.browser_download_url)
    return null

  const response = await fetchWithTimeout(
    manifestAsset.browser_download_url,
    {
      headers: buildGitHubHeaders(githubToken, { Accept: 'application/octet-stream' })
    },
    timeoutMs
  )

  if (!response.ok)
    throw new Error(`Failed to download manifest asset (${response.status}).`)

  const text = await response.text()
  const bytes = Buffer.from(text, 'utf8')
  const sha256 = fileSha256Hex(bytes)

  let json
  try {
    json = JSON.parse(text)
  }
  catch (error) {
    throw new Error(`Manifest JSON parse failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    text,
    json,
    size: bytes.length,
    sha256,
  }
}

function resolveManifestArtifactsMap(manifestPayload) {
  const artifacts = Array.isArray(manifestPayload?.artifacts) ? manifestPayload.artifacts : []
  const map = new Map()

  for (const artifact of artifacts) {
    const name = typeof artifact?.name === 'string' ? artifact.name.trim() : ''
    if (!name)
      continue

    map.set(name, {
      platform: typeof artifact?.platform === 'string' ? artifact.platform.trim() : '',
      arch: typeof artifact?.arch === 'string' ? artifact.arch.trim() : '',
      sha256: normalizeSha(artifact?.sha256)
    })
  }

  return map
}

function normalizeGitHubCandidates(assets, manifestArtifactsMap) {
  const skipped = []
  const candidates = []

  for (const asset of assets) {
    const filename = typeof asset?.name === 'string' ? asset.name : ''
    const downloadUrl = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : ''

    if (!filename || !downloadUrl)
      continue

    if (filename === 'tuff-release-manifest.json' || filename.startsWith('latest') && filename.endsWith('.yml') || filename === 'builder-debug.yml') {
      skipped.push({ filename, reason: 'meta-file' })
      continue
    }

    const fromManifest = manifestArtifactsMap.get(filename)
    let platform = fromManifest?.platform || ''
    let arch = fromManifest?.arch || ''

    if (!platform || !arch) {
      const inferred = inferPlatformArch(filename)
      if (!inferred) {
        skipped.push({ filename, reason: 'unrecognized-platform' })
        continue
      }
      platform = inferred.platform
      arch = inferred.arch
    }

    const sha256 = fromManifest?.sha256
      ?? parseShaFromDigest(asset?.digest)
      ?? null

    candidates.push({
      filename,
      downloadUrl,
      platform,
      arch,
      size: Number.isFinite(asset?.size) ? Number(asset.size) : 0,
      contentType: typeof asset?.content_type === 'string' && asset.content_type
        ? asset.content_type
        : 'application/octet-stream',
      sha256,
    })
  }

  return { candidates, skipped }
}

async function fetchNexusAssets(baseUrl, tag, timeoutMs) {
  const url = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/assets`
  const response = await fetchWithTimeout(url, {}, timeoutMs)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to fetch Nexus assets (${response.status}): ${body || url}`)
  }

  const payload = await response.json()
  const assets = Array.isArray(payload?.assets) ? payload.assets : []

  return { url, assets }
}

function buildBackfillPlan({ nexusAssets, ghCandidates, manifestMeta }) {
  const warnings = []
  const updates = []

  const ghByPair = new Map()
  for (const candidate of ghCandidates) {
    const key = pairKey(candidate.platform, candidate.arch)
    if (!ghByPair.has(key))
      ghByPair.set(key, [])
    ghByPair.get(key).push(candidate)
  }

  for (const existing of nexusAssets) {
    const key = pairKey(existing.platform, existing.arch)
    const pairCandidates = ghByPair.get(key) ?? []

    if (pairCandidates.length === 0) {
      warnings.push(`[${key}] 未在 GitHub release 中找到可回填资产。`)
      continue
    }

    const selected = pickPreferredCandidate(existing, pairCandidates)
    if (!selected)
      continue

    const previousDownloadUrl = normalizeUrl(existing.fallbackDownloadUrl || existing.downloadUrl)
    const targetSha256 = selected.sha256 ?? normalizeSha(existing.sha256)

    if (!targetSha256) {
      warnings.push(`[${key}] ${selected.filename} 缺少 sha256（manifest 未命中且 GitHub digest 不可用）。`)
    }

    const changedFields = []
    if (existing.filename !== selected.filename)
      changedFields.push('filename')
    if (Number(existing.size || 0) !== Number(selected.size || 0))
      changedFields.push('size')
    if (normalizeUrl(previousDownloadUrl) !== normalizeUrl(selected.downloadUrl))
      changedFields.push('downloadUrl')
    if (normalizeSha(existing.sha256) !== normalizeSha(targetSha256))
      changedFields.push('sha256')
    if ((existing.contentType || '') !== (selected.contentType || 'application/octet-stream'))
      changedFields.push('contentType')
    if (existing.sourceType !== 'github')
      changedFields.push('sourceType')

    if (changedFields.length === 0)
      continue

    updates.push({
      platform: existing.platform,
      arch: existing.arch,
      filename: selected.filename,
      downloadUrl: selected.downloadUrl,
      size: selected.size,
      sha256: targetSha256,
      contentType: selected.contentType || 'application/octet-stream',
      changedFields,
      reason: existing.filename === selected.filename ? 'sha256/backfill' : 'pair-aligned-fallback'
    })
  }

  if (manifestMeta?.asset) {
    const existingManifest = nexusAssets.find(item => item.filename === 'tuff-release-manifest.json')
    const manifestSha = manifestMeta.sha256 || parseShaFromDigest(manifestMeta.asset.digest)
    const manifestSize = Number(manifestMeta.asset.size || manifestMeta.size || 0)
    const manifestContentType = typeof manifestMeta.asset.content_type === 'string' && manifestMeta.asset.content_type
      ? manifestMeta.asset.content_type
      : 'application/json'

    if (existingManifest) {
      const previousDownloadUrl = normalizeUrl(existingManifest.fallbackDownloadUrl || existingManifest.downloadUrl)
      const changedFields = []

      if (normalizeUrl(previousDownloadUrl) !== normalizeUrl(manifestMeta.asset.browser_download_url))
        changedFields.push('downloadUrl')
      if (Number(existingManifest.size || 0) !== manifestSize)
        changedFields.push('size')
      if (normalizeSha(existingManifest.sha256) !== normalizeSha(manifestSha))
        changedFields.push('sha256')
      if ((existingManifest.contentType || '') !== manifestContentType)
        changedFields.push('contentType')
      if (existingManifest.sourceType !== 'github')
        changedFields.push('sourceType')

      if (changedFields.length > 0) {
        updates.push({
          platform: existingManifest.platform,
          arch: existingManifest.arch,
          filename: 'tuff-release-manifest.json',
          downloadUrl: manifestMeta.asset.browser_download_url,
          size: manifestSize,
          sha256: manifestSha,
          contentType: manifestContentType,
          changedFields,
          reason: 'manifest-update'
        })
      }
    }
    else {
      const usedPairs = new Set(nexusAssets.map(item => pairKey(item.platform, item.arch)))
      const reservePairs = [
        ['darwin', 'universal'],
        ['darwin', 'arm64'],
        ['linux', 'arm64'],
        ['linux', 'universal'],
        ['win32', 'arm64'],
        ['win32', 'universal'],
      ]

      const selectedPair = reservePairs.find(([platform, arch]) => !usedPairs.has(pairKey(platform, arch)))

      if (!selectedPair) {
        warnings.push('未找到空闲 platform/arch 来挂载 manifest 资产，请手工指定。')
      }
      else {
        const [platform, arch] = selectedPair
        updates.push({
          platform,
          arch,
          filename: 'tuff-release-manifest.json',
          downloadUrl: manifestMeta.asset.browser_download_url,
          size: manifestSize,
          sha256: manifestSha,
          contentType: manifestContentType,
          changedFields: ['create-manifest-asset'],
          reason: 'manifest-create'
        })
      }
    }
  }
  else {
    warnings.push('GitHub release 未找到 tuff-release-manifest.json，无法回填 manifest。')
  }

  return { updates, warnings }
}

async function applyBackfill(baseUrl, tag, nexusKey, updates, timeoutMs) {
  const results = []

  for (const update of updates) {
    const url = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/link-github`
    const payload = {
      platform: update.platform,
      arch: update.arch,
      filename: update.filename,
      downloadUrl: update.downloadUrl,
      size: update.size,
      sha256: update.sha256,
      contentType: update.contentType,
    }

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nexusKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      },
      timeoutMs
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Backfill failed for ${update.platform}/${update.arch}/${update.filename} (${response.status}): ${body}`)
    }

    const json = await response.json().catch(() => ({}))
    results.push({
      update,
      response: json,
      status: response.status,
    })
  }

  return results
}

function printUsage() {
  console.log(`Usage:\n  node scripts/backfill-release-assets-from-github.mjs --tag v2.4.7 --base-url https://tuff.tagzxia.com --nexus-key <API_KEY> [--dry-run]\n\nOptions:\n  --tag            Release tag (default: v2.4.7)\n  --base-url       Nexus base URL (default: https://tuff.tagzxia.com)\n  --nexus-key      Nexus API key (or env NEXUS_API_KEY)\n  --repo           GitHub repo in owner/name format (default: talex-touch/tuff)\n  --github-token   Optional GitHub token (or env GITHUB_TOKEN)\n  --timeout-ms     Request timeout in milliseconds (default: 20000)\n  --dry-run        Print planned updates only, do not write Nexus\n`)
}

async function main() {
  const argv = process.argv
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    printUsage()
    return
  }

  const tag = getArgValue(argv, '--tag', 'v2.4.7')
  const baseUrl = normalizeBaseUrl(getArgValue(argv, '--base-url', 'https://tuff.tagzxia.com'))
  const repo = getArgValue(argv, '--repo', 'talex-touch/tuff')
  const timeoutMs = Number(getArgValue(argv, '--timeout-ms', '20000')) || 20000
  const dryRun = toBool(getArgValue(argv, '--dry-run', hasFlag(argv, '--dry-run')))
  const nexusKey = getArgValue(argv, '--nexus-key', process.env.NEXUS_API_KEY ?? '')
  const githubToken = getArgValue(argv, '--github-token', process.env.GITHUB_TOKEN ?? '')

  if (!dryRun && !nexusKey) {
    throw new Error('`--nexus-key` (or NEXUS_API_KEY) is required when --dry-run is false.')
  }

  if (!baseUrl) {
    throw new Error('`--base-url` is required.')
  }

  const gh = await fetchGitHubRelease(repo, tag, githubToken, timeoutMs)
  const manifestAsset = gh.assets.find(item => item?.name === 'tuff-release-manifest.json') ?? null

  let manifestMeta = null
  if (manifestAsset) {
    try {
      manifestMeta = {
        asset: manifestAsset,
        ...(await fetchManifestAsset(manifestAsset, githubToken, timeoutMs))
      }
    }
    catch (error) {
      manifestMeta = {
        asset: manifestAsset,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  const manifestArtifactsMap = resolveManifestArtifactsMap(manifestMeta?.json)
  const { candidates: ghCandidates, skipped } = normalizeGitHubCandidates(gh.assets, manifestArtifactsMap)
  const nexus = await fetchNexusAssets(baseUrl, tag, timeoutMs)

  const { updates, warnings } = buildBackfillPlan({
    nexusAssets: nexus.assets,
    ghCandidates,
    manifestMeta
  })

  let applied = []
  if (!dryRun && updates.length > 0) {
    applied = await applyBackfill(baseUrl, tag, nexusKey, updates, timeoutMs)
  }

  const summary = {
    tag,
    baseUrl,
    repo,
    dryRun,
    githubReleaseApi: gh.releaseUrl,
    nexusAssetsApi: nexus.url,
    counts: {
      githubAssets: gh.assets.length,
      githubCandidates: ghCandidates.length,
      nexusAssets: nexus.assets.length,
      plannedUpdates: updates.length,
      appliedUpdates: applied.length,
      skippedAssets: skipped.length,
      warnings: warnings.length + (manifestMeta?.error ? 1 : 0),
    },
    manifest: {
      found: Boolean(manifestAsset),
      parsed: Boolean(manifestMeta?.json),
      parseError: manifestMeta?.error ?? null,
      sha256: manifestMeta?.sha256 ?? null,
      size: manifestMeta?.size ?? null,
    },
    skipped,
    warnings: manifestMeta?.error ? [...warnings, `manifest parse error: ${manifestMeta.error}`] : warnings,
    updates: updates.map(item => ({
      platform: item.platform,
      arch: item.arch,
      filename: item.filename,
      changedFields: item.changedFields,
      reason: item.reason,
      sha256: item.sha256,
    })),
    applied: applied.map(item => ({
      platform: item.update.platform,
      arch: item.update.arch,
      filename: item.update.filename,
      status: item.status,
    })),
  }

  console.log(JSON.stringify(summary, null, 2))
}

await main().catch((error) => {
  console.error(`[backfill-release-assets-from-github] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
