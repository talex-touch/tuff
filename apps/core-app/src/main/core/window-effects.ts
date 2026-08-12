export function shouldApplyMicaFallback(platform: NodeJS.Platform, isMicaWindow: boolean): boolean {
  return platform === 'win32' && !isMicaWindow
}

/**
 * Opaque colour used when transparency is given up. Same value as
 * ScreenshotEditorWindowOption, which is the one window option that already ships the
 * `transparent: false` plus explicit `backgroundColor` pair.
 */
export const OPAQUE_WINDOW_BACKGROUND = '#111315'

/**
 * Environment variable that forces every window opaque.
 *
 * Electron offers no way to ask a Linux session whether it has a compositor, and the effects
 * chain has no Linux branch at all: darwin gets vibrancy, win32 gets mica, Linux falls
 * through. Six of the eight window option sets request `transparent: true` with no
 * `backgroundColor`, and AppImage and deb are shipped targets — so on a session without ARGB
 * visuals those windows paint black or invisible (#806).
 *
 * The audit suggested making Linux opaque unconditionally. That is deliberately not done
 * here: most Linux desktops do run a compositor, and a blanket default would flatten the
 * launcher's translucency for all of them to protect the ones that cannot show it.
 *
 * What is actually missing is not a different default — it is a way out. Someone who cannot
 * see the launcher cannot click a setting to fix it, so the recovery has to be reachable
 * from outside the UI.
 */
export const OPAQUE_WINDOW_ENV_VAR = 'TUFF_OPAQUE_WINDOWS'

export function shouldForceOpaqueWindow(env: NodeJS.ProcessEnv): boolean {
  const raw = env[OPAQUE_WINDOW_ENV_VAR]
  return raw === '1' || raw === 'true'
}

/**
 * Applies the opaque fallback to a window's construction options.
 *
 * Returns the options untouched unless the escape hatch is set, so the default behaviour on
 * every platform is exactly what it was.
 *
 * Only windows that ask for transparency *without* naming a `backgroundColor` are converted —
 * the same set the transparent-window ratchet counts. A window that names its own colour has
 * made a decision worth keeping: ScreenshotOverlayWindowOption asks for `#00000000` because a
 * capture overlay you cannot see through is a capture overlay you cannot use, and forcing it
 * opaque would trade an invisible launcher for an unusable screenshot tool.
 */
export function withOpaqueFallback<T extends { transparent?: boolean; backgroundColor?: string }>(
  options: T | undefined,
  env: NodeJS.ProcessEnv
): T | undefined {
  if (!options || !shouldForceOpaqueWindow(env)) return options
  if (options.transparent !== true || options.backgroundColor !== undefined) return options

  return {
    ...options,
    transparent: false,
    backgroundColor: OPAQUE_WINDOW_BACKGROUND
  }
}
