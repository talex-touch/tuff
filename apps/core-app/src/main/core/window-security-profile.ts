export type WindowSecurityProfile = 'app' | 'trusted-plugin-view' | 'compat-plugin-view'

type ManagedWebPreferenceKey =
  | 'webSecurity'
  | 'nodeIntegration'
  | 'nodeIntegrationInSubFrames'
  | 'contextIsolation'
  | 'sandbox'
  | 'webviewTag'

export type WindowWebPreferenceOverrides = Omit<Electron.WebPreferences, ManagedWebPreferenceKey>

export interface WindowWebPreferenceOptions {
  enableWebviewTag?: boolean
}

const MANAGED_KEYS: ManagedWebPreferenceKey[] = [
  'webSecurity',
  'nodeIntegration',
  'nodeIntegrationInSubFrames',
  'contextIsolation',
  'sandbox',
  'webviewTag'
]

const APP_SECURITY_BASE: Required<Pick<Electron.WebPreferences, ManagedWebPreferenceKey>> = {
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webviewTag: false
}

const COMPAT_PLUGIN_VIEW_SECURITY_BASE: Required<
  Pick<Electron.WebPreferences, ManagedWebPreferenceKey>
> = {
  webSecurity: false,
  nodeIntegration: true,
  nodeIntegrationInSubFrames: true,
  contextIsolation: false,
  sandbox: false,
  webviewTag: true
}

function resolveProfileBase(
  profile: WindowSecurityProfile
): Required<Pick<Electron.WebPreferences, ManagedWebPreferenceKey>> {
  if (profile === 'compat-plugin-view') {
    return COMPAT_PLUGIN_VIEW_SECURITY_BASE
  }
  return APP_SECURITY_BASE
}

function stripManagedPreferences(
  overrides: Electron.WebPreferences
): WindowWebPreferenceOverrides {
  const safeOverrides = { ...overrides } as Electron.WebPreferences & Record<string, unknown>
  for (const key of MANAGED_KEYS) {
    delete safeOverrides[key]
  }
  return safeOverrides
}

export function buildWindowWebPreferences(
  profile: WindowSecurityProfile,
  overrides: WindowWebPreferenceOverrides = {},
  options: WindowWebPreferenceOptions = {}
): Electron.WebPreferences {
  const base = resolveProfileBase(profile)
  const safeOverrides = stripManagedPreferences(overrides as Electron.WebPreferences)

  return {
    ...base,
    ...safeOverrides,
    webviewTag: options.enableWebviewTag ?? base.webviewTag
  }
}
