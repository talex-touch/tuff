import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { inferCoreArtifactIdentity } from './lib/release-artifacts.mjs'

const DEFAULT_MANIFEST
  = 'docs/plan-prd/03-features/download-update/fixtures/tuff-release-manifest.sample.json'

const args = process.argv.slice(2)
function getArgValue(flag) {
  const index = args.indexOf(flag)
  if (index === -1)
    return null
  return args[index + 1] ?? null
}

const manifestPath = getArgValue('--manifest') ?? DEFAULT_MANIFEST
const resolvedPath = path.resolve(process.cwd(), manifestPath)

if (!fs.existsSync(resolvedPath)) {
  console.error(`[update-manifest] File not found: ${resolvedPath}`)
  process.exit(1)
}

let payload
try {
  payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
}
catch (error) {
  console.error('[update-manifest] Failed to parse JSON:', error)
  process.exit(1)
}

const errors = []
function requireField(condition, message) {
  if (!condition)
    errors.push(message)
}

const releaseChannels = new Set(['RELEASE', 'BETA', 'SNAPSHOT'])
const corePlatforms = new Set(['win32', 'darwin', 'linux'])
const coreArchs = new Set(['x64', 'arm64', 'universal'])
const sha256Pattern = /^[a-f0-9]{64}$/i

function inferReleaseChannel(versionText) {
  const lower = String(versionText || '').toLowerCase()
  if (lower.includes('snapshot'))
    return 'SNAPSHOT'
  if (lower.includes('beta'))
    return 'BETA'
  return 'RELEASE'
}

function isMetaAssetName(filename) {
  const lower = String(filename || '').toLowerCase()
  return lower === 'tuff-release-manifest.json'
    || /(?:^|-)latest[^/]*\.ya?ml$/i.test(lower)
    || /(?:^|-)builder-debug\.ya?ml$/i.test(lower)
    || /\.ya?ml$/i.test(lower)
    || /\.(?:sig|asc|sha256)$/i.test(lower)
}

const release = payload?.release
const version = release?.version
const schemaVersion = payload?.schemaVersion
const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : []

requireField(schemaVersion === 1, 'schemaVersion must be 1')
requireField(typeof version === 'string' && version.length > 0, 'release.version is required')
requireField(
  typeof release?.channel === 'string' && release.channel.length > 0,
  'release.channel is required',
)
requireField(
  typeof release?.tag === 'string' && release.tag.length > 0,
  'release.tag is required',
)
if (typeof version === 'string' && typeof release?.tag === 'string') {
  requireField(release.tag === `v${version}`, 'release.tag must match release.version')
}
if (typeof version === 'string' && typeof release?.channel === 'string') {
  requireField(releaseChannels.has(release.channel), 'release.channel must be RELEASE|BETA|SNAPSHOT')
  requireField(
    release.channel === inferReleaseChannel(version),
    'release.channel must match release.version suffix',
  )
}
requireField(artifacts.length > 0, 'artifacts must be a non-empty array')

const artifactNames = new Set()
const allArtifactNames = new Set(
  artifacts
    .map(artifact => artifact?.name)
    .filter(name => typeof name === 'string' && name.length > 0),
)
const artifactSha256s = new Set()
const coreMatrixKeys = new Set()
let coreArtifactCount = 0

