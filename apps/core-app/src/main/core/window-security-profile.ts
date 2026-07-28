export type WindowSecurityProfile = 'app' | 'trusted-plugin-view'

type ManagedWebPreferenceKey =
  | 'webSecurity'
  | 'nodeIntegration'
  | 'nodeIntegrationInSubFrames'
  | 'contextIsolation'
  | 'sandbox'
  | 'webviewTag'

export type WindowWebPreferenceOverrides = Omit<Electron.WebPreferences, ManagedWebPreferenceKey>

const MANAGED_KEYS: ManagedWebPreferenceKey[] = [
  'webSecurity',
  'nodeIntegration',
  'nodeIntegrationInSubFrames',
  'contextIsolation',
  'sandbox',
  'webviewTag'
]

const SECURITY_BASE: Required<Pick<Electron.WebPreferences, ManagedWebPreferenceKey>> = {
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webviewTag: false
}

function stripManagedPreferences(overrides: Electron.WebPreferences): WindowWebPreferenceOverrides {
  const safeOverrides = { ...overrides } as Electron.WebPreferences & Record<string, unknown>
  for (const key of MANAGED_KEYS) {
    delete safeOverrides[key]
  }
  return safeOverrides
}

export function buildWindowWebPreferences(
  _profile: WindowSecurityProfile,
  overrides: WindowWebPreferenceOverrides = {}
): Electron.WebPreferences {
  const safeOverrides = stripManagedPreferences(overrides as Electron.WebPreferences)
  return {
    ...SECURITY_BASE,
    ...safeOverrides
  }
}
