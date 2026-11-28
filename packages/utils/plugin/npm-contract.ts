import type { LocalizedListValue, LocalizedTextValue } from '../i18n'
import type { ManifestPermissions } from '../permission/types'
import type { SdkApiVersion } from './index'
import { CURRENT_SDK_VERSION, resolveSdkApiVersion } from './sdk-version'

export const DEFAULT_NPM_REGISTRY_URL = 'https://registry.npmjs.org'
export const NPM_ABBREVIATED_PACKUMENT_ACCEPT = 'application/vnd.npm.install-v1+json'

export const NPM_PLUGIN_OFFICIAL_SCOPE = '@talex-touch'
export const NPM_PLUGIN_OFFICIAL_SCOPE_PREFIX = '@talex-touch/'
export const NPM_PLUGIN_OFFICIAL_SUFFIX = '-plugin'
export const NPM_PLUGIN_PREFIX = 'tuff-plugin-'

export const NPM_PLUGIN_CANONICAL_KEYWORD = 'tuff-plugin'
export const NPM_PLUGIN_LEGACY_KEYWORDS = ['talex-touch-plugin'] as const
export const NPM_PLUGIN_DISCOVERY_KEYWORDS = [
  NPM_PLUGIN_CANONICAL_KEYWORD,
  ...NPM_PLUGIN_LEGACY_KEYWORDS,
] as const

export const NPM_PLUGIN_TARBALL_ROOT_DIR = 'package'
export const TUFF_NPM_METADATA_SCHEMA_VERSION = 1 as const

export const NPM_FORBIDDEN_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
  'prepublish',
] as const

export type ForbiddenNpmLifecycleScript = (typeof NPM_FORBIDDEN_LIFECYCLE_SCRIPTS)[number]

export type NpmPluginTrustTier = 'nexus-attested' | 'npm-verified' | 'npm-community'

export type NpmPluginPackageNamingKind
  = | 'official-scoped'
    | 'unscoped-prefixed'
    | 'scoped-prefixed'
    | 'scoped-suffixed'
    | 'explicit'

export interface NpmPluginPackageClassification {
  packageName: string
  kind: NpmPluginPackageNamingKind
  /**
   * True only when the package name matches `@talex-touch/<slug>-plugin`.
   *
   * Security invariant: naming scope is NEVER cryptographic trust. Installers must NOT
   * set `official: true` from `officialScope` alone without verified Nexus attestation.
   */
  officialScope: boolean
  scope?: string
  inferredPluginName?: string
}

export type NpmVersionSpecKind = 'exact' | 'dist-tag' | 'range'

export interface ParseNpmPluginSourceOptions {
  /**
   * When true (for example when `hintType === PluginProviderType.NPM`), bare valid npm package
   * names outside the Tuff plugin naming conventions are also accepted.
   *
   * When false (default), bare inputs must match one of the Tuff plugin naming conventions
   * (`@talex-touch/<slug>-plugin`, `tuff-plugin-<slug>`, `@<scope>/tuff-plugin-<slug>`, or
   * `@<scope>/<slug>-plugin`), while explicit `npm:<pkg>[@spec]` accepts any valid npm package.
   */
  allowAnyBarePackageName?: boolean
}

export interface ParsedNpmPluginSource {
  raw: string
  explicit: boolean
  packageName: string
  spec?: string
  specKind?: NpmVersionSpecKind
  classification: NpmPluginPackageClassification
}

export interface NpmRegistryUrlOptions {
  /**
   * Allow `http://localhost`, `http://127.0.0.1`, or `http://[::1]` for local development or tests.
   * Must remain `false` in packaged production builds.
   */
  allowLocalHttp?: boolean
}

export type TuffNpmPluginSurface = 'prelude' | 'webcontent' | 'widget' | 'hybrid'

export type TuffNpmLocalizedText = LocalizedTextValue | Record<string, string>

export interface TuffNpmPackageIcon {
  type: string
  value: string
}

export interface TuffNpmPackagePlatforms {
  win32?: boolean
  darwin?: boolean
  linux?: boolean
}

export interface TuffNpmPackageIntegrity {
  fileMapSha256?: string
}

export interface TuffNpmPackageMetadata {
  schemaVersion: typeof TUFF_NPM_METADATA_SCHEMA_VERSION
  id?: string
  name?: string
  displayName?: TuffNpmLocalizedText
  sdkapi?: SdkApiVersion
  category?: string
  icon?: string | TuffNpmPackageIcon
  permissions?: ManifestPermissions
  platforms?: TuffNpmPackagePlatforms
  surface?: TuffNpmPluginSurface
  manifest?: string
  activationKeywords?: LocalizedListValue
  tags?: string[]
  integrity?: TuffNpmPackageIntegrity
}

export type TuffNpmPackageMetadataSource = 'tuff' | 'tuffPlugin'

export interface NpmDependenciesValidationResult {
  ok: boolean
  dependencies: readonly string[]
  invalidField?: 'dependencies' | 'optionalDependencies'
}

export interface NpmLifecycleScriptsValidationResult {
  ok: boolean
  forbiddenScripts: readonly ForbiddenNpmLifecycleScript[]
  invalidScriptsField?: boolean
}

export type NpmPackageIdentityIssueCode
  = | 'NPM_PACKAGE_JSON_INVALID'
    | 'NPM_PACKAGE_NAME_REQUIRED'
    | 'NPM_PACKAGE_NAME_INVALID'
    | 'NPM_PACKAGE_NAME_CONVENTION_MISMATCH'
    | 'NPM_PACKAGE_EXPECTED_NAME_MISMATCH'
    | 'NPM_PACKAGE_VERSION_REQUIRED'
    | 'NPM_PACKAGE_VERSION_INVALID'
    | 'NPM_PACKAGE_VERSION_MISMATCH'
    | 'NPM_PACKAGE_OFFICIAL_NAME_MISMATCH'
    | 'NPM_PACKAGE_TUFF_METADATA_INVALID'
    | 'NPM_PACKAGE_TUFF_ID_MISMATCH'
    | 'NPM_PACKAGE_TUFF_NAME_MISMATCH'
    | 'NPM_PACKAGE_TUFF_SDKAPI_MISMATCH'
    | 'NPM_PACKAGE_TUFF_CATEGORY_MISMATCH'
    | 'NPM_PACKAGE_DISCOVERY_KEYWORD_MISSING'
    | 'NPM_PACKAGE_RUNTIME_DEPENDENCIES_FORBIDDEN'
    | 'NPM_PACKAGE_LIFECYCLE_SCRIPTS_FORBIDDEN'
    | 'NPM_PACKAGE_PRIVATE_FORBIDDEN'

