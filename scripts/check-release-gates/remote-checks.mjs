import { fetchWithTimeout, normalizeBaseUrl } from '../lib/http-utils.mjs'
import { REQUIRED_CORE_PAIRS } from '../lib/release-artifacts.mjs'
import { validateRollbackContract } from '../lib/update-rollback-contract.mjs'

const sha256Pattern = /^[a-f0-9]{64}$/i
const releaseChannels = new Set(['RELEASE', 'BETA'])

function inferCoreArtifactPlatform(filename) {
  const lower = normalizeText(filename).toLowerCase()
  if (lower.includes('windows') || lower.endsWith('.exe'))
    return 'win32'
  if (
    lower.includes('macos')
    || lower.endsWith('.dmg')
    || lower.endsWith('.zip')
  ) {
    return 'darwin'
  }
  if (
    lower.includes('ubuntu')
    || lower.endsWith('.appimage')
    || lower.endsWith('.deb')
    || lower.endsWith('.snap')
  ) {
    return 'linux'
  }
  return null
}

function inferCoreArtifactArch(filename) {
  const lower = normalizeText(filename).toLowerCase()
  if (lower.includes('universal'))
    return 'universal'
  if (lower.includes('arm64') || lower.includes('aarch64'))
    return 'arm64'
  if (lower.includes('x64') || lower.includes('amd64'))
    return 'x64'
  return 'x64'
}

function createHttpErrorPayload(error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeSha(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
  return sha256Pattern.test(text) ? text : ''
}

function normalizeText(value) {
  return String(value || '').trim()
}

function classifySignaturePayload(response, bytes) {
  const contentType = normalizeText(
    response.headers.get('content-type'),
  ).toLowerCase()
  const byteLength = bytes.byteLength
  const sample = new TextDecoder()
    .decode(bytes.slice(0, Math.min(byteLength, 512)))
    .trimStart()
  const lowerSample = sample.toLowerCase()

  if (byteLength === 0) {
    return {
      valid: false,
      reason: 'empty-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'empty',
    }
  }

  if (
    contentType.includes('json')
    || lowerSample.startsWith('{')
    || lowerSample.startsWith('[')
  ) {
    return {
      valid: false,
      reason: 'json-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'json',
    }
  }

  if (
    contentType.includes('html')
    || lowerSample.startsWith('<!doctype')
    || lowerSample.startsWith('<html')
  ) {
    return {
      valid: false,
      reason: 'html-signature-body',
      byteLength,
      contentType: contentType || null,
      kind: 'html',
    }
  }

  if (/^-----BEGIN [A-Z0-9 ]*SIGNATURE-----/.test(sample)) {
    return {
      valid: true,
      byteLength,
      contentType: contentType || null,
      kind: 'ascii-armored-signature',
    }
  }

  return {
    valid: true,
    byteLength,
    contentType: contentType || null,
    kind: 'opaque-signature',
  }
}

function classifyDownloadResponse(response, bytes = new Uint8Array()) {
  const status = response.status
  const location = normalizeText(response.headers.get('location'))
  const contentType = normalizeText(
    response.headers.get('content-type'),
  ).toLowerCase()

  if ([302, 307, 308].includes(status)) {
    return {
      validResponse: Boolean(location),
      responseKind: 'redirect',
      location: location || null,
      ...(location ? {} : { reason: 'missing-redirect-location' }),
    }
  }

  if (status !== 200) {
    return {
      validResponse: false,
      responseKind: 'unavailable',
      reason: `unexpected-status:${status}`,
    }
  }

  const byteLength = bytes.byteLength
  const sample = new TextDecoder()
    .decode(bytes.slice(0, Math.min(byteLength, 512)))
    .trimStart()
  const lowerSample = sample.toLowerCase()

  if (byteLength === 0) {
    return {
      validResponse: false,
      responseKind: 'empty',
      byteLength,
      contentType: contentType || null,
      reason: 'empty-download-body',
    }
  }

  if (
    contentType.includes('json')
    || lowerSample.startsWith('{')
    || lowerSample.startsWith('[')
  ) {
    return {
      validResponse: false,
      responseKind: 'json',
      byteLength,
      contentType: contentType || null,
      reason: 'json-download-body',
    }
  }

  if (
    contentType.includes('html')
    || lowerSample.startsWith('<!doctype')
    || lowerSample.startsWith('<html')
  ) {
    return {
      validResponse: false,
      responseKind: 'html',
      byteLength,
      contentType: contentType || null,
      reason: 'html-download-body',
    }
  }

  return {
    validResponse: true,
    responseKind: 'binary',
    byteLength,
    contentType: contentType || null,
  }
}

function normalizePairKey(platform, arch) {
  return `${normalizeText(platform)}/${normalizeText(arch)}`
}

function inferReleaseChannel(versionText) {
  const lower = normalizeText(versionText).toLowerCase()
  if (
    lower.includes('snapshot')
    || lower.includes('alpha')
    || lower.includes('beta')
  ) {
    return 'BETA'
  }
  return 'RELEASE'
}

function compareReleaseVersions(left, right) {
  const parse = (value) => {
    const match = normalizeText(value).match(
      /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)(?:[.-](\d+))?)?$/i,
    )
    if (!match)
      return null
    const [, major, minor, patch, label = '', sequence = '0'] = match
    return {
      numbers: [Number(major), Number(minor), Number(patch)],
      label: label.toLowerCase(),
      sequence: Number(sequence),
    }
  }
  const parsedLeft = parse(left)
  const parsedRight = parse(right)
  if (!parsedLeft || !parsedRight)
    return null
  for (let index = 0; index < parsedLeft.numbers.length; index += 1) {
    if (parsedLeft.numbers[index] !== parsedRight.numbers[index])
      return parsedLeft.numbers[index] - parsedRight.numbers[index]
  }
  if (parsedLeft.label !== parsedRight.label) {
    if (!parsedLeft.label)
      return 1
    if (!parsedRight.label)
      return -1
    return parsedLeft.label.localeCompare(parsedRight.label)
  }
  return parsedLeft.sequence - parsedRight.sequence
}

