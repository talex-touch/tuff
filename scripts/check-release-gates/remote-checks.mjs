import { fetchWithTimeout, normalizeBaseUrl } from '../lib/http-utils.mjs'

function createHttpErrorPayload(error) {
  return error instanceof Error ? error.message : String(error)
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

  const hasManifest = assets.some((item) => item?.filename === 'tuff-release-manifest.json')
  const manifestMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-manifest-asset',
    hasManifest ? 'pass' : manifestMissingStatus,
    hasManifest
      ? 'Remote manifest asset exists.'
      : 'Remote manifest asset is missing (`tuff-release-manifest.json`).',
    { hasManifest, assetCount: assets.length }
  )

  const missingIntegrity = assets.filter((item) => !item?.sha256 || !item?.signatureUrl)
  const integrityMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-asset-integrity',
    missingIntegrity.length === 0 ? 'pass' : integrityMissingStatus,
    missingIntegrity.length === 0
      ? 'Remote assets all contain sha256 and signatureUrl.'
      : 'Remote assets missing sha256 or signatureUrl.',
    {
      missing: missingIntegrity.map((item) => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename,
        hasSha256: Boolean(item?.sha256),
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

  for (const pair of matrixKeys.values()) {
    const signatureUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/signature/${pair.platform}/${pair.arch}`
    const downloadUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/download/${pair.platform}/${pair.arch}`

    try {
      const signatureResp = await fetchWithTimeout(signatureUrl, { redirect: 'manual' }, timeoutMs)
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: signatureResp.status
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
      const downloadResp = await fetchWithTimeout(downloadUrl, { redirect: 'manual' }, timeoutMs)
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: downloadResp.status
      })
    } catch (error) {
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        error: createHttpErrorPayload(error)
      })
    }
  }

  const allSignatureOk = signatureResults.every((item) => item.status === 200)
  const signatureStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-signature-endpoint',
    allSignatureOk ? 'pass' : signatureStatus,
    allSignatureOk
      ? 'Remote signature endpoint returns 200 for all matrix entries.'
      : 'Remote signature endpoint is not ready for all matrix entries.',
    { results: signatureResults }
  )

  const allDownloadOk = downloadResults.every((item) => [200, 302, 307, 308].includes(item.status))
  pushCheck(
    'remote-download-endpoint',
    allDownloadOk ? 'pass' : 'fail',
    allDownloadOk
      ? 'Remote download endpoint is available for all matrix entries.'
      : 'Remote download endpoint has unavailable entries.',
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
