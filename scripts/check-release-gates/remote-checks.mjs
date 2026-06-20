import { fetchWithTimeout, normalizeBaseUrl } from '../lib/http-utils.mjs'

const sha256Pattern = /^[a-f0-9]{64}$/i
const releaseChannels = new Set(['RELEASE', 'BETA', 'SNAPSHOT'])

function createHttpErrorPayload(error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeSha(value) {
  const text = String(value || '').trim().toLowerCase()
  return sha256Pattern.test(text) ? text : ''
}

function normalizeText(value) {
  return String(value || '').trim()
}

function classifySignaturePayload(response, bytes) {
  const contentType = normalizeText(response.headers.get('content-type')).toLowerCase()
  const byteLength = bytes.byteLength
  const sample = new TextDecoder().decode(bytes.slice(0, Math.min(byteLength, 512))).trimStart()
  const lowerSample = sample.toLowerCase()

  if (byteLength === 0) {
    return {
      valid: false,
      reason: 'empty-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'empty'
    }
  }

  if (contentType.includes('json') || lowerSample.startsWith('{') || lowerSample.startsWith('[')) {
    return {
      valid: false,
      reason: 'json-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'json'
    }
  }

  if (contentType.includes('html') || lowerSample.startsWith('<!doctype') || lowerSample.startsWith('<html')) {
    return {
      valid: false,
      reason: 'html-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'html'
    }
  }

  if (/^-----BEGIN [A-Z0-9 ]*SIGNATURE-----/.test(sample)) {
    return {
      valid: true,
      byteLength,
      contentType: contentType || null,
      kind: 'ascii-armored-signature'
    }
  }

  return {
    valid: true,
    byteLength,
    contentType: contentType || null,
    kind: 'opaque-signature'
  }
}

function classifyDownloadResponse(response, bytes = new Uint8Array()) {
  const status = response.status
  const location = normalizeText(response.headers.get('location'))
  const contentType = normalizeText(response.headers.get('content-type')).toLowerCase()

  if ([302, 307, 308].includes(status)) {
    return {
      validResponse: Boolean(location),
      responseKind: 'redirect',
      location: location || null,
      ...(location ? {} : { reason: 'missing-redirect-location' })
    }
  }

  if (status !== 200) {
    return {
      validResponse: false,
      responseKind: 'unavailable',
      reason: `unexpected-status:${status}`
    }
  }

  const byteLength = bytes.byteLength
  const sample = new TextDecoder().decode(bytes.slice(0, Math.min(byteLength, 512))).trimStart()
  const lowerSample = sample.toLowerCase()

  if (byteLength === 0) {
    return {
      validResponse: false,
      responseKind: 'empty',
      byteLength,
      contentType: contentType || null,
      reason: 'empty-download-body'
    }
  }

  if (contentType.includes('json') || lowerSample.startsWith('{') || lowerSample.startsWith('[')) {
    return {
      validResponse: false,
      responseKind: 'json',
      byteLength,
      contentType: contentType || null,
      reason: 'json-download-body'
    }
  }

  if (contentType.includes('html') || lowerSample.startsWith('<!doctype') || lowerSample.startsWith('<html')) {
    return {
      validResponse: false,
      responseKind: 'html',
      byteLength,
      contentType: contentType || null,
      reason: 'html-download-body'
    }
  }

  return {
    validResponse: true,
    responseKind: 'binary',
    byteLength,
    contentType: contentType || null
  }
}

function normalizePairKey(platform, arch) {
  return `${normalizeText(platform)}/${normalizeText(arch)}`
}

function inferReleaseChannel(versionText) {
  const lower = normalizeText(versionText).toLowerCase()
  if (lower.includes('snapshot'))
    return 'SNAPSHOT'
  if (lower.includes('beta'))
    return 'BETA'
  return 'RELEASE'
}

function normalizePathname(value) {
  return String(value || '').replace(/\/+$/, '')
}

function resolveSameOriginUrlPath(value, baseUrl) {
  const text = normalizeText(value)
  if (!text)
    return ''

  try {
    const parsed = new URL(text, `${baseUrl}/`)
    const expectedOrigin = new URL(`${baseUrl}/`).origin
    if (parsed.origin !== expectedOrigin)
      return ''
    return normalizePathname(parsed.pathname)
  } catch {
    return ''
  }
}

function resolveSameOriginUrl(value, baseUrl) {
  const text = normalizeText(value)
  if (!text)
    return null

  try {
    const parsed = new URL(text, `${baseUrl}/`)
    const expectedOrigin = new URL(`${baseUrl}/`).origin
    return parsed.origin === expectedOrigin ? parsed : null
  } catch {
    return null
  }
}

function inspectSignedDownloadUrl(value, baseUrl) {
  const parsed = resolveSameOriginUrl(value, baseUrl)
  if (!parsed) {
    return {
      url: normalizeText(value) || null,
      sameOrigin: false,
      path: null,
      hasExp: false,
      hasSig: false,
      hasValidSig: false,
      reason: 'not-same-origin'
    }
  }

  const sig = normalizeText(parsed.searchParams.get('sig'))
  const exp = normalizeText(parsed.searchParams.get('exp'))
  return {
    url: parsed.href,
    sameOrigin: true,
    path: normalizePathname(parsed.pathname),
    hasExp: Boolean(exp),
    hasSig: Boolean(sig),
    hasValidSig: /^[a-f0-9]{64}$/i.test(sig),
    ...(exp ? { exp } : {}),
  }
}

function buildExpectedSignaturePath(tag, platform, arch) {
  return normalizePathname(
    `/api/releases/${encodeURIComponent(tag)}/signature/${encodeURIComponent(platform)}/${encodeURIComponent(arch)}`
  )
}

function buildExpectedDownloadPath(tag, platform, arch) {
  return normalizePathname(
    `/api/releases/${encodeURIComponent(tag)}/download/${encodeURIComponent(platform)}/${encodeURIComponent(arch)}`
  )
}

function getReleaseAssetFilename(asset) {
  return normalizeText(asset?.filename || asset?.name)
}

function buildGithubCoreManifestMatrix(manifestPayload) {
  const release = manifestPayload?.release
  const artifacts = Array.isArray(manifestPayload?.artifacts) ? manifestPayload.artifacts : []
  const matrix = new Map()
  const issues = []
  const artifactNames = new Set()
  const artifactSha256s = new Set()
  let coreArtifactCount = 0

  if (manifestPayload?.schemaVersion !== 1)
    issues.push('schemaVersion must be 1')

  const manifestVersion = normalizeText(release?.version)
  const manifestTag = normalizeText(release?.tag)
  const manifestChannel = normalizeText(release?.channel)

  if (!manifestVersion)
    issues.push('release.version is required')
  if (!manifestTag)
    issues.push('release.tag is required')
  if (!manifestChannel) {
    issues.push('release.channel is required')
  } else if (!releaseChannels.has(manifestChannel)) {
    issues.push('release.channel must be RELEASE|BETA|SNAPSHOT')
  }
  if (manifestVersion && manifestTag && manifestTag !== `v${manifestVersion}`)
    issues.push('release.tag must match release.version')
  if (manifestVersion && manifestChannel && releaseChannels.has(manifestChannel) && manifestChannel !== inferReleaseChannel(manifestVersion))
    issues.push('release.channel must match release.version suffix')
  if (!Array.isArray(manifestPayload?.artifacts) || artifacts.length === 0)
    issues.push('artifacts must be a non-empty array')

  for (const [index, artifact] of artifacts.entries()) {
    const label = `artifacts[${index}]`
    const name = normalizeText(artifact?.name)
    const sha256 = normalizeSha(artifact?.sha256)

    if (name) {
      if (artifactNames.has(name))
        issues.push(`${label}.name must be unique`)
      artifactNames.add(name)
    }

    if (sha256) {
      if (artifactSha256s.has(sha256))
        issues.push(`${label}.sha256 must be unique`)
      artifactSha256s.add(sha256)
    }
  }

  for (const [index, artifact] of artifacts.entries()) {
    if (artifact?.component !== 'core')
      continue
    coreArtifactCount += 1

    const label = `artifacts[${index}]`
    const name = normalizeText(artifact?.name)
    const platform = normalizeText(artifact?.platform)
    const arch = normalizeText(artifact?.arch)
    const sha256 = normalizeSha(artifact?.sha256)
    const signature = normalizeText(artifact?.signature)

    if (!name)
      issues.push(`${label}.name is missing`)
    if (!platform)
      issues.push(`${label}.platform is missing`)
    if (!arch)
      issues.push(`${label}.arch is missing`)
    if (!sha256)
      issues.push(`${label}.sha256 is missing or invalid`)
    if (!signature)
      issues.push(`${label}.signature is missing`)
    if (name && signature && signature !== `${name}.sig` && signature !== `${name}.asc`)
      issues.push(`${label}.signature must point to the artifact .sig/.asc sidecar`)
    if (signature && artifactNames.has(signature))
      issues.push(`${label}.signature sidecar must not be listed as a downloadable artifact`)

    if (!platform || !arch)
      continue

    const key = normalizePairKey(platform, arch)
    if (matrix.has(key)) {
      issues.push(`${label} duplicates platform/arch ${key}`)
      continue
    }

    matrix.set(key, {
      key,
      name,
      platform,
      arch,
      sha256,
      signature,
    })
  }

  if (coreArtifactCount === 0)
    issues.push('artifacts must include at least one core artifact')

  return {
    release,
    matrix,
    issues,
  }
}

async function fetchGithubManifestPayload(githubAssets, timeoutMs) {
  const manifestAsset = githubAssets.find(item => item?.name === 'tuff-release-manifest.json') ?? null
  if (!manifestAsset?.browser_download_url) {
    return {
      hasManifest: Boolean(manifestAsset),
      manifestAsset,
      manifestPayload: null,
      error: manifestAsset ? 'manifest asset is missing browser_download_url' : null,
    }
  }

  try {
    const response = await fetchWithTimeout(manifestAsset.browser_download_url, {}, timeoutMs)
    if (!response.ok) {
      return {
        hasManifest: true,
        manifestAsset,
        manifestPayload: null,
        error: `manifest download failed (${response.status})`,
      }
    }

    const text = await response.text()
    return {
      hasManifest: true,
      manifestAsset,
      manifestPayload: JSON.parse(text),
      error: null,
    }
  } catch (error) {
    return {
      hasManifest: true,
      manifestAsset,
      manifestPayload: null,
      error: createHttpErrorPayload(error),
    }
  }
}

function compareNexusAssetsWithManifest({ assets, manifestPayload, remoteRelease, tag, baseUrl }) {
  const {
    release: manifestRelease,
    matrix,
    issues
  } = buildGithubCoreManifestMatrix(manifestPayload)
  const mismatches = []
  const nexusMatrix = []
  const seenNexusKeys = new Map()

  const manifestTag = normalizeText(manifestRelease?.tag)
  if (manifestTag && manifestTag !== tag)
    issues.push(`manifest release.tag ${manifestTag} does not match ${tag}`)
  const manifestVersion = normalizeText(manifestRelease?.version)
  const remoteVersion = normalizeText(remoteRelease?.version)
  if (manifestVersion && remoteVersion && manifestVersion !== remoteVersion)
    issues.push(`manifest release.version ${manifestVersion} does not match remote ${remoteVersion}`)
  const manifestChannel = normalizeText(manifestRelease?.channel)
  const remoteChannel = normalizeText(remoteRelease?.channel)
  if (manifestChannel && remoteChannel && manifestChannel !== remoteChannel)
    issues.push(`manifest release.channel ${manifestChannel} does not match remote ${remoteChannel}`)

  for (const asset of assets) {
    const platform = normalizeText(asset?.platform)
    const arch = normalizeText(asset?.arch)
    if (!platform || !arch)
      continue

    const key = normalizePairKey(platform, arch)
    const expected = matrix.get(key)
    const actualFilename = getReleaseAssetFilename(asset)
    const actualSha256 = normalizeSha(asset?.sha256)
    const actualDownloadUrl = normalizeText(asset?.downloadUrl)
    const actualDownloadPath = resolveSameOriginUrlPath(actualDownloadUrl, baseUrl)
    const actualSignatureUrl = normalizeText(asset?.signatureUrl)
    const actualSignaturePath = resolveSameOriginUrlPath(actualSignatureUrl, baseUrl)
    const expectedDownloadPath = buildExpectedDownloadPath(tag, platform, arch)
    const expectedSignaturePath = buildExpectedSignaturePath(tag, platform, arch)

    nexusMatrix.push({
      key,
      platform,
      arch,
      filename: actualFilename,
      sha256: actualSha256,
      hasDownloadUrl: Boolean(actualDownloadUrl),
      downloadUrlPath: actualDownloadPath || null,
      hasSignatureUrl: Boolean(actualSignatureUrl),
      signatureUrlPath: actualSignaturePath || null,
    })

    if (seenNexusKeys.has(key)) {
      mismatches.push({
        key,
        reason: 'duplicate-nexus-asset',
        actual: actualFilename,
        previous: seenNexusKeys.get(key),
      })
      continue
    }
    seenNexusKeys.set(key, actualFilename)

    if (!expected) {
      mismatches.push({
        key,
        filename: actualFilename,
        reason: 'missing-manifest-artifact',
      })
      continue
    }

    if (actualFilename !== expected.name) {
      mismatches.push({
        key,
        reason: 'filename-mismatch',
        actual: actualFilename,
        expected: expected.name,
      })
    }

    if (!actualSha256 || actualSha256 !== expected.sha256) {
      mismatches.push({
        key,
        reason: 'sha256-mismatch',
        actual: actualSha256 || null,
        expected: expected.sha256 || null,
      })
    }

    if (!actualDownloadPath || actualDownloadPath !== expectedDownloadPath) {
      mismatches.push({
        key,
        reason: 'download-url-mismatch',
        actual: actualDownloadUrl || null,
        expected: expectedDownloadPath,
      })
    }

    if (!actualSignaturePath || actualSignaturePath !== expectedSignaturePath) {
      mismatches.push({
        key,
        reason: 'signature-url-mismatch',
        actual: actualSignatureUrl || null,
        expected: expectedSignaturePath,
      })
    }
  }

  for (const [key, artifact] of matrix.entries()) {
    const hasNexusAsset = nexusMatrix.some(item => item.key === key)
    if (!hasNexusAsset) {
      mismatches.push({
        key,
        reason: 'missing-nexus-asset',
        expected: artifact.name,
      })
    }
  }

  return {
    issues,
    mismatches,
    manifestMatrix: Array.from(matrix.values()).map(item => ({
      platform: item.platform,
      arch: item.arch,
      name: item.name,
      sha256: item.sha256,
      signature: item.signature,
    })),
    nexusMatrix,
  }
}

export async function checkRemoteRelease({
  baseUrlValue,
  tag,
  stage,
  timeoutMs,
  pushCheck,
}) {
  const baseUrl = normalizeBaseUrl(baseUrlValue)
  if (!baseUrl) {
    return
  }

  const releaseUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}?assets=true`
  let releasePayload
  try {
    const response = await fetchWithTimeout(releaseUrl, {}, timeoutMs)
    if (!response.ok) {
      pushCheck('remote-release', 'fail', `Failed to fetch remote release metadata (${response.status}).`, {
        url: releaseUrl,
        httpStatus: response.status
      })
      return
    }
    releasePayload = await response.json()
  } catch (error) {
    pushCheck('remote-release', 'fail', 'Failed to fetch remote release metadata.', {
      url: releaseUrl,
      error: createHttpErrorPayload(error)
    })
    return
  }

  const release = releasePayload?.release
  if (!release || typeof release !== 'object') {
    pushCheck('remote-release', 'fail', 'Remote release payload is missing `release` object.', {
      url: releaseUrl
    })
    return
  }

  pushCheck('remote-release', 'pass', 'Remote release metadata fetched.', {
    url: releaseUrl,
    tag: release.tag,
    version: release.version,
    channel: release.channel,
    releaseStatus: release.status
  })

  const notes = release.notes ?? {}
  const notesHtml = release.notesHtml ?? {}
  const notesValid =
    typeof notes.zh === 'string' &&
    notes.zh.trim().length > 0 &&
    typeof notes.en === 'string' &&
    notes.en.trim().length > 0
  const notesHtmlValid =
    typeof notesHtml.zh === 'string' &&
    notesHtml.zh.trim().length > 0 &&
    typeof notesHtml.en === 'string' &&
    notesHtml.en.trim().length > 0

  pushCheck(
    'remote-notes',
    notesValid && notesHtmlValid ? 'pass' : 'fail',
    notesValid && notesHtmlValid
      ? 'Remote notes/notesHtml both satisfy {zh,en} non-empty.'
      : 'Remote notes or notesHtml does not satisfy {zh,en} non-empty.',
    {
      notesKeys: Object.keys(notes || {}),
      notesHtmlKeys: Object.keys(notesHtml || {}),
      notesZhLen: typeof notes.zh === 'string' ? notes.zh.length : 0,
      notesEnLen: typeof notes.en === 'string' ? notes.en.length : 0,
      notesHtmlZhLen: typeof notesHtml.zh === 'string' ? notesHtml.zh.length : 0,
      notesHtmlEnLen: typeof notesHtml.en === 'string' ? notesHtml.en.length : 0
    }
  )

  const assets = Array.isArray(release.assets) ? release.assets : []
  pushCheck(
    'remote-assets-matrix',
    assets.length > 0 ? 'pass' : 'fail',
    assets.length > 0 ? 'Remote assets list is non-empty.' : 'Remote assets list is empty.',
    {
      count: assets.length,
      matrix: assets.map((item) => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename
      }))
    }
  )

  const githubReleaseUrl = `https://api.github.com/repos/talex-touch/tuff/releases/tags/${encodeURIComponent(tag)}`
  let hasManifest = false
  let githubManifestStatus = null
  let githubManifestPayload = null
  let githubManifestError = null
  try {
    const githubReleaseResp = await fetchWithTimeout(githubReleaseUrl, {}, timeoutMs)
    githubManifestStatus = githubReleaseResp.status
    if (githubReleaseResp.ok) {
      const githubRelease = await githubReleaseResp.json()
      const githubAssets = Array.isArray(githubRelease?.assets) ? githubRelease.assets : []
      hasManifest = githubAssets.some((item) => item?.name === 'tuff-release-manifest.json')
      const manifestResult = await fetchGithubManifestPayload(githubAssets, timeoutMs)
      hasManifest = manifestResult.hasManifest
      githubManifestPayload = manifestResult.manifestPayload
      githubManifestError = manifestResult.error
    }
  } catch (error) {
    githubManifestStatus = 'error'
    githubManifestError = createHttpErrorPayload(error)
  }

  const manifestMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-manifest-asset',
    hasManifest ? 'pass' : manifestMissingStatus,
    hasManifest
      ? 'GitHub release manifest asset exists.'
      : 'GitHub release manifest asset is missing (`tuff-release-manifest.json`).',
    { hasManifest, githubReleaseUrl, githubManifestStatus, nexusAssetCount: assets.length }
  )

  const manifestIntegrityStatus = stage === 'gate-e' ? 'fail' : 'warn'
  if (hasManifest && !githubManifestPayload) {
    pushCheck(
      'remote-manifest-integrity',
      manifestIntegrityStatus,
      'GitHub release manifest asset exists but could not be parsed.',
      {
        githubReleaseUrl,
        githubManifestStatus,
        error: githubManifestError
      }
    )
  } else if (githubManifestPayload) {
    const comparison = compareNexusAssetsWithManifest({
      assets,
      manifestPayload: githubManifestPayload,
      remoteRelease: release,
      tag,
      baseUrl,
    })
    const integrityOk = comparison.issues.length === 0
    pushCheck(
      'remote-manifest-integrity',
      integrityOk ? 'pass' : manifestIntegrityStatus,
      integrityOk
        ? 'GitHub release manifest core artifacts are structurally valid.'
        : 'GitHub release manifest core artifacts are incomplete or inconsistent.',
      {
        issues: comparison.issues,
        manifestMatrix: comparison.manifestMatrix,
      }
    )

    const matrixOk = comparison.issues.length === 0 && comparison.mismatches.length === 0
    pushCheck(
      'remote-manifest-nexus-matrix',
      matrixOk ? 'pass' : manifestIntegrityStatus,
      matrixOk
        ? 'Nexus release asset matrix matches GitHub release manifest core artifacts.'
        : 'Nexus release asset matrix does not match GitHub release manifest core artifacts.',
      {
        mismatches: comparison.mismatches,
        manifestIssues: comparison.issues,
        nexusMatrix: comparison.nexusMatrix,
        manifestMatrix: comparison.manifestMatrix,
      }
    )
  }

  const malformedIntegrity = assets.filter((item) => !normalizeSha(item?.sha256) || !item?.signatureUrl)
  const integrityMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-asset-integrity',
    malformedIntegrity.length === 0 ? 'pass' : integrityMissingStatus,
    malformedIntegrity.length === 0
      ? 'Remote assets all contain valid sha256 and signatureUrl.'
      : 'Remote assets missing valid sha256 or signatureUrl.',
    {
      missing: malformedIntegrity.map((item) => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename,
        hasSha256: Boolean(item?.sha256),
        hasValidSha256: Boolean(normalizeSha(item?.sha256)),
        hasSignatureUrl: Boolean(item?.signatureUrl)
      }))
    }
  )

  const matrixKeys = new Map()
  for (const item of assets) {
    const platform = typeof item?.platform === 'string' ? item.platform : ''
    const arch = typeof item?.arch === 'string' ? item.arch : ''
    if (!platform || !arch) continue
    matrixKeys.set(`${platform}/${arch}`, { platform, arch })
  }

  const signatureResults = []
  const downloadResults = []
  const assetsByPair = new Map()
  for (const item of assets) {
    const platform = typeof item?.platform === 'string' ? item.platform : ''
    const arch = typeof item?.arch === 'string' ? item.arch : ''
    if (!platform || !arch) continue
    assetsByPair.set(`${platform}/${arch}`, item)
  }

  for (const pair of matrixKeys.values()) {
    const signatureUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/signature/${pair.platform}/${pair.arch}`
    const asset = assetsByPair.get(normalizePairKey(pair.platform, pair.arch))
    const downloadUrl = normalizeText(asset?.downloadUrl)
    const downloadUrlInfo = inspectSignedDownloadUrl(downloadUrl, baseUrl)
    const probeDownloadUrl = downloadUrlInfo.url || downloadUrl

    try {
      const signatureResp = await fetchWithTimeout(signatureUrl, { redirect: 'manual' }, timeoutMs)
      const signaturePayload = signatureResp.status === 200
        ? classifySignaturePayload(signatureResp, new Uint8Array(await signatureResp.arrayBuffer()))
        : null
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: signatureResp.status,
        validPayload: Boolean(signaturePayload?.valid),
        ...(signaturePayload ?? {})
      })
    } catch (error) {
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        error: createHttpErrorPayload(error)
      })
    }

    try {
      const downloadResp = await fetchWithTimeout(probeDownloadUrl, { redirect: 'manual' }, timeoutMs)
      const downloadResponseInfo = downloadResp.status === 200
        ? classifyDownloadResponse(downloadResp, new Uint8Array(await downloadResp.arrayBuffer()))
        : classifyDownloadResponse(downloadResp)
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: downloadResp.status,
        ...downloadUrlInfo,
        ...downloadResponseInfo
      })
    } catch (error) {
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        ...downloadUrlInfo,
        error: createHttpErrorPayload(error)
      })
    }
  }

  const allSignatureOk = signatureResults.every((item) => item.status === 200 && item.validPayload)
  const signatureStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-signature-endpoint',
    allSignatureOk ? 'pass' : signatureStatus,
    allSignatureOk
      ? 'Remote signature endpoint returns non-empty signature payloads for all matrix entries.'
      : 'Remote signature endpoint is not ready for all matrix entries.',
    { results: signatureResults }
  )

  const allDownloadOk = downloadResults.every((item) =>
    [200, 302, 307, 308].includes(item.status) &&
    item.sameOrigin &&
    item.hasExp &&
    item.hasValidSig &&
    item.validResponse
  )
  pushCheck(
    'remote-download-endpoint',
    allDownloadOk ? 'pass' : 'fail',
    allDownloadOk
      ? 'Remote signed download URLs are available for all matrix entries.'
      : 'Remote signed download URLs have unavailable or unsigned entries.',
    { results: downloadResults }
  )

  const channel = typeof release.channel === 'string' && release.channel ? release.channel : 'RELEASE'
  const latestUrl = `${baseUrl}/api/releases/latest?channel=${encodeURIComponent(channel)}`
  try {
    const latestResp = await fetchWithTimeout(latestUrl, {}, timeoutMs)
    const latestPayload = await latestResp.json()
    const latestTag = latestPayload?.release?.tag
    const latestOk = latestResp.ok && latestTag === tag
    pushCheck(
      'remote-latest',
      latestOk ? 'pass' : 'warn',
      latestOk
        ? `Latest release for channel ${channel} matches ${tag}.`
        : `Latest release for channel ${channel} does not match ${tag}.`,
      { url: latestUrl, httpStatus: latestResp.status, latestTag, expectedTag: tag }
    )
  } catch (error) {
    pushCheck('remote-latest', 'warn', 'Failed to query remote latest release.', {
      url: latestUrl,
      error: createHttpErrorPayload(error)
    })
  }
}