function resolveExpectedRollbackFromVersion(releases, { version, channel }) {
  const candidates = releases
    .map(item => normalizeText(item?.version))
    .filter(candidate => inferReleaseChannel(candidate) === channel)
    .filter(candidate => compareReleaseVersions(candidate, version) < 0)
    .sort((left, right) => compareReleaseVersions(right, left))
  return candidates[0] ?? null
}

function validateRemoteReleaseMetadata(release, tag) {
  const issues = []
  const releaseTag = normalizeText(release?.tag)
  const releaseVersion = normalizeText(release?.version)
  const releaseChannel = normalizeText(release?.channel)
  const releaseStatus = normalizeText(release?.status).toLowerCase()
  const expectedVersion = normalizeText(tag).replace(/^v/, '')
  const expectedChannel = inferReleaseChannel(
    releaseVersion || expectedVersion,
  )

  if (!releaseTag) {
    issues.push('release.tag is required')
  }
  else if (releaseTag !== tag) {
    issues.push(`release.tag ${releaseTag} does not match ${tag}`)
  }

  if (!releaseVersion) {
    issues.push('release.version is required')
  }
  else if (expectedVersion && releaseVersion !== expectedVersion) {
    issues.push(
      `release.version ${releaseVersion} does not match ${expectedVersion}`,
    )
  }

  if (!releaseChannel) {
    issues.push('release.channel is required')
  }
  else if (!releaseChannels.has(releaseChannel)) {
    issues.push('release.channel must be RELEASE|BETA|SNAPSHOT')
  }
  else if (releaseChannel !== expectedChannel) {
    issues.push('release.channel must match release.version suffix')
  }

  if (releaseStatus !== 'published')
    issues.push('release.status must be published')

  return {
    ok: issues.length === 0,
    issues,
    releaseTag: releaseTag || null,
    releaseVersion: releaseVersion || null,
    releaseChannel: releaseChannel || null,
    expectedTag: tag,
    expectedVersion: expectedVersion || null,
    expectedChannel,
    releaseStatus: releaseStatus || null,
  }
}

function validateGithubReleaseMetadata(githubRelease, { remoteRelease, tag }) {
  const issues = []
  const githubTag = normalizeText(githubRelease?.tag_name)
  const githubDraft = githubRelease?.draft === true
  const githubPrerelease = githubRelease?.prerelease === true
  const remoteVersion = normalizeText(remoteRelease?.version)
  const remoteChannel = normalizeText(remoteRelease?.channel)
  const expectedChannel = releaseChannels.has(remoteChannel)
    ? remoteChannel
    : inferReleaseChannel(
        remoteVersion || normalizeText(tag).replace(/^v/, ''),
      )
  const expectedPrerelease = expectedChannel !== 'RELEASE'

  if (!githubTag) {
    issues.push('github.tag_name is required')
  }
  else if (githubTag !== tag) {
    issues.push(`github.tag_name ${githubTag} does not match ${tag}`)
  }

  if (githubDraft)
    issues.push('github.draft must be false')

  if (githubPrerelease !== expectedPrerelease) {
    issues.push(
      `github.prerelease must be ${expectedPrerelease} for ${expectedChannel}`,
    )
  }

  return {
    ok: issues.length === 0,
    issues,
    githubTag: githubTag || null,
    githubDraft,
    githubPrerelease,
    expectedTag: tag,
    expectedChannel,
    expectedPrerelease,
    remoteTag: normalizeText(remoteRelease?.tag) || null,
    remoteVersion: remoteVersion || null,
    remoteChannel: remoteChannel || null,
  }
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
  }
  catch {
    return ''
  }
}

function inspectCanonicalSameOriginEndpoint(value, baseUrl) {
  const parsed = resolveSameOriginUrl(value, baseUrl)
  if (!parsed) {
    return {
      url: normalizeText(value) || null,
      sameOrigin: false,
      path: null,
      hasQuery: false,
      hasHash: false,
      canonical: false,
      reason: 'not-same-origin',
    }
  }

  const hasQuery = parsed.search.length > 0
  const hasHash = parsed.hash.length > 0
  return {
    url: parsed.href,
    sameOrigin: true,
    path: normalizePathname(parsed.pathname),
    hasQuery,
    hasHash,
    canonical: !hasQuery && !hasHash,
    ...(!hasQuery && !hasHash ? {} : { reason: 'non-canonical-endpoint-url' }),
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
  }
  catch {
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
      hasHash: false,
      hasExp: false,
      hasValidExp: false,
      hasSig: false,
      hasValidSig: false,
      reason: 'not-same-origin',
    }
  }

  const sig = normalizeText(parsed.searchParams.get('sig'))
  const exp = normalizeText(parsed.searchParams.get('exp'))
  const hasHash = parsed.hash.length > 0
  const queryKeys = Array.from(parsed.searchParams.keys())
  const duplicateQueryKeys = queryKeys.filter(
    (key, index) => queryKeys.indexOf(key) !== index,
  )
  const hasDuplicateSignedQuery
    = duplicateQueryKeys.includes('exp') || duplicateQueryKeys.includes('sig')
  const unexpectedQueryKeys = queryKeys.filter(
    key => key !== 'exp' && key !== 'sig',
  )
  const reason = hasHash
    ? 'download-url-has-fragment'
    : hasDuplicateSignedQuery
      ? 'download-url-has-duplicate-signed-query'
      : unexpectedQueryKeys.length > 0
        ? 'download-url-has-unexpected-query'
        : null
  return {
    url: parsed.href,
    sameOrigin: true,
    path: normalizePathname(parsed.pathname),
    hasHash,
    hasExp: Boolean(exp),
    hasValidExp: /^[1-9]\d*$/.test(exp),
    hasSig: Boolean(sig),
    hasValidSig: /^[a-f0-9]{64}$/i.test(sig),
    hasDuplicateSignedQuery,
    duplicateQueryKeys,
    hasUnexpectedQuery: unexpectedQueryKeys.length > 0,
    unexpectedQueryKeys,
    ...(reason ? { reason } : {}),
    ...(exp ? { exp } : {}),
  }
}

function buildExpectedSignaturePath(tag, platform, arch) {
  return normalizePathname(
    `/api/releases/${encodeURIComponent(tag)}/signature/${encodeURIComponent(platform)}/${encodeURIComponent(arch)}`,
  )
}

