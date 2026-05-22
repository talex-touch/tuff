import type { NetworkConfigSnapshot, NetworkProxyConfig } from '@talex-touch/utils/network'
import type { NetworkConfigUpdateRequest } from '@talex-touch/utils/transport/events/types'

export type NetworkProxyMode = NetworkProxyConfig['mode']

export interface NetworkSettingsForm {
  proxyMode: NetworkProxyMode
  httpProxy: string
  httpsProxy: string
  socksProxy: string
  pacUrl: string
  bypassText: string
  authRef: string
  timeoutMs: number
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffFactor: number
  retryOnNetworkError: boolean
  retryOnTimeout: boolean
  failureThreshold: number
  cooldownMs: number
  autoResetOnSuccess: boolean
}

export const DEFAULT_NETWORK_SETTINGS_FORM: NetworkSettingsForm = Object.freeze({
  proxyMode: 'system',
  httpProxy: '',
  httpsProxy: '',
  socksProxy: '',
  pacUrl: '',
  bypassText: '',
  authRef: '',
  timeoutMs: 15000,
  maxRetries: 2,
  baseDelayMs: 400,
  maxDelayMs: 5000,
  backoffFactor: 2,
  retryOnNetworkError: true,
  retryOnTimeout: true,
  failureThreshold: 1,
  cooldownMs: 3000,
  autoResetOnSuccess: true
})

const DEFAULT_PROXY_CONFIG: NetworkProxyConfig = Object.freeze({
  mode: DEFAULT_NETWORK_SETTINGS_FORM.proxyMode,
  custom: {
    httpProxy: DEFAULT_NETWORK_SETTINGS_FORM.httpProxy,
    httpsProxy: DEFAULT_NETWORK_SETTINGS_FORM.httpsProxy,
    socksProxy: DEFAULT_NETWORK_SETTINGS_FORM.socksProxy,
    pacUrl: DEFAULT_NETWORK_SETTINGS_FORM.pacUrl,
    bypass: []
  },
  authRef: DEFAULT_NETWORK_SETTINGS_FORM.authRef
})

export function createDefaultNetworkSettingsForm(): NetworkSettingsForm {
  return { ...DEFAULT_NETWORK_SETTINGS_FORM }
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : fallback

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(min, Math.floor(parsed))
}

function normalizeProxyMode(value: unknown): NetworkProxyMode {
  if (value === 'direct' || value === 'custom') {
    return value
  }
  return 'system'
}

export function splitBypassRules(value: string): string[] {
  const seen = new Set<string>()
  const rules: string[] = []

  for (const item of value.split(/[\n,]+/)) {
    const rule = item.trim()
    if (!rule || seen.has(rule)) continue
    seen.add(rule)
    rules.push(rule)
  }

  return rules
}

export function joinBypassRules(rules: unknown): string {
  if (!Array.isArray(rules)) return ''
  return rules
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .join('\n')
}

export function toNetworkSettingsForm(
  config?: Partial<NetworkConfigSnapshot>
): NetworkSettingsForm {
  const proxy = config?.proxy ?? DEFAULT_PROXY_CONFIG
  const custom = proxy.custom ?? {}
  const retry = config?.retry ?? {}
  const cooldown = config?.cooldown ?? {}

  return {
    proxyMode: normalizeProxyMode(proxy.mode),
    httpProxy: typeof custom.httpProxy === 'string' ? custom.httpProxy : '',
    httpsProxy: typeof custom.httpsProxy === 'string' ? custom.httpsProxy : '',
    socksProxy: typeof custom.socksProxy === 'string' ? custom.socksProxy : '',
    pacUrl: typeof custom.pacUrl === 'string' ? custom.pacUrl : '',
    bypassText: joinBypassRules(custom.bypass),
    authRef: typeof proxy.authRef === 'string' ? proxy.authRef : '',
    timeoutMs: normalizeNumber(config?.timeoutMs, DEFAULT_NETWORK_SETTINGS_FORM.timeoutMs, 100),
    maxRetries: normalizeNumber(retry.maxRetries, DEFAULT_NETWORK_SETTINGS_FORM.maxRetries),
    baseDelayMs: normalizeNumber(retry.baseDelayMs, DEFAULT_NETWORK_SETTINGS_FORM.baseDelayMs),
    maxDelayMs: normalizeNumber(retry.maxDelayMs, DEFAULT_NETWORK_SETTINGS_FORM.maxDelayMs),
    backoffFactor: normalizeNumber(
      retry.backoffFactor,
      DEFAULT_NETWORK_SETTINGS_FORM.backoffFactor,
      1
    ),
    retryOnNetworkError:
      typeof retry.retryOnNetworkError === 'boolean'
        ? retry.retryOnNetworkError
        : DEFAULT_NETWORK_SETTINGS_FORM.retryOnNetworkError,
    retryOnTimeout:
      typeof retry.retryOnTimeout === 'boolean'
        ? retry.retryOnTimeout
        : DEFAULT_NETWORK_SETTINGS_FORM.retryOnTimeout,
    failureThreshold: normalizeNumber(
      cooldown.failureThreshold,
      DEFAULT_NETWORK_SETTINGS_FORM.failureThreshold,
      1
    ),
    cooldownMs: normalizeNumber(cooldown.cooldownMs, DEFAULT_NETWORK_SETTINGS_FORM.cooldownMs),
    autoResetOnSuccess:
      typeof cooldown.autoResetOnSuccess === 'boolean'
        ? cooldown.autoResetOnSuccess
        : DEFAULT_NETWORK_SETTINGS_FORM.autoResetOnSuccess
  }
}

export function toNetworkConfigUpdateRequest(
  form: NetworkSettingsForm
): NetworkConfigUpdateRequest {
  const maxRetries = normalizeNumber(form.maxRetries, DEFAULT_NETWORK_SETTINGS_FORM.maxRetries)
  const baseDelayMs = normalizeNumber(form.baseDelayMs, DEFAULT_NETWORK_SETTINGS_FORM.baseDelayMs)
  const maxDelayMs = Math.max(
    baseDelayMs,
    normalizeNumber(form.maxDelayMs, DEFAULT_NETWORK_SETTINGS_FORM.maxDelayMs)
  )

  return {
    proxy: {
      mode: normalizeProxyMode(form.proxyMode),
      custom: {
        httpProxy: form.httpProxy.trim(),
        httpsProxy: form.httpsProxy.trim(),
        socksProxy: form.socksProxy.trim(),
        pacUrl: form.pacUrl.trim(),
        bypass: splitBypassRules(form.bypassText)
      },
      authRef: form.authRef
    },
    retry: {
      maxRetries,
      baseDelayMs,
      maxDelayMs,
      backoffFactor: normalizeNumber(
        form.backoffFactor,
        DEFAULT_NETWORK_SETTINGS_FORM.backoffFactor,
        1
      ),
      retryOnNetworkError: form.retryOnNetworkError,
      retryOnTimeout: form.retryOnTimeout
    },
    cooldown: {
      failureThreshold: normalizeNumber(
        form.failureThreshold,
        DEFAULT_NETWORK_SETTINGS_FORM.failureThreshold,
        1
      ),
      cooldownMs: normalizeNumber(form.cooldownMs, DEFAULT_NETWORK_SETTINGS_FORM.cooldownMs),
      autoResetOnSuccess: form.autoResetOnSuccess
    },
    timeoutMs: normalizeNumber(form.timeoutMs, DEFAULT_NETWORK_SETTINGS_FORM.timeoutMs, 100)
  }
}
