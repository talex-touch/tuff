import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const PILOT_ENV_PRECEDENCE_FILES = ['.env', '.env.dev', '.env.prod', '.env.local'] as const

const PILOT_ENV_KEY_PATTERN = /^[A-Z_]\w*$/i
const PILOT_ENV_CACHE_KEY = '__pilotEnvPrecedenceApplied'

type GlobalPilotEnvCache = typeof globalThis & {
  [PILOT_ENV_CACHE_KEY]?: boolean
}

function stripEnvWrappingQuotes(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  const quote = trimmed[0]
  const isWrapped = (quote === '\'' || quote === '"') && trimmed.endsWith(quote)
  if (!isWrapped) {
    return trimmed
  }
  return trimmed.slice(1, -1)
}

function parseEnvAssignment(line: string): { key: string, value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed
  const splitIndex = normalized.indexOf('=')
  if (splitIndex <= 0) {
    return null
  }

  const key = normalized.slice(0, splitIndex).trim()
  if (!PILOT_ENV_KEY_PATTERN.test(key)) {
    return null
  }

  const value = stripEnvWrappingQuotes(normalized.slice(splitIndex + 1))
  return { key, value }
}

function loadPilotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvAssignment(line)
    if (!parsed) {
      continue
    }
    process.env[parsed.key] = parsed.value
  }
}

function resolvePilotEnvRoot(): string {
  const fromProcess = String(process.env.PILOT_ENV_ROOT || '').trim()
  const fromModule = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const fromCwd = process.cwd()
  const candidates = [
    fromProcess,
    fromCwd,
    resolve(fromCwd, 'apps/pilot'),
    resolve(fromCwd, '../apps/pilot'),
    fromModule,
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const hasEnvFile = PILOT_ENV_PRECEDENCE_FILES.some(fileName => existsSync(resolve(candidate, fileName)))
    if (hasEnvFile) {
      return candidate
    }
  }

  return fromCwd
}

export function applyPilotEnvPrecedence(): void {
  const pilotRoot = resolvePilotEnvRoot()
  for (const fileName of PILOT_ENV_PRECEDENCE_FILES) {
    loadPilotEnvFile(resolve(pilotRoot, fileName))
  }
}

export function ensurePilotEnvPrecedenceApplied(): void {
  const globalCache = globalThis as GlobalPilotEnvCache
  if (globalCache[PILOT_ENV_CACHE_KEY]) {
    return
  }
  applyPilotEnvPrecedence()
  globalCache[PILOT_ENV_CACHE_KEY] = true
}
