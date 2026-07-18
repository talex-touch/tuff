const RELEASE_CHANNELS = new Set(['RELEASE', 'BETA'])
const BETA_CHANNEL_LABELS = new Set(['ALPHA', 'BETA', 'SNAPSHOT'])
const RELEASE_CHANNEL_LABELS = new Set(['MASTER'])
const VERSION_PATTERN
  = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Z-]+(?:\.[0-9A-Z-]+)*))?$/i

export function normalizeManifestChannel(channel) {
  const normalized = String(channel ?? '')
    .trim()
    .toUpperCase()
  if (normalized === 'RELEASE' || RELEASE_CHANNEL_LABELS.has(normalized))
    return 'RELEASE'
  if (normalized === 'BETA' || BETA_CHANNEL_LABELS.has(normalized))
    return 'BETA'
  return null
}

export function inferManifestChannel(version) {
  const match = String(version ?? '')
    .trim()
    .match(VERSION_PATTERN)
  if (!match)
    return null

  const label = match[4]?.split('.')[0]?.toUpperCase()
  if (!label || RELEASE_CHANNEL_LABELS.has(label))
    return 'RELEASE'
  return BETA_CHANNEL_LABELS.has(label) ? 'BETA' : null
}

export function compareRollbackVersions(leftVersion, rightVersion) {
  const parse = (value) => {
    const match = String(value ?? '')
      .trim()
      .match(VERSION_PATTERN)
    if (!match)
      return null
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4]?.split('.') ?? [],
    }
  }

  const left = parse(leftVersion)
  const right = parse(rightVersion)
  if (!left || !right)
    return null

  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index])
      return left.core[index] < right.core[index] ? -1 : 1
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length)
      return 0
    return left.prerelease.length === 0 ? 1 : -1
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    if (leftIdentifier === undefined)
      return -1
    if (rightIdentifier === undefined)
      return 1
    if (leftIdentifier === rightIdentifier)
      continue

    const leftNumeric = /^(?:0|[1-9]\d*)$/.test(leftIdentifier)
    const rightNumeric = /^(?:0|[1-9]\d*)$/.test(rightIdentifier)
    if (leftNumeric && rightNumeric)
      return Number(leftIdentifier) < Number(rightIdentifier) ? -1 : 1
    if (leftNumeric !== rightNumeric)
      return leftNumeric ? -1 : 1
    return leftIdentifier < rightIdentifier ? -1 : 1
  }

  return 0
}

export function isRollbackVersionOlder(currentVersion, rollbackFromVersion) {
  return compareRollbackVersions(rollbackFromVersion, currentVersion) === -1
}

export function validateRollbackContract({
  version,
  channel,
  rollbackFromVersion,
  rollbackCompatible,
  expectedRollbackFromVersion,
}) {
  const issues = []
  const normalizedChannel = String(channel ?? '')
    .trim()
    .toUpperCase()
  if (!RELEASE_CHANNELS.has(normalizedChannel))
    issues.push('release.channel must be RELEASE|BETA')

  const versionChannel = inferManifestChannel(version)
  if (!versionChannel)
    issues.push('release.version must be a supported semantic version')
  else if (versionChannel !== normalizedChannel)
    issues.push('release.channel must match release.version suffix')

  if (typeof rollbackFromVersion !== 'string' || !rollbackFromVersion.trim()) {
    issues.push('release.rollbackFromVersion is required')
  }
  else {
    if (/^v/i.test(rollbackFromVersion))
      issues.push('release.rollbackFromVersion must omit the v prefix')

    const rollbackChannel = inferManifestChannel(rollbackFromVersion)
    if (!rollbackChannel) {
      issues.push(
        'release.rollbackFromVersion must be a supported semantic version',
      )
    }
    else if (rollbackChannel !== versionChannel) {
      issues.push('release.rollbackFromVersion must use the same channel')
    }

    if (!isRollbackVersionOlder(version, rollbackFromVersion)) {
      issues.push(
        'release.rollbackFromVersion must be older than release.version',
      )
    }

    if (expectedRollbackFromVersion !== undefined) {
      if (
        typeof expectedRollbackFromVersion !== 'string'
        || !expectedRollbackFromVersion
      ) {
        issues.push('expected rollback version must be a non-empty string')
      }
      else if (rollbackFromVersion !== expectedRollbackFromVersion) {
        issues.push(
          'release.rollbackFromVersion must match the expected same-channel N-1 version',
        )
      }
    }
  }

  if (typeof rollbackCompatible !== 'boolean')
    issues.push('release.rollbackCompatible must be boolean')

  return issues
}

export function parseRollbackCompatible(value) {
  if (value === true || value === 'true')
    return true
  if (value === false || value === 'false')
    return false
  throw new Error('rollbackCompatible must be true or false')
}
