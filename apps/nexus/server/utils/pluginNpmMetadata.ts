import {
  DEFAULT_NPM_REGISTRY_URL,
  formatNpmPluginSource,
  isAllowedNpmRegistryUrl,
  isOfficialNpmPluginPackageName,
  isValidNpmPackageName,
  isValidNpmVersionSpec,
  normalizeNpmRegistryUrl,
} from '@talex-touch/utils/plugin'
import { createError } from 'h3'

const NPM_INTEGRITY_SRI_RE = /^(?:sha256-[A-Za-z0-9+/]{43}=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{86}==)$/
const NPM_TARBALL_SHA256_RE = /^[a-f0-9]{64}$/i

export interface PluginNpmCrossLinkFields {
  npmPackageName?: string | null
  npmRegistry?: string | null
}

export interface PluginVersionNpmCrossLinkFields extends PluginNpmCrossLinkFields {
  npmIntegrity?: string | null
  npmTarballSha256?: string | null
}

export interface NormalizedPluginNpmMetadata {
  npmPackageName: string | null
  npmRegistry: string | null
}

export interface NormalizedPluginVersionNpmMetadata extends NormalizedPluginNpmMetadata {
  npmIntegrity: string | null
  npmTarballSha256: string | null
}

export interface StorePluginNpmMetadata {
  packageName: string
  registry: string
  installSource: string
  officialScope: boolean
}

export interface StorePluginVersionNpmMetadata extends StorePluginNpmMetadata {
  version: string
  integrity: string | null
  tarballSha256: string | null
}

/**
 * Normalize an optional stored text column without discarding an invalid non-empty value.
 * Preserving raw non-empty values lets read-time projectors fail closed rather than silently
 * falling back to defaults when a legacy or tampered row holds an invalid value.
 */
export function normalizeStoredOptionalText(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return trimmed || null
}

export function isValidNpmIntegrity(value: string): boolean {
  if (typeof value !== 'string')
    return false
  return NPM_INTEGRITY_SRI_RE.test(value)
}

export function isValidNpmTarballSha256(value: string): boolean {
  if (typeof value !== 'string')
    return false
  return NPM_TARBALL_SHA256_RE.test(value)
}

function readOptionalInputString(value: unknown, errorCode: string, detail: string): string | null {
  if (value === undefined || value === null)
    return null
  if (typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: `${errorCode}: ${detail}`,
    })
  }
  const trimmed = value.trim()
  return trimmed || null
}

/**
 * Validate and normalize plugin-level NPM cross-link metadata on write.
 * Enforces canonical npm package names and HTTPS-only registry URLs.
 */
export function parsePluginNpmMetadata(
  input: PluginNpmCrossLinkFields,
): NormalizedPluginNpmMetadata {
  const npmPackageName = readOptionalInputString(
    input.npmPackageName,
    'NPM_PACKAGE_NAME_INVALID',
    'Plugin npm package name must be a valid npm package name.',
  )
  if (npmPackageName !== null && !isValidNpmPackageName(npmPackageName)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'NPM_PACKAGE_NAME_INVALID: Plugin npm package name is invalid.',
    })
  }

  const rawRegistry = readOptionalInputString(
    input.npmRegistry,
    'NPM_REGISTRY_URL_INVALID',
    'Plugin npm registry URL must be a valid HTTPS registry URL.',
  )
  let npmRegistry: string | null = null
  if (rawRegistry !== null) {
    if (!isAllowedNpmRegistryUrl(rawRegistry)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'NPM_REGISTRY_URL_INVALID: Plugin npm registry URL must use HTTPS without credentials, query, or hash.',
      })
    }
    npmRegistry = normalizeNpmRegistryUrl(rawRegistry)
  }

  return {
    npmPackageName,
    npmRegistry,
  }
}

/**
 * Validate and normalize version-level NPM cross-link and provenance metadata on write.
 */
export function parsePluginVersionNpmMetadata(
  input: PluginVersionNpmCrossLinkFields,
): NormalizedPluginVersionNpmMetadata {
  const base = parsePluginNpmMetadata(input)

  const npmIntegrity = readOptionalInputString(
    input.npmIntegrity,
    'NPM_INTEGRITY_INVALID',
    'Plugin npm integrity must be a valid sha256, sha384, or sha512 SRI string.',
  )
  if (npmIntegrity !== null && !isValidNpmIntegrity(npmIntegrity)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'NPM_INTEGRITY_INVALID: Plugin npm integrity must be a valid sha256, sha384, or sha512 SRI string.',
    })
  }

  const rawTarballSha256 = readOptionalInputString(
    input.npmTarballSha256,
    'NPM_TARBALL_SHA256_INVALID',
    'Plugin npm tarball SHA-256 must be a 64-character hex digest.',
  )
  let npmTarballSha256: string | null = null
  if (rawTarballSha256 !== null) {
    if (!isValidNpmTarballSha256(rawTarballSha256)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'NPM_TARBALL_SHA256_INVALID: Plugin npm tarball SHA-256 must be a 64-character hex digest.',
      })
    }
    npmTarballSha256 = rawTarballSha256.toLowerCase()
  }

  return {
    ...base,
    npmIntegrity,
    npmTarballSha256,
  }
}

