const CORE_PACKAGE_PATTERN = /\.(?:exe|dmg|zip|appimage|deb|snap)$/i

const PLATFORM_ORDER = new Map([
  ['win32', 0],
  ['darwin', 1],
  ['linux', 2],
])

export const REQUIRED_CORE_PAIRS = Object.freeze([
  'win32/x64',
  'darwin/arm64',
  'linux/x64',
])

export function corePairKey(platform, arch) {
  return `${platform}/${arch}`
}

export function normalizeSha256(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

export function isCorePackageFileName(fileName) {
  const lower = String(fileName ?? '').toLowerCase()
  if (!CORE_PACKAGE_PATTERN.test(lower))
    return false
  if (lower.endsWith('.sig') || lower.endsWith('.asc'))
    return false
  if (lower.includes('blockmap') || lower.includes('builder-debug'))
    return false
  if (lower.endsWith('.exe') && !lower.endsWith('-setup.exe'))
    return false
  return true
}

export function inferCoreArtifactIdentity(fileName) {
  if (!isCorePackageFileName(fileName))
    return null

  const lower = fileName.toLowerCase()
  let platform = null

  if (lower.includes('windows') || lower.endsWith('.exe')) {
    platform = 'win32'
  }
  else if (
    lower.includes('macos')
    || lower.includes('darwin')
    || lower.endsWith('.dmg')
    || lower.endsWith('.app.zip')
  ) {
    platform = 'darwin'
  }
  else if (
    lower.includes('ubuntu')
    || lower.includes('linux')
    || lower.endsWith('.appimage')
    || lower.endsWith('.deb')
    || lower.endsWith('.snap')
  ) {
    platform = 'linux'
  }

  if (!platform)
    return null

  let arch = 'x64'
  if (lower.includes('universal'))
    arch = 'universal'
  else if (lower.includes('arm64') || lower.includes('aarch64'))
    arch = 'arm64'
  else if (lower.includes('x64') || lower.includes('amd64'))
    arch = 'x64'

  return { platform, arch }
}

export function getCoreArtifactPreferenceScore(fileName, platform) {
  const lower = fileName.toLowerCase()
  let score = 0

  if (platform === 'win32') {
    if (lower.endsWith('-setup.exe'))
      score += 100
  }
  else if (platform === 'darwin') {
    if (lower.endsWith('.dmg'))
      score += 100
    else if (lower.endsWith('.app.zip'))
      score += 90
    else if (lower.endsWith('.zip'))
      score += 80
  }
  else if (platform === 'linux') {
    if (lower.endsWith('.appimage'))
      score += 100
    else if (lower.endsWith('.deb'))
      score += 90
    else if (lower.endsWith('.snap'))
      score += 80
  }

  if (lower.includes('tuff'))
    score += 5
  if (lower.includes('elevate') || lower.includes('esbuild'))
    score -= 1000

  return score
}

export function listCorePackageFileNames(fileNames) {
  return fileNames
    .filter(isCorePackageFileName)
    .filter(fileName => inferCoreArtifactIdentity(fileName) !== null)
    .sort((left, right) => left.localeCompare(right))
}

export function selectPreferredCoreArtifacts(fileNames) {
  const candidatesByPair = new Map()

  for (const name of listCorePackageFileNames(fileNames)) {
    const identity = inferCoreArtifactIdentity(name)
    if (!identity)
      continue
    const pair = corePairKey(identity.platform, identity.arch)
    const candidates = candidatesByPair.get(pair) ?? []
    candidates.push({
      name,
      ...identity,
      score: getCoreArtifactPreferenceScore(name, identity.platform),
    })
    candidatesByPair.set(pair, candidates)
  }

  const selected = []
  for (const candidates of candidatesByPair.values()) {
    candidates.sort((left, right) => {
      if (left.score !== right.score)
        return right.score - left.score
      return left.name.localeCompare(right.name)
    })
    selected.push(candidates[0])
  }

  selected.sort((left, right) => {
    const platformDelta
      = (PLATFORM_ORDER.get(left.platform) ?? Number.MAX_SAFE_INTEGER)
        - (PLATFORM_ORDER.get(right.platform) ?? Number.MAX_SAFE_INTEGER)
    if (platformDelta !== 0)
      return platformDelta
    if (left.arch !== right.arch)
      return left.arch.localeCompare(right.arch)
    return left.name.localeCompare(right.name)
  })

  return selected
}
