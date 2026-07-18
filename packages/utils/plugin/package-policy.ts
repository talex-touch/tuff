import {
  CATEGORY_REQUIRED_MIN_VERSION,
  checkSdkCompatibility,
  resolveSdkApiVersion,
} from './sdk-version'
import {
  normalizePermissionId,
  permissionRegistry,
} from '../permission'

export const PLUGIN_PACKAGE_POLICY_VERSION = '1'
export const PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES = 30 * 1024 * 1024
export const PLUGIN_PACKAGE_MAX_ENTRY_COUNT = 4_096
export const PLUGIN_PACKAGE_MAX_ENTRY_BYTES = 64 * 1024 * 1024
export const PLUGIN_PACKAGE_MAX_EXPANDED_BYTES = 128 * 1024 * 1024

export type PluginPackagePolicyProfile
  = | 'source-manifest'
    | 'staged-package'
    | 'registry-admission'

export type PluginPackageEntryType
  = | 'file'
    | 'directory'
    | 'symlink'
    | 'hardlink'
    | 'device'
    | 'fifo'
    | 'other'

export interface PluginPackageEntry {
  path: string
  type: PluginPackageEntryType
  size: number
}

export interface PluginPackageExpectedIdentity {
  pluginId?: string
  pluginName?: string
  version?: string
}

export interface PluginPackagePolicyInput {
  profile: PluginPackagePolicyProfile
  manifest: unknown
  entries?: readonly PluginPackageEntry[]
  archiveSize?: number
  expected?: PluginPackageExpectedIdentity
}

export type PluginPackageViolationCode
  = | 'PLUGIN_PACKAGE_MANIFEST_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_ID_REQUIRED'
    | 'PLUGIN_PACKAGE_MANIFEST_ID_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_NAME_REQUIRED'
    | 'PLUGIN_PACKAGE_MANIFEST_NAME_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_VERSION_REQUIRED'
    | 'PLUGIN_PACKAGE_MANIFEST_VERSION_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE'
    | 'PLUGIN_PACKAGE_MANIFEST_CATEGORY_REQUIRED'
    | 'PLUGIN_PACKAGE_MANIFEST_CATEGORY_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID'
    | 'PLUGIN_PACKAGE_MANIFEST_PERMISSION_UNKNOWN'
    | 'PLUGIN_PACKAGE_DEV_MODE_ENABLED'
    | 'PLUGIN_PACKAGE_ENTRIES_REQUIRED'
    | 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID'
    | 'PLUGIN_PACKAGE_ENTRY_DUPLICATE'
    | 'PLUGIN_PACKAGE_ENTRY_CASE_COLLISION'
    | 'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED'
    | 'PLUGIN_PACKAGE_ENTRY_SIZE_INVALID'
    | 'PLUGIN_PACKAGE_ENTRY_TOO_LARGE'
    | 'PLUGIN_PACKAGE_ENTRY_COUNT_EXCEEDED'
    | 'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED'
    | 'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID'
    | 'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED'
    | 'PLUGIN_PACKAGE_MANIFEST_ENTRY_MISSING'
    | 'PLUGIN_PACKAGE_MANIFEST_ENTRY_DUPLICATE'
    | 'PLUGIN_PACKAGE_FILE_MAP_REQUIRED'
    | 'PLUGIN_PACKAGE_FILE_MAP_INVALID'
    | 'PLUGIN_PACKAGE_FILE_MAP_MISMATCH'
    | 'PLUGIN_PACKAGE_SIGNATURE_REQUIRED'
    | 'PLUGIN_PACKAGE_SIGNATURE_INVALID'
    | 'PLUGIN_PACKAGE_EXPECTED_ID_MISMATCH'
    | 'PLUGIN_PACKAGE_EXPECTED_NAME_MISMATCH'
    | 'PLUGIN_PACKAGE_EXPECTED_VERSION_MISMATCH'

export interface PluginPackageViolation {
  code: PluginPackageViolationCode
  location: string
  meta?: Readonly<Record<string, string | number | boolean>>
}

export interface NormalizedPluginIdentity {
  id: string
  name: string
  version: string
  sdkapi: number
  category?: string
  permissions: readonly string[]
}

export interface NormalizedPluginPackageInventory {
  archiveBytes?: number
  entryCount: number
  expandedBytes: number
  paths: readonly string[]
}

export type PluginPackagePolicyResult
  = | {
    ok: true
    policyVersion: typeof PLUGIN_PACKAGE_POLICY_VERSION
    identity: NormalizedPluginIdentity
    inventory?: NormalizedPluginPackageInventory
  }
  | {
    ok: false
    policyVersion: typeof PLUGIN_PACKAGE_POLICY_VERSION
    violations: readonly PluginPackageViolation[]
  }