function buildExpectedDownloadPath(tag, platform, arch) {
  return normalizePathname(
    `/api/releases/${encodeURIComponent(tag)}/download/${encodeURIComponent(platform)}/${encodeURIComponent(arch)}`,
  )
}

function getReleaseAssetFilename(asset) {
  return normalizeText(asset?.filename || asset?.name)
}

function createManifestIssueDetails(artifacts, issues) {
  const normalizedArtifacts = Array.isArray(artifacts) ? artifacts : []
  return issues.map((message) => {
    const match = /^artifacts\[(\d+)\](?:\.([\w-]+))?/.exec(message)
    if (!match) {
      return {
        scope: 'manifest',
        reason: message,
      }
    }

    const index = Number(match[1])
    const field = match[2] || null
    const detail = message.slice(match[0].length).trim()
    const reason = [field ? `${field}` : '', detail || 'is invalid']
      .filter(Boolean)
      .join(' ')
      .trim()
    const artifact = normalizedArtifacts[index] ?? null
    return {
      scope: 'artifact',
      index,
      field,
      component: normalizeText(artifact?.component) || null,
      name: normalizeText(artifact?.name) || null,
      platform: normalizeText(artifact?.platform) || null,
      arch: normalizeText(artifact?.arch) || null,
      reason,
    }
  })
}

function buildGithubCoreManifestMatrix(manifestPayload) {
  const release = manifestPayload?.release
  const artifacts = Array.isArray(manifestPayload?.artifacts)
    ? manifestPayload.artifacts
    : []
  const matrix = new Map()
  const issues = []
  const artifactNames = new Set()
  const artifactSha256s = new Set()
  let coreArtifactCount = 0

  if (manifestPayload?.schemaVersion !== 2)
    issues.push('schemaVersion must be 2')

  const manifestVersion = normalizeText(release?.version)
  const manifestTag = normalizeText(release?.tag)
  const manifestChannel = normalizeText(release?.channel)

  if (!manifestVersion)
    issues.push('release.version is required')
  if (!manifestTag)
    issues.push('release.tag is required')
  if (!manifestChannel) {
    issues.push('release.channel is required')
  }
  else if (!releaseChannels.has(manifestChannel)) {
    issues.push('release.channel must be RELEASE|BETA|SNAPSHOT')
  }
  if (manifestVersion && manifestTag && manifestTag !== `v${manifestVersion}`)
    issues.push('release.tag must match release.version')
  if (
    manifestVersion
    && manifestChannel
    && releaseChannels.has(manifestChannel)
    && manifestChannel !== inferReleaseChannel(manifestVersion)
  ) {
    issues.push('release.channel must match release.version suffix')
  }
  issues.push(
    ...validateRollbackContract({
      version: manifestVersion,
      channel: manifestChannel,
      rollbackFromVersion: release?.rollbackFromVersion,
      rollbackCompatible: release?.rollbackCompatible,
    }),
  )
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
    if (
      name
      && signature
      && signature !== `${name}.sig`
      && signature !== `${name}.asc`
    ) {
      issues.push(
        `${label}.signature must point to the artifact .sig/.asc sidecar`,
      )
    }
    if (signature && artifactNames.has(signature)) {
      issues.push(
        `${label}.signature sidecar must not be listed as a downloadable artifact`,
      )
    }
    if (name) {
      if (manifestVersion && !name.includes(manifestVersion))
        issues.push(`${label}.name must include release.version`)
      const inferredPlatform = inferCoreArtifactPlatform(name)
      const inferredArch = inferCoreArtifactArch(name)
      if (!inferredPlatform)
        issues.push(`${label}.name must include a recognizable core platform`)
      if (inferredPlatform && platform && platform !== inferredPlatform)
        issues.push(`${label}.platform does not match artifact name`)
      if (arch && arch !== inferredArch)
        issues.push(`${label}.arch does not match artifact name`)
    }

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
  for (const pair of REQUIRED_CORE_PAIRS) {
    if (!matrix.has(pair))
      issues.push(`artifacts must include required platform/arch ${pair}`)
  }
  for (const pair of matrix.keys()) {
    if (!REQUIRED_CORE_PAIRS.includes(pair))
      issues.push(`artifacts contains unsupported core platform/arch ${pair}`)
  }

  return {
    release,
    matrix,
    issues,
    issueDetails: createManifestIssueDetails(artifacts, issues),
  }
}

async function fetchGithubManifestPayload(githubAssets, { tag, timeoutMs }) {
  const manifestAsset
    = githubAssets.find(item => item?.name === 'tuff-release-manifest.json')
      ?? null
  const manifestAssetState = normalizeText(manifestAsset?.state)
  if (manifestAssetState && manifestAssetState !== 'uploaded') {
    return {
      hasManifest: true,
      manifestAsset,
      manifestPayload: null,
      error: `manifest asset is not uploaded (${manifestAssetState})`,
    }
  }

  const downloadUrlInfo = inspectGithubAssetDownloadUrl(
    manifestAsset?.browser_download_url,
    {
      tag,
      name: 'tuff-release-manifest.json',
    },
  )
  if (!downloadUrlInfo.url || !downloadUrlInfo.valid) {
    return {
      hasManifest: Boolean(manifestAsset),
      manifestAsset,
      manifestPayload: null,
      error: manifestAsset ? downloadUrlInfo.reason : null,
      downloadUrlInfo: manifestAsset ? downloadUrlInfo : null,
    }
  }

  try {
    const response = await fetchWithTimeout(downloadUrlInfo.url, {}, timeoutMs)
    if (!response.ok) {
      return {
        hasManifest: true,
        manifestAsset,
        manifestPayload: null,
        error: `manifest download failed (${response.status})`,
        downloadUrlInfo,
      }
    }

    const text = await response.text()
    return {
      hasManifest: true,
      manifestAsset,
      manifestPayload: JSON.parse(text),
      error: null,
      downloadUrlInfo,
    }
  }
  catch (error) {
    return {
      hasManifest: true,
      manifestAsset,
      manifestPayload: null,
      error: createHttpErrorPayload(error),
      downloadUrlInfo,
    }
  }
}

