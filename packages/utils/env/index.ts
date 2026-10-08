export const NEXUS_BASE_URL = 'https://tuff.tagzxia.com'
export const NEXUS_LOCAL_BASE_URL = 'http://localhost:3200'
export const TUFF_NEXUS_BASE_URL_ENV = 'TUFF_NEXUS_BASE_URL'

export type TuffNexusRuntimeServer = 'production' | 'local'

/**
 * Which input won the base-URL resolution, in the order they are consulted.
 *
 * Reported to the settings page so it can explain why a saved address is not the one in effect.
 */
export type TuffNexusBaseUrlSource = 'env' | 'custom' | 'runtime-server'

export interface EnvLike {
  [key: string]: unknown
}

function getProcess(): any {
  return (globalThis as any)?.process
}


export function setRuntimeEnv(env: Record<string, string | undefined>): void {
  const g: any = globalThis as any
  const normalized: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env ?? {})) {
    if (typeof v === 'string') {
      normalized[k] = v
    }
    else if (typeof v === 'number' || typeof v === 'boolean') {
      normalized[k] = String(v)
    }
  }
  g.__TUFF_ENV = { ...(g.__TUFF_ENV || {}), ...normalized }
}

function normalizeEnvValue(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return undefined
}

/** One key, without copying the whole environment: `process.env` wins over `__TUFF_ENV`. */
export function getEnv(key: string): string | undefined {
  const fromProcess = normalizeEnvValue(getProcess()?.env?.[key])
  if (fromProcess !== undefined)
    return fromProcess
  const g: any = globalThis as any
  const fromGlobal = g.__TUFF_ENV && typeof g.__TUFF_ENV === 'object' ? g.__TUFF_ENV[key] : undefined
  return normalizeEnvValue(fromGlobal)
}

export function getEnvOrDefault(key: string, fallback: string): string {
  return getEnv(key) ?? fallback
}

/**
 * The one spelling of a boolean flag: `1`/`true`/`yes`/`on` (any case, trimmed) is on,
 * `0`/`false`/`no`/`off` is off, anything else — including unset — is the fallback.
 */
export function parseBooleanFlag(value: string | undefined, fallback = false): boolean {
  if (typeof value !== 'string')
    return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off')
    return false
  return fallback
}

export function getBooleanEnv(key: string, fallback = false): boolean {
  return parseBooleanFlag(getEnv(key), fallback)
}

export function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

export function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

export function hasNavigator(): boolean {
  return typeof navigator !== 'undefined'
}

export type RuntimePlatform = 'darwin' | 'win32' | 'linux' | 'unknown'

export interface RuntimePlatformInput {
  startupPlatform?: string | null
  electronPlatform?: string | null
  navigatorPlatform?: string | null
  userAgent?: string | null
}

function normalizeRuntimePlatform(value: string | null | undefined): RuntimePlatform | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized)
    return null
  if (normalized === 'darwin' || normalized === 'mac' || normalized === 'macos')
    return 'darwin'
  if (normalized === 'win32' || normalized === 'windows' || normalized === 'win')
    return 'win32'
  if (normalized === 'linux')
    return 'linux'
  return null
}

function inferBrowserPlatform(input: RuntimePlatformInput): RuntimePlatform | null {
  const platformText = typeof input.navigatorPlatform === 'string' ? input.navigatorPlatform.toLowerCase() : ''
  const agentText = typeof input.userAgent === 'string' ? input.userAgent.toLowerCase() : ''
  const combined = `${platformText} ${agentText}`.trim()
  if (!combined)
    return null
  if (
    combined.includes('mac')
    || combined.includes('iphone')
    || combined.includes('ipad')
    || combined.includes('ipod')
  ) {
    return 'darwin'
  }
  if (combined.includes('win'))
    return 'win32'
  if (combined.includes('linux') || combined.includes('x11'))
    return 'linux'
  return null
}

