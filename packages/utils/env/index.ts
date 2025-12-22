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
    }
  }

  const p: any = (globalThis as any).process
  if (p && p.env && typeof p.env === 'object') {
    for (const [k, v] of Object.entries(p.env)) {
      if (typeof v === 'string') {
        record[k] = v
      }
    }
  }

  return record
}

export function setRuntimeEnv(env: Record<string, string | undefined>): void {
  const g: any = globalThis as any
  g.__TUFF_ENV = { ...(g.__TUFF_ENV || {}), ...env }
}

export function getEnv(key: string): string | undefined {
  return readGlobalEnv()[key]
}

export function getEnvOrDefault(key: string, fallback: string): string {
  return getEnv(key) ?? fallback
}

export function getBooleanEnv(key: string, fallback = false): boolean {
  const raw = getEnv(key)
  if (raw === undefined) return fallback
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return fallback
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