export interface NpmPackageIdentityIssue {
  code: NpmPackageIdentityIssueCode
  location: string
  meta?: Readonly<Record<string, string | number | boolean>>
}

export interface ValidateNpmPackageIdentityInput {
  packageJson: unknown
  manifest?: unknown
  expectedPackageName?: string
  requireOfficialNaming?: boolean
  requireNamingConvention?: boolean
  requireDiscoveryKeyword?: boolean
  allowLegacyKeyword?: boolean
  forbidPrivate?: boolean
  forbidRuntimeDependencies?: boolean
  forbidLifecycleScripts?: boolean
}

export type ValidateNpmPackageIdentityResult
  = | {
    ok: true
    packageName: string
    version: string
    classification: NpmPluginPackageClassification
    tuff: TuffNpmPackageMetadata | null
  }
  | {
    ok: false
    issues: readonly NpmPackageIdentityIssue[]
  }

export interface BuildNpmPackageJsonInput {
  manifest: Record<string, unknown>
  sourcePackageJson?: Record<string, unknown>
  packageName?: string
  files?: readonly string[]
  fileMapSha256?: string
  access?: 'public' | 'restricted'
  surface?: TuffNpmPluginSurface
}

export interface BuiltNpmPackageJson {
  name: string
  version: string
  description: string
  author?: string | Record<string, unknown>
  license?: string
  homepage?: string
  repository?: string | Record<string, unknown>
  bugs?: string | Record<string, unknown>
  keywords: string[]
  main: string
  exports: Record<string, string>
  files: string[]
  dependencies: Record<string, never>
  engines: {
    tuff: string
  }
  publishConfig: {
    access: 'public' | 'restricted'
    registry?: string
  }
  tuff: TuffNpmPackageMetadata
}