/** Resolve OS identity, never CPU architecture, with native hints ahead of browser hints. */
export function resolveRuntimePlatform(input: RuntimePlatformInput = {}): RuntimePlatform {
  return normalizeRuntimePlatform(input.startupPlatform)
    || normalizeRuntimePlatform(input.electronPlatform)
    || inferBrowserPlatform(input)
    || 'unknown'
}

export function isBrowserRuntime(): boolean {
  return hasWindow() && hasDocument()
}

export function isNodeRuntime(): boolean {
  const proc: any = getProcess()
  return typeof proc !== 'undefined'
    && Boolean(proc?.versions?.node)
}

export function isElectronRuntime(): boolean {
  const proc: any = getProcess()
  return Boolean(proc?.versions?.electron)
}

export function isElectronRenderer(): boolean {
  const proc: any = getProcess()
  if (Boolean(proc?.versions?.electron) && proc?.type === 'renderer') {
    return true
  }

  const g: any = globalThis as any
  const maybeWindow = g.window
  return Boolean(maybeWindow?.electron?.ipcRenderer || g.electron?.ipcRenderer)
}

export function isElectronMain(): boolean {
  const proc: any = getProcess()
  return Boolean(proc?.versions?.electron)
    && (proc?.type === 'browser' || !proc?.type)
}

export function isDevEnv(): boolean {
  const nodeEnv = getEnv('NODE_ENV')
  if (nodeEnv) {
    return nodeEnv === 'development' || nodeEnv === 'test'
  }
  const mode = getEnv('MODE') || getEnv('VITE_MODE')
  if (mode) {
    return mode === 'development'
  }
  return getBooleanEnv('DEV', false)
}

export function isProdEnv(): boolean {
  const nodeEnv = getEnv('NODE_ENV')
  if (nodeEnv) {
    return nodeEnv === 'production'
  }
  const mode = getEnv('MODE') || getEnv('VITE_MODE')
  if (mode) {
    return mode === 'production'
  }
  return getBooleanEnv('PROD', false)
}

export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '')
}

function readEnvValue(env: EnvLike | undefined, key: string): string | undefined {
  if (!env)
    return getEnv(key)
  const value = env[key]
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return undefined
}

export interface TuffNexusBaseUrlOptions {
  runtimeServer?: TuffNexusRuntimeServer
  /** User-chosen Nexus base URL from settings; ignored when it no longer validates. */
  customBaseUrl?: string | null
  env?: EnvLike
}

export interface TuffNexusBaseUrlResolution {
  baseUrl: string
  source: TuffNexusBaseUrlSource
}

export type NexusBaseUrlValidationError =
  | 'empty'
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'embedded-credentials'
  | 'unsupported-path'
  | 'insecure-transport'

export type NexusBaseUrlValidation
  = | { ok: true; value: string }
    | { ok: false; error: NexusBaseUrlValidationError }

/**
 * Validates a Nexus base URL a user typed into settings.
 *
 * Plain `http` is only accepted for loopback hosts: every Nexus request may carry the account
 * bearer token, so cleartext to a remote host would hand it to the network. The address must be a
 * bare origin — no path, query, fragment or embedded credentials — because the rest of the client
 * composes request URLs from it with `new URL('/api/…', base)`, which discards any base path and
 * would silently target a different deployment than the one that was configured. The normalized
 * form is what callers persist and compare.
 */
export function validateNexusBaseUrl(input: unknown): NexusBaseUrlValidation {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) {
    return { ok: false, error: 'empty' }
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, error: 'invalid-url' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'unsupported-protocol' }
  }

  if (parsed.username || parsed.password) {
    // `https://user:secret@host` would be written to settings — and to the synced settings
    // document — in cleartext, and this client authenticates with a bearer token instead.
    return { ok: false, error: 'embedded-credentials' }
  }

  const loopback =
    parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '::1'
    || parsed.hostname === '[::1]'
  if (parsed.protocol === 'http:' && !loopback) {
    return { ok: false, error: 'insecure-transport' }
  }

  if (parsed.search || parsed.hash) {
    return { ok: false, error: 'invalid-url' }
  }

  if (parsed.pathname.replace(/\/+$/, '')) {
    // A path cannot be honoured: request paths are absolute (`/api/…`), so the base path would be
    // dropped and the request would go to the origin root — a different deployment than the user
    // configured, with no visible symptom until something 404s.
    return { ok: false, error: 'unsupported-path' }
  }

  return { ok: true, value: normalizeBaseUrl(parsed.toString()) }
}

