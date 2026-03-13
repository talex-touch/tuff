import type { H3Event } from 'h3'
import process from 'node:process'

const DEV_DEFAULT_NEXUS_ORIGIN = 'http://127.0.0.1:3200'
const PROD_DEFAULT_NEXUS_ORIGIN = 'https://tuff.tagzxia.com'

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

function resolveProcessConfigString(envKeys: string[]): string {
  for (const envKey of envKeys) {
    const fromProcess = toStringValue(process.env[envKey])
    if (fromProcess) {
      return fromProcess
    }
  }
  return ''
}

function resolveRuntimeConfigString(event: H3Event, runtimeKey: string): string {
  const pilotConfig = getPilotRuntimeConfig(event)
  return toStringValue(pilotConfig[runtimeKey])
}

export function resolvePilotConfigString(
  event: H3Event,
  runtimeKey: string,
  envKeys: string[],
  fallback = '',
): string {
  const fromProcess = resolveProcessConfigString(envKeys)
  if (fromProcess) {
    return fromProcess
  }

  const fromRuntimeConfig = resolveRuntimeConfigString(event, runtimeKey)
  if (fromRuntimeConfig) {
    return fromRuntimeConfig
  }

  return fallback
}

function isDevelopmentRuntime(): boolean {
  return toStringValue(process.env.NODE_ENV).toLowerCase() !== 'production'
}

function defaultPilotNexusOrigin(): string {
  return isDevelopmentRuntime() ? DEV_DEFAULT_NEXUS_ORIGIN : PROD_DEFAULT_NEXUS_ORIGIN
}

export interface ResolvePilotNexusOriginOptions {
  internal?: boolean
}

export function resolvePilotNexusOrigin(
  event: H3Event,
  _options: ResolvePilotNexusOriginOptions = {},
): string {
  const fallback = defaultPilotNexusOrigin()
  return resolvePilotConfigString(event, 'nexusOrigin', ['NUXT_PUBLIC_NEXUS_ORIGIN'], fallback)
}