async function checkGithubFallbackManifest({ tag, timeoutMs, pushCheck }) {
  const githubReleaseUrl = `https://api.github.com/repos/talex-touch/tuff/releases/tags/${encodeURIComponent(tag)}`
  try {
    const response = await fetchWithTimeout(githubReleaseUrl, {}, timeoutMs)
    if (!response.ok) {
      pushCheck(
        'remote-github-fallback-contract',
        response.status >= 500 ? 'blocked' : 'fail',
        response.status >= 500
          ? 'Nexus is transient and GitHub fallback release metadata is temporarily unavailable.'
          : 'Nexus is transient and GitHub fallback release metadata could not be fetched.',
        {
          url: githubReleaseUrl,
          httpStatus: response.status,
          source: 'github-fallback',
        },
      )
      return
    }
    const githubRelease = await response.json()
    const githubAssets = Array.isArray(githubRelease?.assets)
      ? githubRelease.assets
      : []
    const manifestResult = await fetchGithubManifestPayload(githubAssets, {
      tag,
      timeoutMs,
    })
    if (!manifestResult.manifestPayload) {
      pushCheck(
        'remote-github-fallback-contract',
        'fail',
        'Nexus is transient and GitHub fallback manifest is missing or unreadable.',
        {
          url: githubReleaseUrl,
          source: 'github-fallback',
          error: manifestResult.error ?? 'manifest-unavailable',
        },
      )
      return
    }

    const manifest = manifestResult.manifestPayload
    const matrix = buildGithubCoreManifestMatrix(manifest)
    const assetComparison = compareGithubAssetsWithManifest({
      githubAssets,
      manifestPayload: manifest,
      tag,
    })
    const historyUrl
      = 'https://api.github.com/repos/talex-touch/tuff/releases?per_page=100'
    let rollbackIssues = []
    let expectedRollbackFromVersion = null
    try {
      const historyResponse = await fetchWithTimeout(historyUrl, {}, timeoutMs)
      if (!historyResponse.ok) {
        pushCheck(
          'remote-github-fallback-rollback',
          historyResponse.status >= 500 ? 'blocked' : 'fail',
          'GitHub fallback cannot establish the exact same-channel N-1 rollback predecessor.',
          {
            url: historyUrl,
            httpStatus: historyResponse.status,
            source: 'github-fallback',
          },
        )
      }
      else {
        const history = await historyResponse.json()
        expectedRollbackFromVersion = resolveExpectedRollbackFromVersion(
          Array.isArray(history)
            ? history.map(item => ({
                version: normalizeText(item?.tag_name).replace(/^v/, ''),
              }))
            : [],
          {
            version: manifest.release?.version,
            channel: manifest.release?.channel,
          },
        )
        rollbackIssues = !expectedRollbackFromVersion
          ? ['No same-channel N-1 release is available for rollback validation']
          : validateRollbackContract({
              version: manifest.release?.version,
              channel: manifest.release?.channel,
              rollbackFromVersion: manifest.release?.rollbackFromVersion,
              rollbackCompatible: manifest.release?.rollbackCompatible,
              expectedRollbackFromVersion,
            })
        pushCheck(
          'remote-github-fallback-rollback',
          rollbackIssues.length === 0 ? 'pass' : 'fail',
          rollbackIssues.length === 0
            ? 'GitHub fallback manifest rollback metadata matches the exact same-channel N-1 release.'
            : 'GitHub fallback manifest rollback metadata is missing, invalid, or not the exact same-channel N-1 release.',
          {
            url: historyUrl,
            source: 'github-fallback',
            expectedRollbackFromVersion,
            issues: rollbackIssues,
          },
        )
      }
    }
    catch (error) {
      pushCheck(
        'remote-github-fallback-rollback',
        'blocked',
        'GitHub fallback rollback history is unreachable.',
        {
          url: historyUrl,
          source: 'github-fallback',
          error: createHttpErrorPayload(error),
        },
      )
    }

    const issues = [
      ...matrix.issues,
      ...assetComparison.issues,
      ...assetComparison.missing,
    ]
    pushCheck(
      'remote-github-fallback-contract',
      issues.length === 0 && rollbackIssues.length === 0 ? 'pass' : 'fail',
      issues.length === 0 && rollbackIssues.length === 0
        ? 'Nexus transient fallback preserves the schema v2 manifest, matrix, SHA-256, signature, download, and rollback contract through GitHub.'
        : 'GitHub fallback does not satisfy the schema v2 manifest contract.',
      {
        url: githubReleaseUrl,
        source: 'github-fallback',
        issues,
        rollbackIssues,
        manifestMatrix: Array.from(matrix.matrix.values()),
      },
    )
  }
  catch (error) {
    pushCheck(
      'remote-github-fallback-contract',
      'blocked',
      'Nexus and GitHub fallback release metadata are unreachable.',
      {
        url: githubReleaseUrl,
        source: 'github-fallback',
        error: createHttpErrorPayload(error),
      },
    )
  }
}