function resolveValidatedPackageName(
  primary: unknown,
  fallback?: unknown,
): string | null {
  if (primary !== undefined && primary !== null) {
    if (typeof primary !== 'string')
      return null
    const trimmed = primary.trim()
    if (trimmed)
      return isValidNpmPackageName(trimmed) ? trimmed : null
  }

  if (fallback !== undefined && fallback !== null) {
    if (typeof fallback !== 'string')
      return null
    const trimmed = fallback.trim()
    if (trimmed)
      return isValidNpmPackageName(trimmed) ? trimmed : null
  }

  return null
}

function resolveValidatedRegistry(
  primary: unknown,
  fallback?: unknown,
): string | null {
  if (primary !== undefined && primary !== null) {
    if (typeof primary !== 'string')
      return null
    const trimmed = primary.trim()
    if (trimmed)
      return isAllowedNpmRegistryUrl(trimmed) ? normalizeNpmRegistryUrl(trimmed) : null
  }

  if (fallback !== undefined && fallback !== null) {
    if (typeof fallback !== 'string')
      return null
    const trimmed = fallback.trim()
    if (trimmed)
      return isAllowedNpmRegistryUrl(trimmed) ? normalizeNpmRegistryUrl(trimmed) : null
  }

  return DEFAULT_NPM_REGISTRY_URL
}

/**
 * Project plugin-level NPM cross-link metadata for public Store API responses.
 * Returns `null` (omitted from JSON) when absent or when stored package/registry metadata is invalid.
 */
export function resolveStorePluginNpmMetadata(
  plugin: PluginNpmCrossLinkFields,
  latestVersion?: PluginVersionNpmCrossLinkFields | null,
): StorePluginNpmMetadata | null {
  const pluginHasExplicitPackage = typeof plugin.npmPackageName === 'string' && plugin.npmPackageName.trim().length > 0
  const packageName = resolveValidatedPackageName(plugin.npmPackageName, latestVersion?.npmPackageName)
  if (!packageName)
    return null

  const latestPackageMatches = !latestVersion?.npmPackageName
    || (typeof latestVersion.npmPackageName === 'string' && latestVersion.npmPackageName.trim() === packageName)

  const registry = pluginHasExplicitPackage
    ? resolveValidatedRegistry(plugin.npmRegistry, latestPackageMatches ? latestVersion?.npmRegistry : undefined)
    : resolveValidatedRegistry(latestVersion?.npmRegistry, plugin.npmRegistry)
  if (!registry)
    return null

  return {
    packageName,
    registry,
    installSource: formatNpmPluginSource(packageName),
    officialScope: isOfficialNpmPluginPackageName(packageName),
  }
}

/**
 * Project version-level NPM install and provenance metadata for public Store API responses.
 * Inherits package name and registry from the parent plugin when omitted on the version.
 * Fails closed (`null`) if the effective package name or explicit registry URL is invalid.
 */
export function resolveStoreVersionNpmMetadata(
  plugin: PluginNpmCrossLinkFields,
  version: PluginVersionNpmCrossLinkFields & { version: string },
): StorePluginVersionNpmMetadata | null {
  const packageName = resolveValidatedPackageName(version.npmPackageName, plugin.npmPackageName)
  if (!packageName)
    return null

  const registry = resolveValidatedRegistry(version.npmRegistry, plugin.npmRegistry)
  if (!registry)
    return null

  const rawIntegrity = normalizeStoredOptionalText(version.npmIntegrity)
  const integrity = rawIntegrity && isValidNpmIntegrity(rawIntegrity) ? rawIntegrity : null

  const rawTarballSha256 = normalizeStoredOptionalText(version.npmTarballSha256)
  const tarballSha256 = rawTarballSha256 && isValidNpmTarballSha256(rawTarballSha256)
    ? rawTarballSha256.toLowerCase()
    : null

  const trimmedVersion = typeof version.version === 'string' ? version.version.trim() : ''
  const installSource = trimmedVersion && isValidNpmVersionSpec(trimmedVersion)
    ? formatNpmPluginSource(packageName, trimmedVersion)
    : formatNpmPluginSource(packageName)

  return {
    packageName,
    version: trimmedVersion,
    registry,
    installSource,
    officialScope: isOfficialNpmPluginPackageName(packageName),
    integrity,
    tarballSha256,
  }
}
