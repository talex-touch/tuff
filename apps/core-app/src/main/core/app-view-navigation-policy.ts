/**
 * Navigation guards for WebContentsViews built with the `app` security profile.
 *
 * Plugin views get installPluginViewNavigationPolicy; these got nothing. MetaOverlay never
 * installed guards at all, and plugin-view-controller and division-box only install the plugin
 * policy when a plugin is present - with no plugin, the view runs the app profile with no
 * window-open handler and no navigation restriction (#793).
 *
 * The rule is deliberately narrow: an app view only ever shows this application's own renderer,
 * so anything that is not that entry is refused rather than allow-listed case by case.
 */

export interface AppViewNavigationPolicy {
  /** The renderer entry this view is allowed to be: a dev server URL or a packaged file: URL. */
  entryUrl: string
}

/**
 * A target is allowed when it is the same document as the entry.
 *
 * Hash and query are ignored: the renderer routes with `#/meta-overlay` and friends, so treating
 * a hash change as a navigation would break the views this is protecting. Origin and pathname
 * are what must not move.
 */
export function isAppViewNavigationAllowed(
  policy: AppViewNavigationPolicy,
  targetUrl: string
): boolean {
  let target: URL
  let entry: URL
  try {
    target = new URL(targetUrl)
    entry = new URL(policy.entryUrl)
  } catch {
    return false
  }

  if (target.protocol !== entry.protocol) return false
  if (target.origin !== entry.origin) return false

  // file: URLs share the opaque 'null' origin, so the path is the only thing separating the
  // app's own index.html from any other file on disk.
  return target.pathname === entry.pathname
}

export function installAppViewNavigationPolicy(
  webContents: Electron.WebContents,
  policy: AppViewNavigationPolicy
): void {
  webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAppViewNavigationAllowed(policy, targetUrl)) {
      event.preventDefault()
    }
  })

  webContents.on('will-frame-navigate', (details) => {
    if (!isAppViewNavigationAllowed(policy, details.url)) {
      details.preventDefault()
    }
  })

  // Nothing in an app view has a reason to open a window; the app creates its own.
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}
