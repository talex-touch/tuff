export type NoisySystemAppRule = 'simulator' | 'coreservices-helper' | 'developer-support'

export interface NoisySystemAppInput {
  path?: string | null
  bundleId?: string | null
  name?: string | null
}

const BUNDLE_ID_ALLOWLIST = new Set([
  'com.apple.finder',
  'com.apple.systempreferences',
  'com.apple.safari'
])

const APP_NAME_ALLOWLIST = new Set(['finder', 'system settings', 'safari', 'google chrome'])

const CORESERVICES_NOISY_NAMES = new Set([
  'dischelper',
  'osduihelper',
  'tmhelperagent',
  'dwell control',
  'profilehelper',
  'corelocationagent'
])

const SIMULATOR_TOKENS = ['simulator', 'coresimulator', 'iphonesimulator']
const DEVELOPER_SUPPORT_TOKENS = ['install command line developer tools']

function normalize(value?: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function getAppNameFromPath(pathValue: string): string {
  if (!pathValue) {
    return ''
  }
  const fileName = pathValue.split('/').pop() ?? ''
  return normalize(fileName.endsWith('.app') ? fileName.slice(0, -4) : fileName)
}

export function matchNoisySystemAppRule(input: NoisySystemAppInput): NoisySystemAppRule | null {
  const path = normalize(input.path)
  const bundleId = normalize(input.bundleId)
  const name = normalize(input.name)
  const nameFromPath = getAppNameFromPath(path)

  if (!path && !bundleId && !name) {
    return null
  }

  if (
    BUNDLE_ID_ALLOWLIST.has(bundleId) ||
    APP_NAME_ALLOWLIST.has(name) ||
    APP_NAME_ALLOWLIST.has(nameFromPath)
  ) {
    return null
  }

  if (
    SIMULATOR_TOKENS.some(
      (token) =>
        bundleId.includes(token) ||
        path.includes(token) ||
        name.includes(token) ||
        nameFromPath.includes(token)
    )
  ) {
    return 'simulator'
  }

  const coreServiceAppName = name || nameFromPath
  if (path.startsWith('/system/library/coreservices/')) {
    if (
      coreServiceAppName.includes('helper') ||
      coreServiceAppName.includes('agent') ||
      CORESERVICES_NOISY_NAMES.has(coreServiceAppName)
    ) {
      return 'coreservices-helper'
    }
  }

  if (
    DEVELOPER_SUPPORT_TOKENS.some(
      (token) => path.includes(token) || name.includes(token) || nameFromPath.includes(token)
    )
  ) {
    return 'developer-support'
  }

  return null
}

export function isNoisySystemApp(input: NoisySystemAppInput): boolean {
  return matchNoisySystemAppRule(input) !== null
}