for (const [index, artifact] of artifacts.entries()) {
  const label = `artifacts[${index}]`
  const component = artifact?.component
  const name = artifact?.name
  const sha256 = artifact?.sha256

  requireField(
    component === 'core' || component === 'renderer' || component === 'extensions',
    `${label}.component must be core|renderer|extensions`,
  )
  requireField(typeof name === 'string' && name.length > 0, `${label}.name is required`)
  requireField(sha256Pattern.test(String(sha256 ?? '')), `${label}.sha256 must be 64 hex chars`)
  if (sha256Pattern.test(String(sha256 ?? ''))) {
    const normalizedSha256 = String(sha256).toLowerCase()
    requireField(!artifactSha256s.has(normalizedSha256), `${label}.sha256 must be unique`)
    artifactSha256s.add(normalizedSha256)
  }
  if (typeof name === 'string' && name.length > 0) {
    requireField(!artifactNames.has(name), `${label}.name must be unique`)
    artifactNames.add(name)
    requireField(!isMetaAssetName(name), `${label}.name must be a downloadable artifact, not release metadata`)
  }

  if (component === 'core') {
    coreArtifactCount += 1
    const platform = artifact?.platform
    const arch = artifact?.arch
    const signature = artifact?.signature
    requireField(corePlatforms.has(platform), `${label}.platform is required`)
    requireField(coreArchs.has(arch), `${label}.arch is required`)
    requireField(
      typeof signature === 'string' && signature.length > 0,
      `${label}.signature is required for core artifacts`,
    )
    if (corePlatforms.has(platform) && coreArchs.has(arch)) {
      const coreMatrixKey = `${platform}/${arch}`
      requireField(
        !coreMatrixKeys.has(coreMatrixKey),
        `${label}.platform/arch must be unique for core artifacts`,
      )
      coreMatrixKeys.add(coreMatrixKey)
    }

    if (typeof name === 'string' && name.length > 0) {
      const inferredIdentity = inferCoreArtifactIdentity(name)
      requireField(Boolean(inferredIdentity), `${label}.name must include a recognizable core platform`)
      requireField(
        !inferredIdentity || platform === inferredIdentity.platform,
        `${label}.platform does not match artifact name`,
      )
      requireField(
        !inferredIdentity || arch === inferredIdentity.arch,
        `${label}.arch does not match artifact name`,
      )
      if (typeof signature === 'string' && signature.length > 0) {
        requireField(
          signature === `${name}.sig` || signature === `${name}.asc`,
          `${label}.signature must point to the artifact .sig/.asc sidecar`,
        )
        requireField(
          !allArtifactNames.has(signature),
          `${label}.signature sidecar must not be listed as a downloadable artifact`,
        )
      }
    }

    if (typeof name === 'string' && typeof version === 'string') {
      const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const canonicalCorePattern = new RegExp(
        `^tuff-core-${escapedVersion}-(win32|darwin|linux)-(x64|arm64|universal)(-setup)?\\.(exe|dmg|AppImage|deb|zip)$`,
        'i',
      )
      const workflowVersion = escapedVersion.replace(/-beta\\\./i, '-SNAPSHOT\\.')
      const releaseWorkflowCorePattern = new RegExp(
        `^(windows-(?:latest|2022)|macos-latest|ubuntu-latest)-(beta|snapshot|release)-tuff-(?:${escapedVersion}|${workflowVersion})(?:-(?:x64|arm64|universal))?(?:\\.app)?(?:-setup)?\\.(exe|dmg|AppImage|deb|snap|zip)$`,
        'i',
      )
      requireField(
        canonicalCorePattern.test(name) || releaseWorkflowCorePattern.test(name),
        `${label}.name does not match core naming spec`,
      )
    }
  }

  if (component === 'renderer') {
    requireField(artifact?.platform == null && artifact?.arch == null, `${label}.platform/arch must be omitted for renderer`)
    requireField(
      typeof artifact?.coreRange === 'string' && artifact.coreRange.length > 0,
      `${label}.coreRange is required for renderer`,
    )
    if (typeof name === 'string' && typeof version === 'string') {
      const rendererPattern = new RegExp(`^tuff-renderer-${version}\\.zip$`, 'i')
      requireField(
        rendererPattern.test(name),
        `${label}.name does not match renderer naming spec`,
      )
    }
  }

  if (component === 'extensions') {
    requireField(artifact?.platform == null && artifact?.arch == null, `${label}.platform/arch must be omitted for extensions`)
    requireField(
      typeof artifact?.coreRange === 'string' && artifact.coreRange.length > 0,
      `${label}.coreRange is required for extensions`,
    )
    if (typeof name === 'string' && typeof version === 'string') {
      const extensionsPattern = new RegExp(`^tuff-extensions-${version}\\.zip$`, 'i')
      requireField(
        extensionsPattern.test(name),
        `${label}.name does not match extensions naming spec`,
      )
    }
  }
}

requireField(coreArtifactCount > 0, 'artifacts must include at least one core artifact')

if (errors.length > 0) {
  console.error('[update-manifest] Validation failed:')
  errors.forEach(message => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[update-manifest] Validation passed:', {
  manifest: resolvedPath,
  artifacts: artifacts.length,
})