const NPM_MAX_NAME_LENGTH = 214
const NPM_MAX_SPEC_LENGTH = 128
const NPM_NAME_SEGMENT_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const PLUGIN_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const REVERSE_DOMAIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i
const ARCHIVE_EXTENSION_RE = /\.(?:tpex|tar|tgz|zip)$/i
const SCHEME_PREFIX_RE = /^[a-z][a-z0-9+.-]*:/i
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const WINDOWS_DRIVE_RE = /^[a-z]:/i
const SPEC_FORBIDDEN_CHAR_RE = /[:/\\@?#&;'"`$()[\]{}]/
const DIST_TAG_RE = /^[a-z][a-z0-9._-]{0,63}$/i
const OFFICIAL_PACKAGE_RE = /^@talex-touch\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-plugin$/
const UNSCOPED_PREFIXED_RE = /^tuff-plugin-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/
const SCOPED_PREFIXED_RE = /^@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/tuff-plugin-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/
const SCOPED_SUFFIXED_RE = /^@([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)-plugin$/

const PARTIAL_SEMVER_BODY = '(?:\\*|x|X|v?(?:0|[1-9]\\d*)(?:\\.(?:(?:\\*|x|X)(?:\\.(?:\\*|x|X))?|(?:0|[1-9]\\d*)(?:\\.(?:(?:\\*|x|X)|(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|\\d*[a-z-][0-9a-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-z-][0-9a-z-]*))*)?(?:\\+[0-9a-z-]+(?:\\.[0-9a-z-]+)*)?))?))?)'
const PARTIAL_SEMVER_RE = new RegExp(`^${PARTIAL_SEMVER_BODY}$`, 'i')
const COMPARATOR_RE = new RegExp(`^(?:>=|<=|>|<|=|\\^|~)?${PARTIAL_SEMVER_BODY}$`, 'i')

const VALID_SURFACES = new Set<TuffNpmPluginSurface>(['prelude', 'webcontent', 'widget', 'hybrid'])
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

function isValidNpmSegment(segment: string): boolean {
  return Boolean(segment) && !segment.includes('..') && NPM_NAME_SEGMENT_RE.test(segment)
}

/**
 * Validate a canonical lowercase npm package name (scoped or unscoped).
 */
export function isValidNpmPackageName(packageName: string): boolean {
  if (typeof packageName !== 'string')
    return false
  if (packageName.length === 0 || packageName.length > NPM_MAX_NAME_LENGTH)
    return false
  if (packageName !== packageName.trim() || hasControlChars(packageName))
    return false

  if (packageName.startsWith('@')) {
    const slashIndex = packageName.indexOf('/')
    if (slashIndex <= 1 || slashIndex !== packageName.lastIndexOf('/'))
      return false
    const scope = packageName.slice(1, slashIndex)
    const name = packageName.slice(slashIndex + 1)
    return isValidNpmSegment(scope) && isValidNpmSegment(name)
  }

  if (packageName.includes('/'))
    return false
  return isValidNpmSegment(packageName)
}

/**
 * Format an official Tuff plugin npm package name: `@talex-touch/<slug>-plugin`.
 */
export function formatOfficialNpmPackageName(pluginSlug: string): string {
  const slug = pluginSlug.trim()
  if (!PLUGIN_SLUG_RE.test(slug)) {
    throw new RangeError(`Invalid plugin slug for official npm package name: "${pluginSlug}"`)
  }
  return `${NPM_PLUGIN_OFFICIAL_SCOPE_PREFIX}${slug}${NPM_PLUGIN_OFFICIAL_SUFFIX}`
}

/**
 * Check whether an npm package name follows the official `@talex-touch/<slug>-plugin` convention.
 *
 * Security note: this checks package naming scope only; it does NOT establish cryptographic trust.
 */
export function isOfficialNpmPluginPackageName(packageName: string): boolean {
  return isValidNpmPackageName(packageName) && OFFICIAL_PACKAGE_RE.test(packageName)
}

/**
 * Check whether an npm package name follows one of the supported third-party Tuff conventions:
 * - `tuff-plugin-<slug>`
 * - `@<scope>/tuff-plugin-<slug>` (excluding `@talex-touch`)
 * - `@<scope>/<slug>-plugin` (excluding `@talex-touch`)
 */
export function isThirdPartyNpmPluginPackageName(packageName: string): boolean {
  if (!isValidNpmPackageName(packageName))
    return false
  if (UNSCOPED_PREFIXED_RE.test(packageName))
    return true

  const prefixed = SCOPED_PREFIXED_RE.exec(packageName)
  if (prefixed && prefixed[1] !== 'talex-touch')
    return true

  const suffixed = SCOPED_SUFFIXED_RE.exec(packageName)
  if (suffixed && suffixed[1] !== 'talex-touch')
    return true

  return false
}

/**
 * Check whether an npm package name follows either the official or third-party Tuff convention.
 */
export function isTuffNpmPluginPackageName(packageName: string): boolean {
  return isOfficialNpmPluginPackageName(packageName) || isThirdPartyNpmPluginPackageName(packageName)
}

/**
 * Classify a valid npm package name against Tuff's official and third-party naming conventions.
 */
export function classifyNpmPluginPackageName(
  packageName: string,
): NpmPluginPackageClassification | null {
  if (!isValidNpmPackageName(packageName))
    return null

  const officialMatch = OFFICIAL_PACKAGE_RE.exec(packageName)
  if (officialMatch) {
    return {
      packageName,
      kind: 'official-scoped',
      officialScope: true,
      scope: NPM_PLUGIN_OFFICIAL_SCOPE,
      inferredPluginName: officialMatch[1],
    }
  }

  const unscopedPrefixedMatch = UNSCOPED_PREFIXED_RE.exec(packageName)
  if (unscopedPrefixedMatch) {
    return {
      packageName,
      kind: 'unscoped-prefixed',
      officialScope: false,
      inferredPluginName: unscopedPrefixedMatch[1],
    }
  }

  const scopedPrefixedMatch = SCOPED_PREFIXED_RE.exec(packageName)
  if (scopedPrefixedMatch && scopedPrefixedMatch[1] !== 'talex-touch') {
    return {
      packageName,
      kind: 'scoped-prefixed',
      officialScope: false,
      scope: `@${scopedPrefixedMatch[1]}`,
      inferredPluginName: scopedPrefixedMatch[2],
    }
  }

  const scopedSuffixedMatch = SCOPED_SUFFIXED_RE.exec(packageName)
  if (scopedSuffixedMatch && scopedSuffixedMatch[1] !== 'talex-touch') {
    return {
      packageName,
      kind: 'scoped-suffixed',
      officialScope: false,
      scope: `@${scopedSuffixedMatch[1]}`,
      inferredPluginName: scopedSuffixedMatch[2],
    }
  }

  const slashIndex = packageName.indexOf('/')
  return {
    packageName,
    kind: 'explicit',
    officialScope: false,
    ...(packageName.startsWith('@') && slashIndex > 1
      ? { scope: packageName.slice(0, slashIndex) }
      : {}),
  }
}

/**
 * Infer a Tuff plugin slug (`manifest.name`) from a convention-compliant npm package name.
 */
export function inferPluginNameFromNpmPackage(packageName: string): string | undefined {
  return classifyNpmPluginPackageName(packageName)?.inferredPluginName
}

function isValidPartialSemver(token: string): boolean {
  return PARTIAL_SEMVER_RE.test(token)
}

function isValidComparatorToken(token: string): boolean {
  return COMPARATOR_RE.test(token)
}

function isValidNpmSemverRange(spec: string): boolean {
  const branches = spec.split('||')
  if (branches.length === 0)
    return false

  for (const rawBranch of branches) {
    const branch = rawBranch.trim()
    if (!branch)
      return false

    if (branch.includes(' - ')) {
      const hyphenParts = branch.split(/\s+-\s+/)
      if (hyphenParts.length !== 2)
        return false
      const [lower, upper] = hyphenParts
      if (!lower || !upper || !isValidPartialSemver(lower) || !isValidPartialSemver(upper))
        return false
      continue
    }

    const normalized = branch.replace(/([<>]=?|=|\^|~)\s+/g, '$1')
    const tokens = normalized.split(/\s+/)
    if (tokens.length === 0 || tokens.some(token => !isValidComparatorToken(token)))
      return false
  }

  return true
}

/**
 * Classify an npm version / dist-tag / semver range specifier.
 * Rejects URLs, file/git/workspace protocols, paths, control chars, and shell metacharacters.
 */
export function classifyNpmVersionSpec(spec: string): NpmVersionSpecKind | null {
  if (typeof spec !== 'string')
    return null
  if (!spec || spec !== spec.trim() || spec.length > NPM_MAX_SPEC_LENGTH)
    return null
  if (hasControlChars(spec) || SPEC_FORBIDDEN_CHAR_RE.test(spec))
    return null

  if (SEMVER_RE.test(spec))
    return 'exact'

  if (isValidNpmSemverRange(spec))
    return 'range'

  if (DIST_TAG_RE.test(spec) && !spec.includes('..'))
    return 'dist-tag'

  return null
}

/**
 * Return true if `spec` is a safe npm exact semver, semver range, or dist-tag.
 */
export function isValidNpmVersionSpec(spec: string): boolean {
  return classifyNpmVersionSpec(spec) !== null
}

/**
 * Parse an npm plugin install source string (`npm:<pkg>[@spec]` or bare Tuff package name).
 */
export function parseNpmPluginSource(
  source: string,
  options: ParseNpmPluginSourceOptions = {},
): ParsedNpmPluginSource | null {
  if (typeof source !== 'string')
    return null
  const raw = source.trim()
  if (!raw || hasControlChars(raw))
    return null

  if (
    URL_SCHEME_RE.test(raw)
    || WINDOWS_DRIVE_RE.test(raw)
    || raw.startsWith('/')
    || raw.startsWith('./')
    || raw.startsWith('../')
    || raw.includes('\\')
  ) {
    return null
  }

  let explicit = false
  let body = raw
  if (raw.startsWith('npm:')) {
    explicit = true
    body = raw.slice(4).trim()
    if (!body)
      return null
  }
  else if (SCHEME_PREFIX_RE.test(raw)) {
    return null
  }

  if (!explicit && ARCHIVE_EXTENSION_RE.test(body))
    return null

  let packageName = body
  let spec: string | undefined

  if (body.startsWith('@')) {
    const slashIndex = body.indexOf('/')
    if (slashIndex <= 1)
      return null
    const atIndex = body.indexOf('@', slashIndex + 1)
    if (atIndex !== -1) {
      packageName = body.slice(0, atIndex)
      spec = body.slice(atIndex + 1)
      if (!spec)
        return null
    }
  }
  else {
    const atIndex = body.indexOf('@')
    if (atIndex === 0)
      return null
    if (atIndex > 0) {
      packageName = body.slice(0, atIndex)
      spec = body.slice(atIndex + 1)
      if (!spec)
        return null
    }
  }

  if (ARCHIVE_EXTENSION_RE.test(packageName))
    return null

  const classification = classifyNpmPluginPackageName(packageName)
  if (!classification)
    return null

  if (!explicit && !options.allowAnyBarePackageName && classification.kind === 'explicit')
    return null

  let specKind: NpmVersionSpecKind | undefined
  if (spec !== undefined) {
    const resolvedSpecKind = classifyNpmVersionSpec(spec)
    if (!resolvedSpecKind)
      return null
    specKind = resolvedSpecKind
  }

  return {
    raw,
    explicit,
    packageName,
    ...(spec !== undefined ? { spec, specKind } : {}),
    classification,
  }
}

/**
 * Format an explicit canonical npm install source string (`npm:<pkg>` or `npm:<pkg>@<spec>`).
 */
export function formatNpmPluginSource(packageName: string, spec?: string): string {
  const pkg = packageName.trim()
  if (!isValidNpmPackageName(pkg)) {
    throw new RangeError(`Invalid npm package name: "${packageName}"`)
  }
  if (spec !== undefined) {
    const trimmedSpec = spec.trim()
    if (!isValidNpmVersionSpec(trimmedSpec)) {
      throw new RangeError(`Invalid npm version spec: "${spec}"`)
    }
    return `npm:${pkg}@${trimmedSpec}`
  }
  return `npm:${pkg}`
}

/**
 * Check whether a keyword is the canonical discovery keyword (`tuff-plugin`)
 * or, when `includeLegacy` is true (default), the legacy `talex-touch-plugin` keyword.
 */
export function isTuffNpmDiscoveryKeyword(
  keyword: string,
  options: { includeLegacy?: boolean } = {},
): boolean {
  const normalized = keyword.trim().toLowerCase()
  if (normalized === NPM_PLUGIN_CANONICAL_KEYWORD)
    return true
  if (options.includeLegacy === false)
    return false
  return (NPM_PLUGIN_LEGACY_KEYWORDS as readonly string[]).includes(normalized)
}

/**
 * Check whether a package's `keywords` list contains a Tuff plugin discovery keyword.
 */
export function hasTuffNpmDiscoveryKeyword(
  keywords: unknown,
  options: { includeLegacy?: boolean } = {},
): boolean {
  if (!Array.isArray(keywords))
    return false
  return keywords.some(
    entry => typeof entry === 'string' && isTuffNpmDiscoveryKeyword(entry, options),
  )
}

/**
 * Encode an npm package name for registry URL paths (`@scope/pkg` -> `@scope%2Fpkg`).
 */
export function encodeNpmPackagePath(packageName: string): string {
  const trimmed = packageName.trim()
  if (!isValidNpmPackageName(trimmed)) {
    throw new RangeError(`Invalid npm package name for registry path: "${packageName}"`)
  }
  if (trimmed.startsWith('@')) {
    return encodeURIComponent(trimmed).replace(/^%40/, '@')
  }
  return encodeURIComponent(trimmed)
}

/**
 * Normalize a registry base URL by trimming whitespace and removing trailing slashes.
 */
export function normalizeNpmRegistryUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * Validate whether an npm registry base URL is permitted.
 * Enforces `https:` by default; allows local loopback `http:` only when `allowLocalHttp: true`.
 */
export function isAllowedNpmRegistryUrl(
  url: string,
  options: NpmRegistryUrlOptions = {},
): boolean {
  if (typeof url !== 'string')
    return false
  const trimmed = url.trim()
  if (!trimmed || hasControlChars(trimmed))
    return false

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  }
  catch {
    return false
  }

  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash)
    return false

  // Reject shell metacharacters in registry URLs (e.g., `&`, `|`, `%`, `^`, `!`, `"`)
  // so Windows CLI invocations and downstream scripts can never interpret them.
  if (/[&|<>^%!"'`;\\]/.test(trimmed) || /[&|<>^%!"'`;\\]/.test(parsed.pathname))
    return false

  if (parsed.protocol === 'https:')
    return true

  if (parsed.protocol === 'http:' && options.allowLocalHttp === true) {
    return LOCAL_HTTP_HOSTS.has(parsed.hostname.toLowerCase())
  }

  return false
}

/**
 * Resolve the first non-empty registry URL candidate, enforcing `isAllowedNpmRegistryUrl`.
 * Falls back to `DEFAULT_NPM_REGISTRY_URL` when all candidates are empty/undefined.
 */
export function resolveNpmRegistryUrl(
  candidates: readonly (string | undefined | null)[],
  options: NpmRegistryUrlOptions = {},
): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string')
      continue
    const trimmed = candidate.trim()
    if (!trimmed)
      continue
    if (!isAllowedNpmRegistryUrl(trimmed, options)) {
      throw new RangeError(`Disallowed npm registry URL: "${candidate}"`)
    }
    return normalizeNpmRegistryUrl(trimmed)
  }
  return DEFAULT_NPM_REGISTRY_URL
}

