/**
 * Permission policy for `session.defaultSession`.
 *
 * The only permission handlers in the app were on the per-plugin session, which
 * denies everything. defaultSession — shared by the main window, CoreBox,
 * Assistant, Screenshot and OmniPanel — had none, and Electron's default is to
 * approve, so a script in the privileged renderer could take camera, microphone,
 * geolocation or clipboard-read with no prompt and no policy (#696).
 *
 * An allowlist rather than the plugin session's blanket deny: the renderer does
 * legitimately use three of these. What it uses was enumerated from the renderer
 * source, and each entry below names the caller so the list can be re-checked
 * when those features move.
 */

/** Permissions the app's own renderer actually needs. */
const ALLOWED_PERMISSIONS = new Set<string>([
  // views/assistant/VoicePanel.vue — getUserMedia for voice input. Audio only;
  // see isVideoRequest below, since Electron's 'media' covers the camera too.
  'media',
  // IntelligenceProviderHeader.vue, PluginDetails.vue, PluginFeatures.vue, …
  'clipboard-read',
  'clipboard-sanitized-write',
  // Renderer-side new Notification(...)
  'notifications'
])

interface MediaDetails {
  mediaTypes?: readonly string[]
}

/**
 * Electron reports camera and microphone under the single 'media' permission, so
 * allowing voice input would otherwise allow the camera. The renderer has no
 * camera caller at all, so any request naming video is refused.
 */
function isVideoRequest(permission: string, details?: MediaDetails): boolean {
  return permission === 'media' && Boolean(details?.mediaTypes?.includes('video'))
}

export function isDefaultSessionPermissionAllowed(
  permission: string,
  details?: MediaDetails
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false
  return !isVideoRequest(permission, details)
}

interface PermissionCapableSession {
  setPermissionCheckHandler: (
    handler:
      | ((
          webContents: unknown,
          permission: string,
          requestingOrigin: string,
          details: unknown
        ) => boolean)
      | null
  ) => void
  setPermissionRequestHandler: (
    handler:
      | ((
          webContents: unknown,
          permission: string,
          callback: (granted: boolean) => void,
          details: unknown
        ) => void)
      | null
  ) => void
}

export interface InstallDefaultSessionPermissionPolicyOptions {
  onDenied?: (permission: string) => void
}

/**
 * Installs both handlers. Both are required: setPermissionRequestHandler covers
 * the prompt path, setPermissionCheckHandler the synchronous query path, and
 * leaving either unset falls back to Electron's approve-by-default.
 */
export function installDefaultSessionPermissionPolicy(
  targetSession: PermissionCapableSession,
  options: InstallDefaultSessionPermissionPolicyOptions = {}
): void {
  const decide = (permission: string, details?: MediaDetails): boolean => {
    const allowed = isDefaultSessionPermissionAllowed(permission, details)
    if (!allowed) options.onDenied?.(permission)
    return allowed
  }

  targetSession.setPermissionCheckHandler((_webContents, permission, _origin, details) =>
    decide(permission, details as MediaDetails | undefined)
  )

  targetSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(decide(permission, details as MediaDetails | undefined))
  })
}