type ManifestRecord = Record<string, unknown>

interface NormalizedEntry extends PluginPackageEntry {
  normalizedPath?: string
  originalIndex: number
}

const REVERSE_DOMAIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i
const SHA256_FILE_HASH_RE = /^sha256-[a-f0-9]{64}$/i

function isRecord(value: unknown): value is ManifestRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(record: ManifestRecord, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function addViolation(
  violations: PluginPackageViolation[],
  code: PluginPackageViolationCode,
  location: string,
  meta?: Record<string, string | number | boolean>,
): void {
  violations.push({ code, location, ...(meta ? { meta } : {}) })
}

function collectManifestPermissions(
  manifest: ManifestRecord,
  violations: PluginPackageViolation[],
): string[] {
  const rawPermissions = manifest.permissions
  if (rawPermissions === undefined) return []
  if (!isRecord(rawPermissions)) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID',
      'manifest.permissions',
    )
    return []
  }

  const unexpectedFields = Object.keys(rawPermissions)
    .filter(field => field !== 'required' && field !== 'optional')
    .sort()
  if (unexpectedFields.length > 0) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID',
      'manifest.permissions',
      { fields: unexpectedFields.slice(0, 8).join(',') },
    )
  }

  const values: string[] = []
  for (const field of ['required', 'optional'] as const) {
    const raw = rawPermissions[field]
    if (raw === undefined) continue
    if (!Array.isArray(raw) || raw.some(value => typeof value !== 'string' || !value.trim())) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID',
        `manifest.permissions.${field}`,
      )
      continue
    }
    values.push(...raw.map(value => (value as string).trim()))
  }

  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of values) {
    const permissionId = normalizePermissionId(raw)
    if (seen.has(permissionId)) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_MANIFEST_PERMISSIONS_INVALID',
        'manifest.permissions',
        { permissionId },
      )
      continue
    }
    seen.add(permissionId)
    normalized.push(permissionId)
    if (!permissionRegistry.has(permissionId)) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_MANIFEST_PERMISSION_UNKNOWN',
        'manifest.permissions',
        { permissionId },
      )
    }
  }
  return normalized.sort()
}

function normalizeEntryPath(entry: PluginPackageEntry): string | undefined {
  const rawPath = entry.path
  if (
    !rawPath
    || rawPath.includes('\0')
    || rawPath.includes('\\')
    || rawPath.startsWith('/')
    || rawPath.startsWith('//')
    || /^[a-z]:/i.test(rawPath)
    || rawPath.startsWith('./')
  ) {
    return undefined
  }

  const candidate = entry.type === 'directory' && rawPath.endsWith('/')
    ? rawPath.slice(0, -1)
    : rawPath
  const segments = candidate.split('/')
  if (
    !candidate
    || segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    return undefined
  }
  return candidate
}

function normalizeEntries(
  entries: readonly PluginPackageEntry[],
  violations: PluginPackageViolation[],
): NormalizedEntry[] {
  const normalized = entries.map((entry, originalIndex): NormalizedEntry => ({
    ...entry,
    originalIndex,
    normalizedPath: normalizeEntryPath(entry),
  }))
  normalized.sort((left, right) => {
    const pathOrder = (left.normalizedPath ?? left.path).localeCompare(
      right.normalizedPath ?? right.path,
      'en',
    )
    return pathOrder || left.originalIndex - right.originalIndex
  })

  const exactPaths = new Set<string>()
  const foldedPaths = new Map<string, string>()
  for (const entry of normalized) {
    const location = `entries[${entry.originalIndex}]`
    if (!entry.normalizedPath) {
      addViolation(violations, 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID', `${location}.path`)
      continue
    }

    if (exactPaths.has(entry.normalizedPath)) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_ENTRY_DUPLICATE',
        `${location}.path`,
        { path: entry.normalizedPath },
      )
    }
    exactPaths.add(entry.normalizedPath)

    const foldedPath = entry.normalizedPath.toLowerCase()
    const firstPath = foldedPaths.get(foldedPath)
    if (firstPath && firstPath !== entry.normalizedPath) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_ENTRY_CASE_COLLISION',
        `${location}.path`,
        { path: entry.normalizedPath, conflictsWith: firstPath },
      )
    }
    else if (!firstPath) {
      foldedPaths.set(foldedPath, entry.normalizedPath)
    }

    if (entry.type !== 'file' && entry.type !== 'directory') {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED',
        `${location}.type`,
        { path: entry.normalizedPath, type: entry.type },
      )
    }

    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_ENTRY_SIZE_INVALID',
        `${location}.size`,
        { path: entry.normalizedPath },
      )
    }
    else if (entry.type === 'file' && entry.size > PLUGIN_PACKAGE_MAX_ENTRY_BYTES) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_ENTRY_TOO_LARGE',
        `${location}.size`,
        { path: entry.normalizedPath, limit: PLUGIN_PACKAGE_MAX_ENTRY_BYTES },
      )
    }
  }
  return normalized
}