/**
 * Identify whether a package.json object carries canonical `tuff` or legacy `tuffPlugin` metadata.
 */
export function getTuffPackageMetadataSource(pkgJson: unknown): TuffNpmPackageMetadataSource | null {
  if (!isRecord(pkgJson))
    return null
  if (isRecord(pkgJson.tuff))
    return 'tuff'
  if (isRecord(pkgJson.tuffPlugin))
    return 'tuffPlugin'
  return null
}

function normalizeLocalizedText(raw: unknown): TuffNpmLocalizedText | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed || undefined
  }
  if (!isRecord(raw))
    return undefined

  if (typeof raw.default === 'string' && raw.default.trim()) {
    const locales: Record<string, string> = {}
    if (isRecord(raw.locales)) {
      for (const [locale, value] of Object.entries(raw.locales)) {
        if (typeof value === 'string' && value.trim())
          locales[locale] = value.trim()
      }
    }
    return {
      default: raw.default.trim(),
      ...(Object.keys(locales).length > 0 ? { locales } : {}),
    }
  }

  const localeMap: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim())
      localeMap[key] = value.trim()
  }
  return Object.keys(localeMap).length > 0 ? localeMap : undefined
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw))
    return undefined
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string')
      continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed))
      continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result.length > 0 ? result : undefined
}

