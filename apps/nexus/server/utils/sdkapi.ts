import {
  CURRENT_SDK_VERSION,
  SUPPORTED_SDK_VERSIONS,
  isValidSdkVersion,
  parseSdkVersion,
} from '@talex-touch/utils/plugin'

export type SdkapiStatusLevel = 'ok' | 'warning' | 'error'

export type SdkapiStatusCode =
  | 'SDK_VERSION_OK'
  | 'SDK_VERSION_MISSING'
  | 'SDK_VERSION_INVALID'
  | 'SDK_VERSION_UNSUPPORTED'
  | 'SDK_VERSION_TOO_NEW'
  | 'SDK_VERSION_TOO_OLD'

export interface SdkapiStatus {
  level: SdkapiStatusLevel
  code: SdkapiStatusCode
  message: string
  suggestion?: string
  declared?: number | string
  resolved?: number
  current: number
}

const MIN_SDK_VERSION = CURRENT_SDK_VERSION

function normalizeSdkapi(raw: unknown): number | undefined {
  if (typeof raw === 'number')
    return raw
  if (typeof raw === 'string')
    return parseSdkVersion(raw)
  return undefined
}

export function evaluateSdkapi(manifest: Record<string, unknown> | null): SdkapiStatus {
  const declaredRaw = manifest?.sdkapi
  const declared = typeof declaredRaw === 'string' || typeof declaredRaw === 'number'
    ? declaredRaw
    : undefined

  if (declaredRaw === undefined || declaredRaw === null) {
    return {
      level: 'error',
      code: 'SDK_VERSION_MISSING',
      message: 'Plugin manifest is missing "sdkapi".',
      suggestion: `Add "sdkapi": ${CURRENT_SDK_VERSION} to manifest.json.`,
      current: CURRENT_SDK_VERSION,
    }
  }

  const parsed = normalizeSdkapi(declaredRaw)
  if (parsed === undefined || !isValidSdkVersion(parsed)) {
    return {
      level: 'error',
      code: 'SDK_VERSION_INVALID',
      message: `Invalid sdkapi value: ${String(declaredRaw)}.`,
      suggestion: `Use YYMMDD format (e.g., ${CURRENT_SDK_VERSION}).`,
      declared,
      current: CURRENT_SDK_VERSION,
    }
  }

  if (!SUPPORTED_SDK_VERSIONS.includes(parsed)) {
    return {
      level: 'error',
      code: 'SDK_VERSION_UNSUPPORTED',
      message: `Unsupported sdkapi version: ${parsed}.`,
      suggestion: `Use a supported version, latest is ${CURRENT_SDK_VERSION}.`,
      declared,
      resolved: parsed,
      current: CURRENT_SDK_VERSION,
    }
  }

  if (parsed > CURRENT_SDK_VERSION) {
    return {
      level: 'error',
      code: 'SDK_VERSION_TOO_NEW',
      message: `sdkapi ${parsed} is newer than the current SDK (${CURRENT_SDK_VERSION}).`,
      suggestion: 'Upgrade Tuff to install this plugin.',
      declared,
      resolved: parsed,
      current: CURRENT_SDK_VERSION,
    }
  }

  if (parsed < MIN_SDK_VERSION) {
    return {
      level: 'error',
      code: 'SDK_VERSION_TOO_OLD',
      message: `sdkapi ${parsed} is lower than the required minimum (${MIN_SDK_VERSION}).`,
      suggestion: `Update sdkapi to ${CURRENT_SDK_VERSION} to publish.`,
      declared,
      resolved: parsed,
      current: CURRENT_SDK_VERSION,
    }
  }

  return {
    level: 'ok',
    code: 'SDK_VERSION_OK',
    message: `sdkapi ${parsed} is compatible.`,
    declared,
    resolved: parsed,
    current: CURRENT_SDK_VERSION,
  }
}