function validateFileMap(
  manifest: ManifestRecord,
  entries: readonly NormalizedEntry[],
  violations: PluginPackageViolation[],
): void {
  const rawFileMap = manifest._files
  if (!isRecord(rawFileMap)) {
    addViolation(violations, 'PLUGIN_PACKAGE_FILE_MAP_REQUIRED', 'manifest._files')
    return
  }

  const expectedPaths: string[] = []
  const foldedPaths = new Set<string>()
  for (const [rawPath, rawHash] of Object.entries(rawFileMap).sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    const normalizedPath = normalizeEntryPath({ path: rawPath, type: 'file', size: 0 })
    if (!normalizedPath || !SHA256_FILE_HASH_RE.test(typeof rawHash === 'string' ? rawHash : '')) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_FILE_MAP_INVALID',
        `manifest._files.${rawPath}`,
      )
      continue
    }
    const foldedPath = normalizedPath.toLowerCase()
    if (foldedPaths.has(foldedPath)) {
      addViolation(
        violations,
        'PLUGIN_PACKAGE_FILE_MAP_INVALID',
        `manifest._files.${rawPath}`,
        { path: normalizedPath },
      )
      continue
    }
    foldedPaths.add(foldedPath)
    expectedPaths.push(normalizedPath)
  }

  const actualPaths = entries
    .filter(entry =>
      entry.type === 'file'
      && entry.normalizedPath
      && entry.normalizedPath !== 'manifest.json'
      && entry.normalizedPath !== 'key.talex')
    .map(entry => entry.normalizedPath as string)
    .sort((left, right) => left.localeCompare(right, 'en'))

  expectedPaths.sort((left, right) => left.localeCompare(right, 'en'))
  if (
    expectedPaths.length !== actualPaths.length
    || expectedPaths.some((path, index) => path !== actualPaths[index])
  ) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_FILE_MAP_MISMATCH',
      'manifest._files',
      { expectedCount: expectedPaths.length, actualCount: actualPaths.length },
    )
  }
}

function validatePackagedDevMode(
  manifest: ManifestRecord,
  violations: PluginPackageViolation[],
): void {
  const dev = manifest.dev
  if (dev === undefined) return
  if (!isRecord(dev)) {
    addViolation(violations, 'PLUGIN_PACKAGE_DEV_MODE_ENABLED', 'manifest.dev')
    return
  }
  const address = typeof dev.address === 'string' ? dev.address.trim() : ''
  if (dev.enable !== false || dev.source !== false || address) {
    addViolation(violations, 'PLUGIN_PACKAGE_DEV_MODE_ENABLED', 'manifest.dev')
  }
}