function normalizeLocalizedList(raw: unknown): LocalizedListValue | undefined {
  if (Array.isArray(raw))
    return normalizeStringArray(raw)
  if (!isRecord(raw))
    return undefined
  const defaultList = normalizeStringArray(raw.default)
  if (!defaultList)
    return undefined
  const locales: Record<string, string[]> = {}
  if (isRecord(raw.locales)) {
    for (const [locale, list] of Object.entries(raw.locales)) {
      const normalized = normalizeStringArray(list)
      if (normalized)
        locales[locale] = normalized
    }
  }
  return {
    default: defaultList,
    ...(Object.keys(locales).length > 0 ? { locales } : {}),
  }
}

function normalizeIcon(raw: unknown): string | TuffNpmPackageIcon | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed || undefined
  }
  if (!isRecord(raw))
    return undefined
  const type = readTrimmedString(raw.type)
  const value = readTrimmedString(raw.value)
  if (!type || !value)
    return undefined
  return { type, value }
}

function normalizePermissionsBlock(raw: unknown): ManifestPermissions | undefined {
  if (!isRecord(raw))
    return undefined
  const required = Array.isArray(raw.required)
    ? raw.required.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
    : undefined
  const optional = Array.isArray(raw.optional)
    ? raw.optional.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
    : undefined
  if (required === undefined && optional === undefined)
    return undefined
  return {
    ...(required !== undefined ? { required } : {}),
    ...(optional !== undefined ? { optional } : {}),
  }
}

function normalizePlatforms(raw: unknown): TuffNpmPackagePlatforms | undefined {
  if (!isRecord(raw))
    return undefined
  const platforms: TuffNpmPackagePlatforms = {}
  let hasAny = false
  for (const key of ['win32', 'darwin', 'linux'] as const) {
    if (typeof raw[key] === 'boolean') {
      platforms[key] = raw[key]
      hasAny = true
    }
  }
  return hasAny ? platforms : undefined
}

function normalizeIntegrity(raw: unknown): TuffNpmPackageIntegrity | undefined {
  if (!isRecord(raw))
    return undefined
  const fileMapSha256 = readTrimmedString(raw.fileMapSha256)?.toLowerCase()
  if (!fileMapSha256 || !SHA256_HEX_RE.test(fileMapSha256))
    return undefined
  return { fileMapSha256 }
}

/**
 * Extract canonical `TuffNpmPackageMetadata` from a `package.json` or registry packument version.
 * Prefers `package.json#tuff` and falls back to legacy `package.json#tuffPlugin`.
 */