/**
 * Resolves the base URL together with which input produced it.
 *
 * `TUFF_NEXUS_BASE_URL` is the build/CI override that lets a packaged app or the CLI point at an
 * arbitrary host, including plain-http test servers, so it may name a host the settings page would
 * never accept. It is not trusted blindly: it reaches the same request composition as a saved
 * address, so it is held to the same transport rule — an `http://` override would attach the
 * account token to a cleartext request. An override that does not validate is ignored rather than
 * fatal, which keeps the app on an origin it can trust instead of failing to start.
 */
export function resolveTuffNexusBaseUrlDetail(
  options: TuffNexusBaseUrlOptions = {}
): TuffNexusBaseUrlResolution {
  const explicit = readEnvValue(options.env, TUFF_NEXUS_BASE_URL_ENV)?.trim()
  if (explicit) {
    const validation = validateNexusBaseUrl(explicit)
    if (validation.ok) {
      return { baseUrl: validation.value, source: 'env' }
    }
  }

  const custom = options.customBaseUrl
  if (typeof custom === 'string' && custom.trim()) {
    const validation = validateNexusBaseUrl(custom)
    // A stored value that no longer validates must not steer the app: reaching an origin the
    // settings page itself rejects is worse than silently falling back (hand-edited config, or
    // rules tightened by a later version).
    if (validation.ok) {
      return { baseUrl: validation.value, source: 'custom' }
    }
  }

  return {
    baseUrl: normalizeBaseUrl(
      options.runtimeServer === 'local' ? NEXUS_LOCAL_BASE_URL : NEXUS_BASE_URL
    ),
    source: 'runtime-server'
  }
}

export function resolveTuffNexusBaseUrl(options: TuffNexusBaseUrlOptions = {}): string {
  return resolveTuffNexusBaseUrlDetail(options).baseUrl
}

export function getTuffBaseUrl(): string {
  return resolveTuffNexusBaseUrl()
}

export function getTelemetryApiBase(): string {
  return resolveTuffNexusBaseUrl()
}

export function getTpexApiBase(): string {
  return resolveTuffNexusBaseUrl()
}

/**
 * The `dev` block of app settings, as it exists on disk rather than as declared.
 *
 * `authServer` is the name this setting shipped under before it also selected the runtime backend
 * for non-auth calls. Installations from that era still hold it, so every reader has to migrate.
 */
export interface TuffNexusRuntimeServerSettings {
  authServer?: TuffNexusRuntimeServer
  runtimeServer?: TuffNexusRuntimeServer
}

/** Unknown values become 'production'; only an explicit 'local' opts out. */
export function normalizeTuffNexusRuntimeServer(value: unknown): TuffNexusRuntimeServer {
  return value === 'local' ? 'local' : 'production'
}

/**
 * Resolves the runtime backend and migrates the legacy key in place.
 *
 * Shared because both processes make this decision independently — main from the config file,
 * renderer from the reactive settings object — and a disagreement means the two halves of one app
 * talk to different backends. Only the policy is shared; how each side obtains and persists `dev`
 * is genuinely different and stays where it is.
 *
 * Mutates: `runtimeServer` is written back normalized and `authServer` is dropped, so a caller that
 * persists `dev` afterwards completes the migration.
 */
export function migrateTuffNexusRuntimeServer(
  dev: TuffNexusRuntimeServerSettings
): TuffNexusRuntimeServer {
  const next = dev.runtimeServer ?? dev.authServer ?? 'production'
  dev.runtimeServer = normalizeTuffNexusRuntimeServer(next)
  delete dev.authServer
  return dev.runtimeServer
}
