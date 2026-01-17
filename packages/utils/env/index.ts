export const NEXUS_BASE_URL = 'https://tuff.tagzxia.com'

export interface EnvLike {
  [key: string]: unknown
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

  const p: any = (globalThis as any).process
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
  return typeof process !== 'undefined'
    && Boolean((process as any)?.versions?.node)
}

export function isElectronRuntime(): boolean {
  return isNodeRuntime()
    && Boolean((process as any)?.versions?.electron)
}

export function isElectronRenderer(): boolean {
  return isElectronRuntime()
    && (process as any)?.type === 'renderer'
}

export function isElectronMain(): boolean {
  return isElectronRuntime()
    && ((process as any)?.type === 'browser' || !(process as any)?.type)
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
  return input.replace(/\/$/, '')
}

export function getTuffBaseUrl(): string {
  return normalizeBaseUrl(getEnvOrDefault('VITE_NEXUS_URL', NEXUS_BASE_URL))
}

export function getTelemetryApiBase(): string {
  const url = normalizeBaseUrl(getEnvOrDefault('NEXUS_API_BASE', NEXUS_BASE_URL))
  if (!url) {
    throw new Error('Telemetry API base URL is not configured')
  }
  return url
}

export function getTpexApiBase(): string {
  return normalizeBaseUrl(getEnvOrDefault('TPEX_API_BASE', NEXUS_BASE_URL))
}
