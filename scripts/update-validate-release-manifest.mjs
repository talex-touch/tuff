import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_MANIFEST =
  'docs/plan-prd/03-features/download-update/fixtures/tuff-release-manifest.sample.json'

const args = process.argv.slice(2)
const getArgValue = (flag) => {
  const index = args.indexOf(flag)
  if (index === -1) return null
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
} catch (error) {
  console.error('[update-manifest] Failed to parse JSON:', error)
  process.exit(1)
}

const errors = []
const requireField = (condition, message) => {
  if (!condition) errors.push(message)
}

const release = payload?.release
const version = release?.version
const schemaVersion = payload?.schemaVersion
const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : []

requireField(schemaVersion === 1, 'schemaVersion must be 1')
requireField(typeof version === 'string' && version.length > 0, 'release.version is required')
requireField(
  typeof release?.channel === 'string' && release.channel.length > 0,
  'release.channel is required'
)
requireField(
  typeof release?.tag === 'string' && release.tag.length > 0,
  'release.tag is required'
)
requireField(artifacts.length > 0, 'artifacts must be a non-empty array')

const sha256Pattern = /^[a-f0-9]{64}$/i

for (const [index, artifact] of artifacts.entries()) {
  const label = `artifacts[${index}]`
  const component = artifact?.component
  const name = artifact?.name
  const sha256 = artifact?.sha256

  requireField(
    component === 'core' || component === 'renderer' || component === 'extensions',
    `${label}.component must be core|renderer|extensions`
  )
  requireField(typeof name === 'string' && name.length > 0, `${label}.name is required`)
  requireField(sha256Pattern.test(String(sha256 ?? '')), `${label}.sha256 must be 64 hex chars`)

  if (component === 'core') {
    const platform = artifact?.platform
    const arch = artifact?.arch
    requireField(platform === 'win32' || platform === 'darwin' || platform === 'linux', `${label}.platform is required`)
    requireField(arch === 'x64' || arch === 'arm64', `${label}.arch is required`)

    if (typeof name === 'string' && typeof version === 'string') {
      const corePattern = new RegExp(
        `^tuff-core-${version}-(win32|darwin|linux)-(x64|arm64)(-setup)?\\.(exe|dmg|AppImage|deb|zip)$`,
        'i'
      )
      requireField(corePattern.test(name), `${label}.name does not match core naming spec`)
    }
  }

  if (component === 'renderer') {
    requireField(
      typeof artifact?.coreRange === 'string' && artifact.coreRange.length > 0,
      `${label}.coreRange is required for renderer`
    )
    if (typeof name === 'string' && typeof version === 'string') {
      const rendererPattern = new RegExp(`^tuff-renderer-${version}\\.zip$`, 'i')
      requireField(
        rendererPattern.test(name),
        `${label}.name does not match renderer naming spec`
      )
    }
  }

  if (component === 'extensions') {
    requireField(
      typeof artifact?.coreRange === 'string' && artifact.coreRange.length > 0,
      `${label}.coreRange is required for extensions`
    )
    if (typeof name === 'string' && typeof version === 'string') {
      const extensionsPattern = new RegExp(`^tuff-extensions-${version}\\.zip$`, 'i')
      requireField(
        extensionsPattern.test(name),
        `${label}.name does not match extensions naming spec`
      )
    }
  }
}

if (errors.length > 0) {
  console.error('[update-manifest] Validation failed:')
  errors.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[update-manifest] Validation passed:', {
  manifest: resolvedPath,
  artifacts: artifacts.length
})
