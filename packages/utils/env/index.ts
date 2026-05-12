export const NEXUS_BASE_URL = 'https://tuff.tagzxia.com'
export const NEXUS_LOCAL_BASE_URL = 'http://localhost:3200'
export const TUFF_NEXUS_BASE_URL_ENV = 'TUFF_NEXUS_BASE_URL'

export type TuffNexusRuntimeServer = 'production' | 'local'

export interface EnvLike {
  [key: string]: unknown
}

function getProcess(): any {
  return (globalThis as any)?.process
}

function readGlobalEnv(): Record<string, string | undefined> {
  const g: any = globalThis as any
  const fromGlobal = g.__TUFF_ENV && typeof g.__TUFF_ENV === 'object' ? g.__TUFF_ENV : null
  const record: Record<string, string | undefined> = {}

  if (fromGlobal) {
    for (const [k, v] of Object.entries(fromGlobal)) {
      if (typeof v === 'string') {
        record[k] = v
      }
      else if (typeof v === 'number' || typeof v === 'boolean') {
        record[k] = String(v)
      }
    }
  }

  const p: any = getProcess()
  if (p && p.env && typeof p.env === 'object') {
    for (const [k, v] of Object.entries(p.env)) {
      if (typeof v === 'string') {
        record[k] = v
      }
      else if (typeof v === 'number' || typeof v === 'boolean') {
        record[k] = String(v)
      }
    }
  }

  return record
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

export function getEnv(key: string): string | undefined {
  return readGlobalEnv()[key]
}

export function getEnvOrDefault(key: string, fallback: string): string {
  return getEnv(key) ?? fallback
}

export function getBooleanEnv(key: string, fallback = false): boolean {
  const raw = getEnv(key)
  if (raw === undefined)
    return fallback
  if (raw === '1' || raw === 'true')
    return true
  if (raw === '0' || raw === 'false')
    return false
  return fallback
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
  env?: EnvLike
}

export function resolveTuffNexusBaseUrl(options: TuffNexusBaseUrlOptions = {}): string {
  const explicit = readEnvValue(options.env, TUFF_NEXUS_BASE_URL_ENV)?.trim()
  if (explicit)
    return normalizeBaseUrl(explicit)

  return options.runtimeServer === 'local'
    ? normalizeBaseUrl(NEXUS_LOCAL_BASE_URL)
    : normalizeBaseUrl(NEXUS_BASE_URL)
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