export function validatePluginPackagePolicy(
  input: PluginPackagePolicyInput,
): PluginPackagePolicyResult {
  const violations: PluginPackageViolation[] = []
  if (!isRecord(input.manifest)) {
    addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_INVALID', 'manifest')
    return {
      ok: false,
      policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
      violations,
    }
  }

  const manifest = input.manifest
  const id = readTrimmedString(manifest, 'id')
  const name = readTrimmedString(manifest, 'name')
  const version = readTrimmedString(manifest, 'version')
  const category = readTrimmedString(manifest, 'category')

  if (!id) addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_ID_REQUIRED', 'manifest.id')
  else if (!REVERSE_DOMAIN_ID_RE.test(id)) {
    addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_ID_INVALID', 'manifest.id')
  }

  if (!name) addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_NAME_REQUIRED', 'manifest.name')
  else if (!SLUG_RE.test(name)) {
    addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_NAME_INVALID', 'manifest.name')
  }

  if (!version) {
    addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_VERSION_REQUIRED', 'manifest.version')
  }
  else if (!SEMVER_RE.test(version)) {
    addViolation(violations, 'PLUGIN_PACKAGE_MANIFEST_VERSION_INVALID', 'manifest.version')
  }

  const sdkCompatibility = checkSdkCompatibility(manifest.sdkapi, name || 'plugin')
  const sdkapi = resolveSdkApiVersion(manifest.sdkapi)
  if (!sdkCompatibility.compatible || sdkapi === undefined) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_MANIFEST_SDKAPI_INCOMPATIBLE',
      'manifest.sdkapi',
    )
  }
  if (sdkapi !== undefined && sdkapi >= CATEGORY_REQUIRED_MIN_VERSION && !category) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_MANIFEST_CATEGORY_REQUIRED',
      'manifest.category',
    )
  }
  else if (category && !SLUG_RE.test(category)) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_MANIFEST_CATEGORY_INVALID',
      'manifest.category',
    )
  }

  const permissions = collectManifestPermissions(manifest, violations)

  if (input.expected?.pluginId && input.expected.pluginId !== id) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_EXPECTED_ID_MISMATCH',
      'manifest.id',
      { expected: input.expected.pluginId, actual: id },
    )
  }
  if (input.expected?.pluginName && input.expected.pluginName !== name) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_EXPECTED_NAME_MISMATCH',
      'manifest.name',
      { expected: input.expected.pluginName, actual: name },
    )
  }
  if (input.expected?.version && input.expected.version !== version) {
    addViolation(
      violations,
      'PLUGIN_PACKAGE_EXPECTED_VERSION_MISMATCH',
      'manifest.version',
      { expected: input.expected.version, actual: version },
    )
  }

  let inventory: NormalizedPluginPackageInventory | undefined
  if (input.profile !== 'source-manifest') {
    validatePackagedDevMode(manifest, violations)

    if (!input.entries) {
      addViolation(violations, 'PLUGIN_PACKAGE_ENTRIES_REQUIRED', 'entries')
    }
    else {
      const entries = normalizeEntries(input.entries, violations)
      const regularFiles = entries.filter(entry => entry.type === 'file')
      if (entries.length > PLUGIN_PACKAGE_MAX_ENTRY_COUNT) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_ENTRY_COUNT_EXCEEDED',
          'entries',
          { count: entries.length, limit: PLUGIN_PACKAGE_MAX_ENTRY_COUNT },
        )
      }

      let expandedBytes = 0
      for (const entry of regularFiles) {
        if (Number.isSafeInteger(entry.size) && entry.size >= 0) {
          expandedBytes += entry.size
        }
      }
      if (!Number.isSafeInteger(expandedBytes) || expandedBytes > PLUGIN_PACKAGE_MAX_EXPANDED_BYTES) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED',
          'entries',
          { limit: PLUGIN_PACKAGE_MAX_EXPANDED_BYTES },
        )
      }

      const manifestEntries = regularFiles.filter(entry => entry.normalizedPath === 'manifest.json')
      if (manifestEntries.length === 0) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_MANIFEST_ENTRY_MISSING',
          'entries',
        )
      }
      else if (manifestEntries.length > 1) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_MANIFEST_ENTRY_DUPLICATE',
          'entries',
          { count: manifestEntries.length },
        )
      }

      validateFileMap(manifest, entries, violations)
      inventory = {
        ...(input.archiveSize === undefined ? {} : { archiveBytes: input.archiveSize }),
        entryCount: entries.length,
        expandedBytes,
        paths: entries
          .flatMap(entry => entry.normalizedPath ? [entry.normalizedPath] : [])
          .sort((left, right) => left.localeCompare(right, 'en')),
      }
    }

    const signature = manifest._signature
    if (signature === undefined || signature === null || signature === '') {
      addViolation(violations, 'PLUGIN_PACKAGE_SIGNATURE_REQUIRED', 'manifest._signature')
    }
    else if (typeof signature !== 'string' || !signature.trim()) {
      addViolation(violations, 'PLUGIN_PACKAGE_SIGNATURE_INVALID', 'manifest._signature')
    }

    if (input.archiveSize !== undefined) {
      if (!Number.isSafeInteger(input.archiveSize) || input.archiveSize < 0) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_ARCHIVE_SIZE_INVALID',
          'archiveSize',
        )
      }
      else if (input.archiveSize > PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES) {
        addViolation(
          violations,
          'PLUGIN_PACKAGE_ARCHIVE_SIZE_EXCEEDED',
          'archiveSize',
          { size: input.archiveSize, limit: PLUGIN_PACKAGE_MAX_ARCHIVE_BYTES },
        )
      }
    }
  }

  if (violations.length > 0 || sdkapi === undefined) {
    return {
      ok: false,
      policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
      violations,
    }
  }

  return {
    ok: true,
    policyVersion: PLUGIN_PACKAGE_POLICY_VERSION,
    identity: {
      id,
      name,
      version,
      sdkapi,
      ...(category ? { category } : {}),
      permissions,
    },
    ...(inventory ? { inventory } : {}),
  }
}

export function formatPluginPackageViolation(
  violation: PluginPackageViolation,
): string {
  return `${violation.code} at ${violation.location}`
}