export function extractTuffPackageMetadata(pkgJson: unknown): TuffNpmPackageMetadata | null {
  if (!isRecord(pkgJson))
    return null

  const raw = isRecord(pkgJson.tuff)
    ? pkgJson.tuff
    : isRecord(pkgJson.tuffPlugin)
      ? pkgJson.tuffPlugin
      : null
  if (!raw)
    return null

  if (
    raw.schemaVersion !== undefined
    && raw.schemaVersion !== TUFF_NPM_METADATA_SCHEMA_VERSION
  ) {
    return null
  }

  const id = readTrimmedString(raw.id)
  const name = readTrimmedString(raw.name)
  const displayName = normalizeLocalizedText(raw.displayName)
  const sdkapi = raw.sdkapi !== undefined ? resolveSdkApiVersion(raw.sdkapi) : undefined
  const category = readTrimmedString(raw.category)
  const icon = normalizeIcon(raw.icon)
  const permissions = normalizePermissionsBlock(raw.permissions)
  const platforms = normalizePlatforms(raw.platforms)
  const surface = typeof raw.surface === 'string' && VALID_SURFACES.has(raw.surface as TuffNpmPluginSurface)
    ? (raw.surface as TuffNpmPluginSurface)
    : undefined
  const manifest = readTrimmedString(raw.manifest)
  const activationKeywords = normalizeLocalizedList(raw.activationKeywords)
  const tags = normalizeStringArray(raw.tags)
  const integrity = normalizeIntegrity(raw.integrity)

  return {
    schemaVersion: TUFF_NPM_METADATA_SCHEMA_VERSION,
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(sdkapi !== undefined ? { sdkapi } : {}),
    ...(category ? { category } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(permissions ? { permissions } : {}),
    ...(platforms ? { platforms } : {}),
    ...(surface ? { surface } : {}),
    ...(manifest ? { manifest } : {}),
    ...(activationKeywords ? { activationKeywords } : {}),
    ...(tags ? { tags } : {}),
    ...(integrity ? { integrity } : {}),
  }
}

/**
 * List runtime dependency package names declared in `dependencies` or `optionalDependencies`.
 */
export function getNpmRuntimeDependencyNames(pkgJson: unknown): string[] {
  if (!isRecord(pkgJson))
    return []
  const deps = new Set<string>()
  for (const field of ['dependencies', 'optionalDependencies'] as const) {
    const block = pkgJson[field]
    if (!isRecord(block))
      continue
    for (const key of Object.keys(block)) {
      deps.add(key)
    }
  }
  return [...deps].sort((left, right) => left.localeCompare(right, 'en'))
}

/**
 * Validate that a Tuff npm plugin package declares zero runtime dependencies.
 */
export function validateNpmZeroRuntimeDependencies(
  pkgJson: unknown,
): NpmDependenciesValidationResult {
  if (!isRecord(pkgJson)) {
    return { ok: false, dependencies: [], invalidField: 'dependencies' }
  }

  for (const field of ['dependencies', 'optionalDependencies'] as const) {
    const block = pkgJson[field]
    if (block !== undefined && !isRecord(block)) {
      return { ok: false, dependencies: [], invalidField: field }
    }
  }

  const dependencies = getNpmRuntimeDependencyNames(pkgJson)
  return {
    ok: dependencies.length === 0,
    dependencies,
  }
}

/**
 * Return any forbidden install lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`).
 */
export function getForbiddenNpmLifecycleScripts(pkgJson: unknown): ForbiddenNpmLifecycleScript[] {
  if (!isRecord(pkgJson) || !isRecord(pkgJson.scripts))
    return []
  const scripts = pkgJson.scripts
  const found: ForbiddenNpmLifecycleScript[] = []
  for (const scriptName of NPM_FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (
      Object.prototype.hasOwnProperty.call(scripts, scriptName)
      && scripts[scriptName] !== undefined
    ) {
      found.push(scriptName)
    }
  }
  return found
}

/**
 * Validate that a Tuff npm plugin package declares zero install lifecycle scripts.
 */
export function validateNpmNoLifecycleScripts(
  pkgJson: unknown,
): NpmLifecycleScriptsValidationResult {
  if (!isRecord(pkgJson)) {
    return { ok: false, forbiddenScripts: [], invalidScriptsField: true }
  }
  if (pkgJson.scripts === undefined) {
    return { ok: true, forbiddenScripts: [] }
  }
  if (!isRecord(pkgJson.scripts)) {
    return { ok: false, forbiddenScripts: [], invalidScriptsField: true }
  }

  const forbiddenScripts = getForbiddenNpmLifecycleScripts(pkgJson)
  return {
    ok: forbiddenScripts.length === 0,
    forbiddenScripts,
  }
}

/**
 * Validate `package.json` identity, naming, version/manifest parity, `tuff` block,
 * zero runtime dependencies, and zero lifecycle scripts.
 */
export function validateNpmPackageIdentity(
  input: ValidateNpmPackageIdentityInput,
): ValidateNpmPackageIdentityResult {
  const issues: NpmPackageIdentityIssue[] = []
  if (!isRecord(input.packageJson)) {
    issues.push({ code: 'NPM_PACKAGE_JSON_INVALID', location: 'package.json' })
    return { ok: false, issues }
  }

  const pkg = input.packageJson
  const manifest = isRecord(input.manifest) ? input.manifest : undefined
  const manifestId = manifest ? readTrimmedString(manifest.id) : undefined
  const manifestName = manifest ? readTrimmedString(manifest.name) : undefined
  const manifestVersion = manifest ? readTrimmedString(manifest.version) : undefined
  const manifestCategory = manifest ? readTrimmedString(manifest.category) : undefined
  const manifestSdkapi = manifest ? resolveSdkApiVersion(manifest.sdkapi) : undefined

  const packageName = readTrimmedString(pkg.name) ?? ''
  let classification: NpmPluginPackageClassification | null = null
  if (!packageName) {
    issues.push({ code: 'NPM_PACKAGE_NAME_REQUIRED', location: 'package.json.name' })
  }
  else {
    classification = classifyNpmPluginPackageName(packageName)
    if (!classification) {
      issues.push({
        code: 'NPM_PACKAGE_NAME_INVALID',
        location: 'package.json.name',
        meta: { actual: packageName },
      })
    }
    else {
      if (input.expectedPackageName && input.expectedPackageName !== packageName) {
        issues.push({
          code: 'NPM_PACKAGE_EXPECTED_NAME_MISMATCH',
          location: 'package.json.name',
          meta: { expected: input.expectedPackageName, actual: packageName },
        })
      }

      if (input.requireOfficialNaming) {
        if (!classification.officialScope) {
          issues.push({
            code: 'NPM_PACKAGE_OFFICIAL_NAME_MISMATCH',
            location: 'package.json.name',
            meta: {
              actual: packageName,
              ...(manifestName && PLUGIN_SLUG_RE.test(manifestName)
                ? { expected: formatOfficialNpmPackageName(manifestName) }
                : {}),
            },
          })
        }
        else if (
          manifestName
          && PLUGIN_SLUG_RE.test(manifestName)
          && classification.inferredPluginName !== manifestName
        ) {
          issues.push({
            code: 'NPM_PACKAGE_OFFICIAL_NAME_MISMATCH',
            location: 'package.json.name',
            meta: { expected: formatOfficialNpmPackageName(manifestName), actual: packageName },
          })
        }
      }
      else if (
        classification.officialScope
        && manifestName
        && PLUGIN_SLUG_RE.test(manifestName)
        && classification.inferredPluginName !== manifestName
      ) {
        issues.push({
          code: 'NPM_PACKAGE_OFFICIAL_NAME_MISMATCH',
          location: 'package.json.name',
          meta: { expected: formatOfficialNpmPackageName(manifestName), actual: packageName },
        })
      }

      if (input.requireNamingConvention && classification.kind === 'explicit') {
        issues.push({
          code: 'NPM_PACKAGE_NAME_CONVENTION_MISMATCH',
          location: 'package.json.name',
          meta: { actual: packageName },
        })
      }
    }
  }

  const version = readTrimmedString(pkg.version) ?? ''
  if (!version) {
    issues.push({ code: 'NPM_PACKAGE_VERSION_REQUIRED', location: 'package.json.version' })
  }
  else if (!SEMVER_RE.test(version)) {
    issues.push({
      code: 'NPM_PACKAGE_VERSION_INVALID',
      location: 'package.json.version',
      meta: { actual: version },
    })
  }
  else if (manifestVersion && version !== manifestVersion) {
    issues.push({
      code: 'NPM_PACKAGE_VERSION_MISMATCH',
      location: 'package.json.version',
      meta: { expected: manifestVersion, actual: version },
    })
  }

  const hasRawTuff = pkg.tuff !== undefined
  let tuff: TuffNpmPackageMetadata | null = null
  if (hasRawTuff && !isRecord(pkg.tuff)) {
    issues.push({ code: 'NPM_PACKAGE_TUFF_METADATA_INVALID', location: 'package.json.tuff' })
  }
  else if (
    isRecord(pkg.tuff)
    && pkg.tuff.schemaVersion !== undefined
    && pkg.tuff.schemaVersion !== TUFF_NPM_METADATA_SCHEMA_VERSION
  ) {
    issues.push({
      code: 'NPM_PACKAGE_TUFF_METADATA_INVALID',
      location: 'package.json.tuff.schemaVersion',
    })
  }
  else {
    tuff = extractTuffPackageMetadata(pkg)
    if (isRecord(pkg.tuff)) {
      if (pkg.tuff.sdkapi !== undefined && tuff?.sdkapi === undefined) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_METADATA_INVALID',
          location: 'package.json.tuff.sdkapi',
        })
      }
    }
    if (tuff) {
      if (tuff.id && !REVERSE_DOMAIN_ID_RE.test(tuff.id)) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_METADATA_INVALID',
          location: 'package.json.tuff.id',
          meta: { actual: tuff.id },
        })
      }
      else if (tuff.id && manifestId && tuff.id !== manifestId) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_ID_MISMATCH',
          location: 'package.json.tuff.id',
          meta: { expected: manifestId, actual: tuff.id },
        })
      }

      if (tuff.name && !PLUGIN_SLUG_RE.test(tuff.name)) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_METADATA_INVALID',
          location: 'package.json.tuff.name',
          meta: { actual: tuff.name },
        })
      }
      else if (tuff.name && manifestName && tuff.name !== manifestName) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_NAME_MISMATCH',
          location: 'package.json.tuff.name',
          meta: { expected: manifestName, actual: tuff.name },
        })
      }

      if (tuff.sdkapi !== undefined && manifestSdkapi !== undefined && tuff.sdkapi !== manifestSdkapi) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_SDKAPI_MISMATCH',
          location: 'package.json.tuff.sdkapi',
          meta: { expected: manifestSdkapi, actual: tuff.sdkapi },
        })
      }

      if (tuff.category && manifestCategory && tuff.category !== manifestCategory) {
        issues.push({
          code: 'NPM_PACKAGE_TUFF_CATEGORY_MISMATCH',
          location: 'package.json.tuff.category',
          meta: { expected: manifestCategory, actual: tuff.category },
        })
      }
    }
  }

  if (
    input.requireDiscoveryKeyword
    && !hasTuffNpmDiscoveryKeyword(pkg.keywords, { includeLegacy: input.allowLegacyKeyword ?? true })
  ) {
    issues.push({
      code: 'NPM_PACKAGE_DISCOVERY_KEYWORD_MISSING',
      location: 'package.json.keywords',
      meta: { expected: NPM_PLUGIN_CANONICAL_KEYWORD },
    })
  }

  if (input.forbidPrivate && pkg.private === true) {
    issues.push({ code: 'NPM_PACKAGE_PRIVATE_FORBIDDEN', location: 'package.json.private' })
  }

  if (input.forbidRuntimeDependencies !== false) {
    const depCheck = validateNpmZeroRuntimeDependencies(pkg)
    if (!depCheck.ok) {
      issues.push({
        code: 'NPM_PACKAGE_RUNTIME_DEPENDENCIES_FORBIDDEN',
        location: `package.json.${depCheck.invalidField ?? 'dependencies'}`,
        meta: {
          count: depCheck.dependencies.length,
          ...(depCheck.dependencies.length > 0
            ? { packages: depCheck.dependencies.slice(0, 8).join(',') }
            : {}),
        },
      })
    }
  }

  if (input.forbidLifecycleScripts !== false) {
    const scriptCheck = validateNpmNoLifecycleScripts(pkg)
    if (!scriptCheck.ok) {
      issues.push({
        code: 'NPM_PACKAGE_LIFECYCLE_SCRIPTS_FORBIDDEN',
        location: 'package.json.scripts',
        meta: {
          ...(scriptCheck.forbiddenScripts.length > 0
            ? { scripts: scriptCheck.forbiddenScripts.join(',') }
            : {}),
        },
      })
    }
  }

  if (issues.length > 0 || !classification) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    packageName,
    version,
    classification,
    tuff,
  }
}

