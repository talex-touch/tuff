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

type ManagedPreferences = Required<Pick<Electron.WebPreferences, ManagedWebPreferenceKey>>

/** The strictest set Electron offers. Every profile starts here; none is allowed to leave it. */
const SECURITY_BASE: ManagedPreferences = {
  webSecurity: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webviewTag: false
}

/**
 * One baseline per profile.
 *
 * The two are identical today, and the point of writing them out separately is that they stay
 * separable: `buildWindowWebPreferences` previously ignored its profile argument, so 'app' and
 * 'trusted-plugin-view' produced byte-identical preferences and the API advertised a tiering that
 * did not exist. A future relaxation of the plugin-view profile would have silently applied to
 * every window in the app, including the main one (#792).
 *
 * `window-security-profile.contract.test.ts` asserts every profile still matches SECURITY_BASE, so
 * a divergence has to be deliberate rather than inherited.
 */
const SECURITY_BASELINES: Record<WindowSecurityProfile, ManagedPreferences> = {
  app: { ...SECURITY_BASE },
  'trusted-plugin-view': { ...SECURITY_BASE }
}

function stripManagedPreferences(overrides: Electron.WebPreferences): WindowWebPreferenceOverrides {
  const safeOverrides = { ...overrides } as Electron.WebPreferences & Record<string, unknown>
  for (const key of MANAGED_KEYS) {
    delete safeOverrides[key]
  }
  return safeOverrides
}

export function buildWindowWebPreferences(
  profile: WindowSecurityProfile,
  overrides: WindowWebPreferenceOverrides = {}
): Electron.WebPreferences {
  const safeOverrides = stripManagedPreferences(overrides as Electron.WebPreferences)
  // Unknown profile falls back to the strict base rather than to `undefined`. Indexing the record
  // directly would spread nothing and hand back preferences with no managed keys at all — which is
  // how a retired profile name reaching runtime turns into an unsandboxed window.
  const baseline = SECURITY_BASELINES[profile] ?? SECURITY_BASE
  return {
    ...baseline,
    ...safeOverrides
  }
}