function compareNexusAssetsWithManifest({
  assets,
  manifestPayload,
  remoteRelease,
  tag,
  baseUrl,
}) {
  const {
    release: manifestRelease,
    matrix,
    issues,
    issueDetails,
  } = buildGithubCoreManifestMatrix(manifestPayload)
  const mismatches = []
  const nexusMatrix = []
  const seenNexusKeys = new Map()

  const manifestTag = normalizeText(manifestRelease?.tag)
  if (manifestTag && manifestTag !== tag) {
    issues.push(`manifest release.tag ${manifestTag} does not match ${tag}`)
    issueDetails.push({
      scope: 'manifest',
      field: 'release.tag',
      actual: manifestTag,
      expected: tag,
      reason: 'release.tag does not match checked tag',
    })
  }
  const manifestVersion = normalizeText(manifestRelease?.version)
  const remoteVersion = normalizeText(remoteRelease?.version)
  if (manifestVersion && remoteVersion && manifestVersion !== remoteVersion) {
    issues.push(
      `manifest release.version ${manifestVersion} does not match remote ${remoteVersion}`,
    )
    issueDetails.push({
      scope: 'manifest',
      field: 'release.version',
      actual: manifestVersion,
      expected: remoteVersion,
      reason: 'release.version does not match remote release',
    })
  }
  const manifestChannel = normalizeText(manifestRelease?.channel)
  const remoteChannel = normalizeText(remoteRelease?.channel)
  if (manifestChannel && remoteChannel && manifestChannel !== remoteChannel) {
    issues.push(
      `manifest release.channel ${manifestChannel} does not match remote ${remoteChannel}`,
    )
    issueDetails.push({
      scope: 'manifest',
      field: 'release.channel',
      actual: manifestChannel,
      expected: remoteChannel,
      reason: 'release.channel does not match remote release',
    })
  }
  for (const field of ['rollbackFromVersion', 'rollbackCompatible']) {
    if (manifestRelease?.[field] !== remoteRelease?.[field]) {
      issues.push(`manifest release.${field} does not match remote release`)
      issueDetails.push({
        scope: 'manifest',
        field: `release.${field}`,
        actual: manifestRelease?.[field] ?? null,
        expected: remoteRelease?.[field] ?? null,
        reason: `release.${field} does not match remote release`,
      })
    }
  }

  for (const [index, asset] of assets.entries()) {
    const platform = normalizeText(asset?.platform)
    const arch = normalizeText(asset?.arch)
    const actualFilename = getReleaseAssetFilename(asset)
    if (!platform || !arch || !actualFilename) {
      mismatches.push({
        key: platform && arch ? normalizePairKey(platform, arch) : null,
        index,
        platform: platform || null,
        arch: arch || null,
        filename: actualFilename || null,
        reason: 'invalid-nexus-asset-identity',
      })
    }
    if (!platform || !arch)
      continue

    const key = normalizePairKey(platform, arch)
    const expected = matrix.get(key)
    const actualSha256 = normalizeSha(asset?.sha256)
    const actualDownloadUrl = normalizeText(asset?.downloadUrl)
    const actualDownloadPath = resolveSameOriginUrlPath(
      actualDownloadUrl,
      baseUrl,
    )
    const actualSignatureUrl = normalizeText(asset?.signatureUrl)
    const actualSignatureInfo = inspectCanonicalSameOriginEndpoint(
      actualSignatureUrl,
      baseUrl,
    )
    const actualSignaturePath = actualSignatureInfo.path
    const expectedDownloadPath = buildExpectedDownloadPath(tag, platform, arch)
    const expectedSignaturePath = buildExpectedSignaturePath(
      tag,
      platform,
      arch,
    )

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
      signatureUrlCanonical: actualSignatureInfo.canonical,
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
    else if (!actualSignatureInfo.canonical) {
      mismatches.push({
        key,
        reason: 'signature-url-not-canonical',
        actual: actualSignatureUrl || null,
        expected: expectedSignaturePath,
        hasQuery: actualSignatureInfo.hasQuery,
        hasHash: actualSignatureInfo.hasHash,
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
    issueDetails,
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

function inspectGithubAssetDownloadUrl(value, { tag, name }) {
  const text = normalizeText(value)
  if (!text) {
    return {
      url: null,
      path: null,
      hasExpectedTag: false,
      hasExpectedName: false,
      valid: false,
      reason: 'missing-browser-download-url',
    }
  }

  try {
    const parsed = new URL(text)
    const path = decodeURIComponent(parsed.pathname)
    const hasExpectedTag = path.split('/').includes(tag)
    const hasExpectedName = path.endsWith(`/${name}`)
    return {
      url: parsed.href,
      path,
      hasExpectedTag,
      hasExpectedName,
      valid: hasExpectedTag && hasExpectedName,
      ...(hasExpectedTag && hasExpectedName
        ? {}
        : { reason: 'github-asset-download-url-mismatch' }),
    }
  }
  catch {
    return {
      url: text,
      path: null,
      hasExpectedTag: false,
      hasExpectedName: false,
      valid: false,
      reason: 'github-asset-download-url-invalid',
    }
  }
}

function compareGithubAssetsWithManifest({
  githubAssets,
  manifestPayload,
  tag,
}) {
  const { matrix, issues, issueDetails }
    = buildGithubCoreManifestMatrix(manifestPayload)
  const assetsByName = new Map()
  const assetNameIndexes = new Map()
  const duplicateAssets = []
  for (const [index, asset] of githubAssets.entries()) {
    const name = normalizeText(asset?.name)
    if (!name)
      continue

    if (assetsByName.has(name)) {
      const firstIndex = assetNameIndexes.get(name) ?? null
      duplicateAssets.push({
        name,
        firstIndex,
        duplicateIndex: index,
        reason: 'duplicate-github-asset-name',
      })
      issues.push(`github release asset name ${name} must be unique`)
    }
    else {
      assetsByName.set(name, asset)
      assetNameIndexes.set(name, index)
    }
  }
  const missing = []
  const expectedNames = new Set()

  const addMissingAsset = ({ artifact, name, kind }) => {
    expectedNames.add(name)
    const githubAsset = assetsByName.get(name)
    if (!githubAsset) {
      missing.push({
        platform: artifact.platform,
        arch: artifact.arch,
        name,
        ...(kind === 'signature' ? { artifact: artifact.name } : {}),
        kind,
        reason: 'missing-github-asset',
      })
      return
    }

    const downloadUrlInfo = inspectGithubAssetDownloadUrl(
      githubAsset?.browser_download_url,
      { tag, name },
    )
    if (!downloadUrlInfo.url) {
      missing.push({
        platform: artifact.platform,
        arch: artifact.arch,
        name,
        ...(kind === 'signature' ? { artifact: artifact.name } : {}),
        kind,
        reason: 'missing-browser-download-url',
      })
    }
    else if (!downloadUrlInfo.valid) {
      missing.push({
        platform: artifact.platform,
        arch: artifact.arch,
        name,
        ...(kind === 'signature' ? { artifact: artifact.name } : {}),
        kind,
        url: downloadUrlInfo.url,
        path: downloadUrlInfo.path,
        expectedTag: tag,
        expectedName: name,
        hasExpectedTag: downloadUrlInfo.hasExpectedTag,
        hasExpectedName: downloadUrlInfo.hasExpectedName,
        reason: downloadUrlInfo.reason,
      })
    }

    if (kind === 'artifact') {
      const githubDigest = normalizeSha(
        normalizeText(githubAsset?.digest).replace(/^sha256:/i, ''),
      )
      if (!githubDigest || githubDigest !== artifact.sha256) {
        missing.push({
          platform: artifact.platform,
          arch: artifact.arch,
          name,
          kind,
          digest: githubDigest || null,
          expectedDigest: artifact.sha256,
          reason: !githubDigest
            ? 'missing-github-sha256-digest'
            : 'github-sha256-digest-mismatch',
        })
      }
    }

    const state = normalizeText(githubAsset?.state)
    if (state && state !== 'uploaded') {
      missing.push({
        platform: artifact.platform,
        arch: artifact.arch,
        name,
        ...(kind === 'signature' ? { artifact: artifact.name } : {}),
        kind,
        state,
        reason: 'github-asset-not-uploaded',
      })
    }
  }

  for (const artifact of matrix.values()) {
    addMissingAsset({ artifact, name: artifact.name, kind: 'artifact' })
    if (artifact.signature) {
      addMissingAsset({
        artifact,
        name: artifact.signature,
        kind: 'signature',
      })
    }
  }

  const extraAssets = []
  for (const [index, asset] of githubAssets.entries()) {
    const name = normalizeText(asset?.name)
    if (
      !name
      || name === 'tuff-release-manifest.json'
      || expectedNames.has(name)
    ) {
      continue
    }
    if (!isGateERelevantGithubAssetName(name))
      continue

    extraAssets.push({
      name,
      index,
      reason: 'extra-github-release-asset',
    })
    issues.push(
      `github release asset name ${name} is not declared by manifest`,
    )
  }

  return {
    issues,
    issueDetails,
    missing,
    duplicateAssets,
    extraAssets,
    assetCount: githubAssets.length,
    manifestMatrix: Array.from(matrix.values()).map(item => ({
      platform: item.platform,
      arch: item.arch,
      name: item.name,
    })),
  }
}

function isGateERelevantGithubAssetName(name) {
  const lower = name.toLowerCase()
  return (
    lower.startsWith('tuff-core-')
    || lower.endsWith('.sig')
    || lower.endsWith('.asc')
  )
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
      pushCheck(
        'remote-release',
        response.status >= 500 ? 'blocked' : 'fail',
        response.status >= 500
          ? `Remote release metadata is temporarily unavailable (${response.status}).`
          : `Failed to fetch remote release metadata (${response.status}).`,
        { url: releaseUrl, httpStatus: response.status },
      )
      if (response.status >= 500)
        await checkGithubFallbackManifest({ tag, timeoutMs, pushCheck })
      return
    }
    releasePayload = await response.json()
  }
  catch (error) {
    pushCheck(
      'remote-release',
      'blocked',
      'Remote release metadata is unreachable.',
      {
        url: releaseUrl,
        error: createHttpErrorPayload(error),
      },
    )
    await checkGithubFallbackManifest({ tag, timeoutMs, pushCheck })
    return
  }

  const release = releasePayload?.release
  if (!release || typeof release !== 'object') {
    pushCheck(
      'remote-release',
      'fail',
      'Remote release payload is missing `release` object.',
      {
        url: releaseUrl,
      },
    )
    return
  }

  pushCheck('remote-release', 'pass', 'Remote release metadata fetched.', {
    url: releaseUrl,
    tag: release.tag,
    version: release.version,
    channel: release.channel,
    releaseStatus: release.status,
  })

  const releaseMetadata = validateRemoteReleaseMetadata(release, tag)
  const releaseMetadataStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-release-metadata',
    releaseMetadata.ok ? 'pass' : releaseMetadataStatus,
    releaseMetadata.ok
      ? 'Remote release tag/version/channel/status match the checked release.'
      : 'Remote release tag/version/channel/status do not match the checked release.',
    releaseMetadata,
  )

  const notes = release.notes ?? {}
  const notesHtml = release.notesHtml ?? {}
  const notesValid
    = typeof notes.zh === 'string'
      && notes.zh.trim().length > 0
      && typeof notes.en === 'string'
      && notes.en.trim().length > 0
  const notesHtmlValid
    = typeof notesHtml.zh === 'string'
      && notesHtml.zh.trim().length > 0
      && typeof notesHtml.en === 'string'
      && notesHtml.en.trim().length > 0

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
      notesHtmlZhLen:
        typeof notesHtml.zh === 'string' ? notesHtml.zh.length : 0,
      notesHtmlEnLen:
        typeof notesHtml.en === 'string' ? notesHtml.en.length : 0,
    },
  )

  const assets = Array.isArray(release.assets) ? release.assets : []
  pushCheck(
    'remote-assets-matrix',
    assets.length > 0 ? 'pass' : 'fail',
    assets.length > 0
      ? 'Remote assets list is non-empty.'
      : 'Remote assets list is empty.',
    {
      count: assets.length,
      matrix: assets.map(item => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename,
      })),
    },
  )

  const githubReleaseUrl = `https://api.github.com/repos/talex-touch/tuff/releases/tags/${encodeURIComponent(tag)}`
  let hasManifest = false
  let githubManifestStatus = null
  let githubReleasePayload = null
  let githubAssets = []
  let githubManifestPayload = null
  let githubManifestError = null
  let githubManifestDownloadUrlInfo = null
  try {
    const githubReleaseResp = await fetchWithTimeout(
      githubReleaseUrl,
      {},
      timeoutMs,
    )
    githubManifestStatus = githubReleaseResp.status
    if (githubReleaseResp.ok) {
      githubReleasePayload = await githubReleaseResp.json()
      githubAssets = Array.isArray(githubReleasePayload?.assets)
        ? githubReleasePayload.assets
        : []
      hasManifest = githubAssets.some(
        item => item?.name === 'tuff-release-manifest.json',
      )
      const manifestResult = await fetchGithubManifestPayload(githubAssets, {
        tag,
        timeoutMs,
      })
      hasManifest = manifestResult.hasManifest
      githubManifestPayload = manifestResult.manifestPayload
      githubManifestError = manifestResult.error
      githubManifestDownloadUrlInfo = manifestResult.downloadUrlInfo ?? null
    }
    else {
      githubManifestError = `github release fetch failed (${githubReleaseResp.status})`
    }
  }
  catch (error) {
    githubManifestStatus = 'error'
    githubManifestError = createHttpErrorPayload(error)
  }

  const githubMetadataStatus = stage === 'gate-e' ? 'fail' : 'warn'
  if (!githubReleasePayload) {
    pushCheck(
      'remote-github-release-metadata',
      githubMetadataStatus,
      'GitHub release metadata could not be fetched.',
      {
        githubReleaseUrl,
        githubReleaseStatus: githubManifestStatus,
        error: githubManifestError,
      },
    )
  }
  else {
    const githubMetadata = validateGithubReleaseMetadata(githubReleasePayload, {
      remoteRelease: release,
      tag,
    })
    pushCheck(
      'remote-github-release-metadata',
      githubMetadata.ok ? 'pass' : githubMetadataStatus,
      githubMetadata.ok
        ? 'GitHub release tag/draft/prerelease match Nexus release metadata.'
        : 'GitHub release tag/draft/prerelease do not match Nexus release metadata.',
      githubMetadata,
    )
  }

  const manifestMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  const manifestAssetOk = hasManifest && !githubManifestError
  pushCheck(
    'remote-manifest-asset',
    manifestAssetOk ? 'pass' : manifestMissingStatus,
    manifestAssetOk
      ? 'GitHub release manifest asset exists and is downloadable.'
      : hasManifest
        ? 'GitHub release manifest asset exists but is not downloadable or uploaded.'
        : 'GitHub release manifest asset is missing (`tuff-release-manifest.json`).',
    {
      hasManifest,
      githubReleaseUrl,
      githubManifestStatus,
      manifestDownloadUrlInfo: githubManifestDownloadUrlInfo,
      nexusAssetCount: assets.length,
      error: githubManifestError,
    },
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
        error: githubManifestError,
      },
    )
  }
  else if (githubManifestPayload) {
    const manifestRelease = githubManifestPayload.release ?? {}
    const rollbackHistoryUrl = `${baseUrl}/api/releases?channel=${encodeURIComponent(normalizeText(manifestRelease.channel))}&status=published&limit=100`
    try {
      const rollbackHistoryResponse = await fetchWithTimeout(
        rollbackHistoryUrl,
        {},
        timeoutMs,
      )
      if (!rollbackHistoryResponse.ok) {
        const blocked = rollbackHistoryResponse.status >= 500
        pushCheck(
          'remote-manifest-rollback',
          blocked ? 'blocked' : 'fail',
          blocked
            ? 'Rollback predecessor history is temporarily unavailable; release cannot claim an exact N-1.'
            : 'Rollback predecessor history request failed.',
          {
            url: rollbackHistoryUrl,
            httpStatus: rollbackHistoryResponse.status,
          },
        )
      }
      else {
        const rollbackHistoryPayload = await rollbackHistoryResponse.json()
        const expectedRollbackFromVersion = resolveExpectedRollbackFromVersion(
          Array.isArray(rollbackHistoryPayload?.releases)
            ? rollbackHistoryPayload.releases
            : [],
          {
            version: normalizeText(manifestRelease.version),
            channel: normalizeText(manifestRelease.channel),
          },
        )
        const rollbackIssues = !expectedRollbackFromVersion
          ? ['No same-channel N-1 release is available for rollback validation']
          : validateRollbackContract({
              version: manifestRelease.version,
              channel: manifestRelease.channel,
              rollbackFromVersion: manifestRelease.rollbackFromVersion,
              rollbackCompatible: manifestRelease.rollbackCompatible,
              expectedRollbackFromVersion,
            })
        pushCheck(
          'remote-manifest-rollback',
          rollbackIssues.length === 0 ? 'pass' : 'fail',
          rollbackIssues.length === 0
            ? 'Manifest rollback metadata matches the exact same-channel N-1 release.'
            : 'Manifest rollback metadata is missing, invalid, or not the exact same-channel N-1 release.',
          {
            url: rollbackHistoryUrl,
            version: normalizeText(manifestRelease.version) || null,
            channel: normalizeText(manifestRelease.channel) || null,
            rollbackFromVersion: manifestRelease.rollbackFromVersion ?? null,
            rollbackCompatible: manifestRelease.rollbackCompatible ?? null,
            expectedRollbackFromVersion,
            issues: rollbackIssues,
          },
        )
      }
    }
    catch (error) {
      pushCheck(
        'remote-manifest-rollback',
        'blocked',
        'Rollback predecessor history is unreachable; release cannot claim an exact N-1.',
        { url: rollbackHistoryUrl, error: createHttpErrorPayload(error) },
      )
    }

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
        manifestIssueDetails: comparison.issueDetails,
        manifestMatrix: comparison.manifestMatrix,
      },
    )

    const matrixOk
      = comparison.issues.length === 0 && comparison.mismatches.length === 0
    pushCheck(
      'remote-manifest-nexus-matrix',
      matrixOk ? 'pass' : manifestIntegrityStatus,
      matrixOk
        ? 'Nexus release asset matrix matches GitHub release manifest core artifacts.'
        : 'Nexus release asset matrix does not match GitHub release manifest core artifacts.',
      {
        mismatches: comparison.mismatches,
        manifestIssues: comparison.issues,
        manifestIssueDetails: comparison.issueDetails,
        nexusMatrix: comparison.nexusMatrix,
        manifestMatrix: comparison.manifestMatrix,
      },
    )

    const githubAssetComparison = compareGithubAssetsWithManifest({
      githubAssets,
      manifestPayload: githubManifestPayload,
      tag,
    })
    const githubAssetInventoryOk
      = githubAssetComparison.issues.length === 0
        && githubAssetComparison.missing.length === 0
    pushCheck(
      'remote-github-asset-inventory',
      githubAssetInventoryOk ? 'pass' : manifestIntegrityStatus,
      githubAssetInventoryOk
        ? 'GitHub release assets include every core artifact and signature sidecar declared by the release manifest.'
        : 'GitHub release assets are missing core artifacts or signature sidecars declared by the release manifest.',
      githubAssetComparison,
    )
  }

  const malformedIntegrity = assets.filter(
    item => !normalizeSha(item?.sha256) || !item?.signatureUrl,
  )
  const integrityMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-asset-integrity',
    malformedIntegrity.length === 0 ? 'pass' : integrityMissingStatus,
    malformedIntegrity.length === 0
      ? 'Remote assets all contain valid sha256 and signatureUrl.'
      : 'Remote assets missing valid sha256 or signatureUrl.',
    {
      missing: malformedIntegrity.map(item => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename,
        hasSha256: Boolean(item?.sha256),
        hasValidSha256: Boolean(normalizeSha(item?.sha256)),
        hasSignatureUrl: Boolean(item?.signatureUrl),
      })),
    },
  )

  const matrixKeys = new Map()
  for (const item of assets) {
    const platform = typeof item?.platform === 'string' ? item.platform : ''
    const arch = typeof item?.arch === 'string' ? item.arch : ''
    if (!platform || !arch)
      continue
    matrixKeys.set(`${platform}/${arch}`, { platform, arch })
  }

  const signatureResults = []
  const downloadResults = []
  const assetsByPair = new Map()
  for (const item of assets) {
    const platform = typeof item?.platform === 'string' ? item.platform : ''
    const arch = typeof item?.arch === 'string' ? item.arch : ''
    if (!platform || !arch)
      continue
    assetsByPair.set(`${platform}/${arch}`, item)
  }

  for (const pair of matrixKeys.values()) {
    const signatureUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/signature/${pair.platform}/${pair.arch}`
    const asset = assetsByPair.get(normalizePairKey(pair.platform, pair.arch))
    const downloadUrl = normalizeText(asset?.downloadUrl)
    const downloadUrlInfo = inspectSignedDownloadUrl(downloadUrl, baseUrl)
    const probeDownloadUrl = downloadUrlInfo.url || downloadUrl

    try {
      const signatureResp = await fetchWithTimeout(
        signatureUrl,
        { redirect: 'manual' },
        timeoutMs,
      )
      const signaturePayload
        = signatureResp.status === 200
          ? classifySignaturePayload(
              signatureResp,
              new Uint8Array(await signatureResp.arrayBuffer()),
            )
          : null
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: signatureResp.status,
        validPayload: Boolean(signaturePayload?.valid),
        ...(signaturePayload ?? {}),
      })
    }
    catch (error) {
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        error: createHttpErrorPayload(error),
      })
    }

    try {
      const downloadResp = await fetchWithTimeout(
        probeDownloadUrl,
        { redirect: 'manual' },
        timeoutMs,
      )
      const downloadResponseInfo
        = downloadResp.status === 200
          ? classifyDownloadResponse(
              downloadResp,
              new Uint8Array(await downloadResp.arrayBuffer()),
            )
          : classifyDownloadResponse(downloadResp)
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: downloadResp.status,
        ...downloadUrlInfo,
        ...downloadResponseInfo,
      })
    }
    catch (error) {
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        ...downloadUrlInfo,
        error: createHttpErrorPayload(error),
      })
    }
  }

  const allSignatureOk = signatureResults.every(
    item => item.status === 200 && item.validPayload,
  )
  const signatureStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-signature-endpoint',
    allSignatureOk ? 'pass' : signatureStatus,
    allSignatureOk
      ? 'Remote signature endpoint returns non-empty signature payloads for all matrix entries.'
      : 'Remote signature endpoint is not ready for all matrix entries.',
    { results: signatureResults },
  )

  const allDownloadOk = downloadResults.every(
    item =>
      [200, 302, 307, 308].includes(item.status)
      && item.sameOrigin
      && !item.hasHash
      && !item.hasDuplicateSignedQuery
      && !item.hasUnexpectedQuery
      && item.hasExp
      && item.hasValidExp
      && item.hasValidSig
      && item.validResponse,
  )
  pushCheck(
    'remote-download-endpoint',
    allDownloadOk ? 'pass' : 'fail',
    allDownloadOk
      ? 'Remote signed download URLs are available for all matrix entries.'
      : 'Remote signed download URLs have unavailable or unsigned entries.',
    { results: downloadResults },
  )

  const channel
    = typeof release.channel === 'string' && release.channel
      ? release.channel
      : 'RELEASE'
  const latestUrl = `${baseUrl}/api/releases/latest?channel=${encodeURIComponent(channel)}`
  const latestStatus = stage === 'gate-e' ? 'fail' : 'warn'
  try {
    const latestResp = await fetchWithTimeout(latestUrl, {}, timeoutMs)
    const latestPayload = await latestResp.json()
    const latestRelease = latestPayload?.release
    const latestTag = normalizeText(latestRelease?.tag)
    const latestVersion = normalizeText(latestRelease?.version)
    const latestChannel = normalizeText(latestRelease?.channel)
    const latestReleaseStatus = normalizeText(
      latestRelease?.status,
    ).toLowerCase()
    const expectedVersion = normalizeText(release.version)
    const expectedChannel = normalizeText(release.channel || channel)
    const latestIssues = []
    if (!latestResp.ok)
      latestIssues.push(`latest endpoint returned HTTP ${latestResp.status}`)
    if (latestTag !== tag) {
      latestIssues.push(
        `latest release.tag ${latestTag || '<missing>'} does not match ${tag}`,
      )
    }
    if (expectedVersion && latestVersion !== expectedVersion) {
      latestIssues.push(
        `latest release.version ${latestVersion || '<missing>'} does not match ${expectedVersion}`,
      )
    }
    if (expectedChannel && latestChannel !== expectedChannel) {
      latestIssues.push(
        `latest release.channel ${latestChannel || '<missing>'} does not match ${expectedChannel}`,
      )
    }
    if (latestReleaseStatus !== 'published')
      latestIssues.push('latest release.status must be published')
    const latestOk = latestIssues.length === 0
    pushCheck(
      'remote-latest',
      latestOk ? 'pass' : latestStatus,
      latestOk
        ? `Latest release for channel ${channel} matches ${tag}.`
        : `Latest release for channel ${channel} does not match ${tag}.`,
      {
        url: latestUrl,
        httpStatus: latestResp.status,
        latestTag,
        latestVersion,
        latestChannel,
        latestStatus: latestReleaseStatus || null,
        expectedTag: tag,
        expectedVersion,
        expectedChannel,
        issues: latestIssues,
      },
    )
  }
  catch (error) {
    pushCheck(
      'remote-latest',
      latestStatus,
      'Failed to query remote latest release.',
      {
        url: latestUrl,
        error: createHttpErrorPayload(error),
      },
    )
  }
}