function resolvePlainDescription(value: unknown, fallback?: unknown): string {
  if (typeof value === 'string' && value.trim())
    return value.trim()
  if (isRecord(value)) {
    if (typeof value.default === 'string' && value.default.trim())
      return value.default.trim()
    for (const key of ['en', 'en-US', 'zh', 'zh-CN']) {
      if (typeof value[key] === 'string' && value[key].trim())
        return (value[key] as string).trim()
    }
    if (isRecord(value.locales)) {
      for (const key of ['en-US', 'en', 'zh-CN', 'zh']) {
        const localized = value.locales[key]
        if (typeof localized === 'string' && localized.trim())
          return localized.trim()
      }
    }
    for (const entry of Object.values(value)) {
      if (typeof entry === 'string' && entry.trim())
        return entry.trim()
    }
  }
  if (typeof fallback === 'string' && fallback.trim())
    return fallback.trim()
  return ''
}

function inferPlatformsFromManifest(manifest: Record<string, unknown>): TuffNpmPackagePlatforms | undefined {
  const direct = normalizePlatforms(manifest.platforms)
  if (direct)
    return direct

  if (!Array.isArray(manifest.features) || manifest.features.length === 0)
    return undefined

  let found = false
  const aggregated: TuffNpmPackagePlatforms = { win32: false, darwin: false, linux: false }
  for (const feature of manifest.features) {
    if (!isRecord(feature) || !isRecord(feature.platform))
      continue
    const platform = normalizePlatforms(feature.platform)
    if (!platform)
      continue
    found = true
    if (platform.win32)
      aggregated.win32 = true
    if (platform.darwin)
      aggregated.darwin = true
    if (platform.linux)
      aggregated.linux = true
  }
  return found ? aggregated : undefined
}

function inferSurfaceFromManifest(
  manifest: Record<string, unknown>,
  files?: readonly string[],
): TuffNpmPluginSurface {
  let hasWebcontent = false
  let hasWidget = false
  if (Array.isArray(manifest.features)) {
    for (const feature of manifest.features) {
      if (!isRecord(feature) || !isRecord(feature.interaction))
        continue
      if (feature.interaction.type === 'webcontent')
        hasWebcontent = true
      if (feature.interaction.type === 'widget')
        hasWidget = true
    }
  }

  if (!hasWebcontent && files?.some(file => file === 'index.html' || file === './index.html'))
    hasWebcontent = true

  if (hasWebcontent && hasWidget)
    return 'hybrid'
  if (hasWebcontent)
    return 'webcontent'
  if (hasWidget)
    return 'widget'
  return 'prelude'
}

function normalizeRelativeEntry(entry: string): string {
  const raw = entry.trim()
  if (!raw)
    return './index.js'
  if (
    raw.includes('\0')
    || raw.includes('\\')
    || raw.startsWith('/')
    || WINDOWS_DRIVE_RE.test(raw)
  ) {
    throw new RangeError(`Invalid relative manifest entry path: "${entry}"`)
  }
  const cleaned = raw.replace(/^\.\//, '')
  const segments = cleaned.split('/')
  if (!cleaned || segments.some(seg => !seg || seg === '.' || seg === '..')) {
    throw new RangeError(`Invalid relative manifest entry path: "${entry}"`)
  }
  return `./${cleaned}`
}

function normalizeStagedFileEntry(entry: string): string | null {
  const cleaned = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  return cleaned || null
}

/**
 * Build a sanitized, publish-ready `package.json` payload for a Tuff npm plugin package.
 * Guarantees zero runtime dependencies, zero lifecycle scripts, canonical `keywords`,
 * and exact parity with `manifest.json`.
 */
export function buildNpmPackageJson(input: BuildNpmPackageJsonInput): BuiltNpmPackageJson {
  const { manifest, sourcePackageJson } = input
  const manifestName = readTrimmedString(manifest.name)
  const manifestVersion = readTrimmedString(manifest.version)
  const manifestId = readTrimmedString(manifest.id)
  const manifestCategory = readTrimmedString(manifest.category)

  if (!manifestName || !PLUGIN_SLUG_RE.test(manifestName)) {
    throw new RangeError(`Manifest requires a valid slug name to build npm package.json (got "${String(manifest.name ?? '')}")`)
  }
  if (!manifestVersion || !SEMVER_RE.test(manifestVersion)) {
    throw new RangeError(`Manifest requires a valid SemVer version to build npm package.json (got "${String(manifest.version ?? '')}")`)
  }

  const candidateName = readTrimmedString(input.packageName)
    ?? readTrimmedString(sourcePackageJson?.name)
    ?? formatOfficialNpmPackageName(manifestName)
  if (!isValidNpmPackageName(candidateName)) {
    throw new RangeError(`Invalid npm package name: "${candidateName}"`)
  }

  const sdkapi = resolveSdkApiVersion(manifest.sdkapi) ?? CURRENT_SDK_VERSION
  const mainEntry = normalizeRelativeEntry(readTrimmedString(manifest.main) ?? 'index.js')
  const mainFilePath = mainEntry.slice(2)

  const keywordSet = new Set<string>([NPM_PLUGIN_CANONICAL_KEYWORD])
  if (manifestCategory)
    keywordSet.add(manifestCategory)
  if (Array.isArray(sourcePackageJson?.keywords)) {
    for (const kw of sourcePackageJson.keywords) {
      const normalized = readTrimmedString(kw)
      if (normalized)
        keywordSet.add(normalized)
    }
  }

  const fileList: string[] = []
  const fileSeen = new Set<string>()
  const addFile = (entry: string | null) => {
    if (!entry || fileSeen.has(entry))
      return
    fileSeen.add(entry)
    fileList.push(entry)
  }

  addFile('manifest.json')
  if (input.files && input.files.length > 0) {
    for (const entry of input.files) {
      addFile(normalizeStagedFileEntry(entry))
    }
  }
  else {
    addFile(mainFilePath)
    addFile('README.md')
    addFile('LICENSE')
  }

  const description = resolvePlainDescription(manifest.description, sourcePackageJson?.description)
  const author = (typeof sourcePackageJson?.author === 'string' && sourcePackageJson.author.trim())
    || isRecord(sourcePackageJson?.author)
    ? (sourcePackageJson.author as string | Record<string, unknown>)
    : readTrimmedString(manifest.author)
  const license = readTrimmedString(sourcePackageJson?.license)
  const homepage = readTrimmedString(sourcePackageJson?.homepage)
  const repository = (typeof sourcePackageJson?.repository === 'string' && sourcePackageJson.repository.trim())
    || isRecord(sourcePackageJson?.repository)
    ? (sourcePackageJson.repository as string | Record<string, unknown>)
    : undefined
  const bugs = (typeof sourcePackageJson?.bugs === 'string' && sourcePackageJson.bugs.trim())
    || isRecord(sourcePackageJson?.bugs)
    ? (sourcePackageJson.bugs as string | Record<string, unknown>)
    : undefined

  const sourcePublishConfig = isRecord(sourcePackageJson?.publishConfig)
    ? sourcePackageJson.publishConfig
    : undefined
  const access: 'public' | 'restricted' = input.access
    ?? (sourcePublishConfig?.access === 'restricted' ? 'restricted' : 'public')
  const publishRegistry = readTrimmedString(sourcePublishConfig?.registry)
  const safePublishRegistry = publishRegistry && isAllowedNpmRegistryUrl(publishRegistry)
    ? normalizeNpmRegistryUrl(publishRegistry)
    : undefined

  const displayName = normalizeLocalizedText(manifest.displayName)
  const icon = normalizeIcon(manifest.icon)
  const permissions = normalizePermissionsBlock(manifest.permissions)
  const platforms = inferPlatformsFromManifest(manifest)
  const surface = input.surface ?? inferSurfaceFromManifest(manifest, fileList)
  const activationKeywords = normalizeLocalizedList(manifest.activationKeywords)
  const fileMapSha256 = readTrimmedString(input.fileMapSha256)?.toLowerCase()
  if (fileMapSha256 && !SHA256_HEX_RE.test(fileMapSha256)) {
    throw new RangeError(`Invalid fileMapSha256 digest: "${input.fileMapSha256}"`)
  }

  const tuff: TuffNpmPackageMetadata = {
    schemaVersion: TUFF_NPM_METADATA_SCHEMA_VERSION,
    ...(manifestId ? { id: manifestId } : {}),
    name: manifestName,
    ...(displayName !== undefined ? { displayName } : {}),
    sdkapi,
    ...(manifestCategory ? { category: manifestCategory } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(permissions ? { permissions } : {}),
    ...(platforms ? { platforms } : {}),
    surface,
    manifest: './manifest.json',
    ...(activationKeywords ? { activationKeywords } : {}),
    ...(fileMapSha256 ? { integrity: { fileMapSha256 } } : {}),
  }

  return {
    name: candidateName,
    version: manifestVersion,
    description,
    ...(author !== undefined ? { author } : {}),
    ...(license ? { license } : {}),
    ...(homepage ? { homepage } : {}),
    ...(repository !== undefined ? { repository } : {}),
    ...(bugs !== undefined ? { bugs } : {}),
    keywords: [...keywordSet],
    main: mainEntry,
    exports: {
      '.': mainEntry,
      './manifest.json': './manifest.json',
      './package.json': './package.json',
    },
    files: fileList,
    dependencies: {},
    engines: {
      tuff: `>=${sdkapi}`,
    },
    publishConfig: {
      access,
      ...(safePublishRegistry ? { registry: safePublishRegistry } : {}),
    },
    tuff,
  }
}
