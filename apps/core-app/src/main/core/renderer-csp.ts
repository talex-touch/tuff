import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Enforcing Content-Security-Policy builder and `webRequest.onHeadersReceived` installer for the
 * CoreApp renderer (#689).
 *
 * Why a response header in addition to `apps/core-app/src/renderer/index.html`'s `<meta>`:
 * 1. `<meta>` CSP does not cover Web Worker contexts or header-only directives (`frame-ancestors`).
 * 2. Header delivery lets the main process attach strict production directives to packaged `file://`
 *    renderer documents while granting narrow loopback HMR allowances only to the configured Vite
 *    dev server origin when `!app.isPackaged`.
 * 3. Strict URL scoping guarantees external `http:`/`https:` pages, `data:text/html` overlays
 *    (QuickOps screen-clean / image-translate pin), and unrelated local files are never overwritten.
 *    Browser Workspace tabs (`persist:tuff-browser`) and plugin views already live in isolated
 *    sessions; scoping `defaultSession` by renderer URL adds defense-in-depth.
 */

export const CSP_HEADER = 'Content-Security-Policy'

/** Sentry HTTPS ingest origin used by `@sentry/electron/renderer` (`sentry-renderer.ts`). */
export const SENTRY_INGEST_ORIGIN = 'https://o4508024637620224.ingest.us.sentry.io'

/**
 * Narrow loopback HMR / UnoCSS devtools connect sources added ONLY in unpackaged Vite dev mode.
 * `electron.vite.config.ts` defaults `devServerHost` to `127.0.0.1`, and developers may also open
 * `localhost` or alternate loopback HMR ports.
 */
export const DEV_CONNECT_LOOPBACK_SOURCES = [
  'http://127.0.0.1:*',
  'ws://127.0.0.1:*',
  'http://localhost:*',
  'ws://localhost:*'
] as const

export type RendererCspMode = 'production' | 'development'

export interface BuildRendererCspOptions {
  mode: RendererCspMode
  /**
   * Exact Vite dev server URL (`process.env.ELECTRON_RENDERER_URL`).
   * Ignored when `mode === 'production'` so dev origins can never leak into packaged builds.
   */
  devServerUrl?: string | null
  /**
   * Include response-header-only directives such as `frame-ancestors 'none'`.
   * Set `false` when building the `<meta http-equiv="Content-Security-Policy">` string because
   * Chromium ignores `frame-ancestors` in `<meta>` elements. Defaults to `true`.
   */
  includeHeaderOnlyDirectives?: boolean
  /**
   * Official CoreBox plugin widgets (`touch-intelligence`, `touch-translation`) execute compiled
   * widget code through `new Function('sandboxScope', 'with (sandboxScope) ...')` in
   * `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`.
   * Kept as an explicit named allowance (default `true`) until the widget executor migrates off
   * `new Function`; passing `false` produces an eval-free policy.
   */
  allowWidgetEval?: boolean
}

export interface RendererCspScopeConfig {
  /** Whether Electron is running packaged (`app.isPackaged`). */
  isPackaged: boolean
  /**
   * Local directory paths allowed to host CoreApp's bundled renderer files
   * (e.g. `<out>/renderer`, optional renderer-override directory).
   */
  rendererRoots: readonly string[]
  /** Vite dev server URL (`process.env.ELECTRON_RENDERER_URL`); ignored when `isPackaged` is true. */
  devServerUrl?: string | null
  /** Whether to retain `'unsafe-eval'` for `widget-registry.ts` (default `true`). */
  allowWidgetEval?: boolean
}

export interface ResolvedRendererCsp {
  mode: RendererCspMode
  policy: string
}

/** Electron's own filter union, restated so pure unit tests do not need electron. */
export type WebRequestResourceType =
  | 'mainFrame'
  | 'subFrame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xhr'
  | 'ping'
  | 'cspReport'
  | 'media'
  | 'webSocket'

/**
 * Main-frame documents and scripts (which include Web Worker script fetches from the renderer
 * origin) receive the enforcing CSP header; icons/images/media/XHR subresources are bypassed.
 */
export const CSP_RESOURCE_TYPES: readonly WebRequestResourceType[] = ['mainFrame', 'script']

interface HeadersReceivedDetails {
  url: string
  resourceType: string
  responseHeaders?: Record<string, string[]>
}

interface HeadersReceivedResponse {
  responseHeaders?: Record<string, string[]>
}

export interface WebRequestCapableSession {
  webRequest: {
    onHeadersReceived: (
      filter: { urls: string[]; types?: WebRequestResourceType[] },
      listener: (
        details: HeadersReceivedDetails,
        callback: (response: HeadersReceivedResponse) => void
      ) => void
    ) => void
  }
}

export interface InstallRendererCspPolicyOptions extends RendererCspScopeConfig {
  /**
   * Called when the enforcing CSP header is attached to a main-frame renderer document.
   */
  onAttached?: (url: string, mode: RendererCspMode) => void
}

interface NormalizedFileRoot {
  pathname: string
  caseInsensitive: boolean
}

function dedupeTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    if (!token || seen.has(token)) continue
    seen.add(token)
    result.push(token)
  }
  return result
}

function parseHttpOrigin(rawUrl: string | null | undefined): {
  origin: string
  wsOrigin: string
} | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return {
    origin: parsed.origin,
    wsOrigin: `${wsProtocol}//${parsed.host}`
  }
}

function ensureTrailingSlash(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`
}

function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value)
}

function isWindowsFilePathname(pathname: string): boolean {
  return /^\/[a-zA-Z]:(?:\/|$)/.test(pathname)
}

function normalizeFileRoot(root: string): NormalizedFileRoot | null {
  const trimmed = root.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('file://')) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'file:') return null
      if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') return null
      const pathname = ensureTrailingSlash(parsed.pathname)
      const caseInsensitive = isWindowsFilePathname(pathname)
      return {
        pathname: caseInsensitive ? pathname.toLowerCase() : pathname,
        caseInsensitive
      }
    } catch {
      return null
    }
  }

  if (isWindowsDrivePath(trimmed)) {
    const posixNormalized = path.posix.normalize(`/${trimmed.replace(/\\/g, '/')}`)
    const encoded = encodeURI(posixNormalized).replace(/#/g, '%23').replace(/\?/g, '%3F')
    return {
      pathname: ensureTrailingSlash(encoded).toLowerCase(),
      caseInsensitive: true
    }
  }

  const resolved = path.resolve(trimmed)
  const fileUrl = pathToFileURL(resolved)
  const pathname = ensureTrailingSlash(fileUrl.pathname)
  const caseInsensitive = process.platform === 'win32' || isWindowsFilePathname(pathname)
  return {
    pathname: caseInsensitive ? pathname.toLowerCase() : pathname,
    caseInsensitive
  }
}

/**
 * Builds the single-line enforcing CSP directive string for CoreApp's renderer.
 *
 * Directives are joined onto one line because Chromium drops response headers containing CR/LF.
 */
export function buildRendererCspPolicy(options: BuildRendererCspOptions): string {
  const allowWidgetEval = options.allowWidgetEval ?? true
  const includeHeaderOnlyDirectives = options.includeHeaderOnlyDirectives ?? true
  const devOrigin = options.mode === 'development' ? parseHttpOrigin(options.devServerUrl) : null

  const scriptSources = dedupeTokens([
    "'self'",
    ...(allowWidgetEval ? ["'unsafe-eval'"] : []),
    // Required by widget-sandbox/sandbox-document.ts (`await import(blobRuntimeUrl)` inside
    // an `<iframe srcdoc>` which inherits and intersects with the parent document's CSP).
    'blob:'
  ])

  const connectSources = dedupeTokens([
    "'self'",
    ...(options.mode === 'development'
      ? [
          ...(devOrigin ? [devOrigin.origin, devOrigin.wsOrigin] : []),
          ...DEV_CONNECT_LOOPBACK_SOURCES
        ]
      : []),
    SENTRY_INGEST_ORIGIN,
    'blob:',
    'data:',
    'tfile:'
  ])

  const directives = [
    "default-src 'self' tfile:",
    `script-src ${scriptSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
    // `https:` covers user/GitHub/Gravatar avatars, store plugin icons, browser favicons, and
    // markdown images without permitting plaintext `http:` or wildcard `*`.
    "img-src 'self' https: data: blob: tfile: file:",
    "font-src 'self' data: blob:",
    // `'unsafe-inline'` is required for Vue `:style` bindings, UnoCSS/KaTeX/ECharts inline styles,
    // and dynamic `<style>` injection in `widget-registry.ts`.
    "style-src 'self' 'unsafe-inline' blob: data:",
    "style-src-elem 'self' 'unsafe-inline' blob: data:",
    "media-src 'self' blob: data: tfile:",
    "object-src 'none'",
    // `blob:` is required by `WorkspaceFileViewer.vue` PDF preview (`<iframe :src="pdfBlobUrl">`);
    // `about:srcdoc` sandboxed iframes are permitted by CSP3, while all remote/file/data frames
    // remain blocked.
    'frame-src blob:',
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    ...(includeHeaderOnlyDirectives ? ["frame-ancestors 'none'"] : [])
  ]

  return directives.join('; ')
}

export const PRODUCTION_RENDERER_CSP = buildRendererCspPolicy({
  mode: 'production',
  includeHeaderOnlyDirectives: true
})

export const PRODUCTION_RENDERER_META_CSP = buildRendererCspPolicy({
  mode: 'production',
  includeHeaderOnlyDirectives: false
})

/**
 * Checks whether a `file://` URL points inside one of CoreApp's own bundled renderer directories.
 */
export function isCoreAppRendererFileUrl(
  requestUrl: string,
  rendererRoots: readonly string[]
): boolean {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'file:') return false
  // Refuse remote/UNC file hosts such as `file://attacker.example/share/...`.
  if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') return false
  // Refuse percent-encoded path separators that could confuse path-prefix comparisons.
  if (/%(?:2f|5c)/i.test(parsed.pathname)) return false

  const normalizedRoots = rendererRoots
    .map(normalizeFileRoot)
    .filter((entry): entry is NormalizedFileRoot => entry !== null)

  for (const root of normalizedRoots) {
    const candidate = root.caseInsensitive ? parsed.pathname.toLowerCase() : parsed.pathname
    if (candidate.startsWith(root.pathname)) {
      return true
    }
  }

  return false
}

/**
 * Resolves the enforcing CSP policy for a response URL, or returns `null` if the URL does not
 * belong to CoreApp's own renderer (e.g. external `https://` sites, unrelated `file://` paths,
 * `data:text/html` overlays, `tfile:` resources, or `devtools://`).
 */
export function resolveRendererCspPolicyForUrl(
  requestUrl: string,
  config: RendererCspScopeConfig
): ResolvedRendererCsp | null {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return null
  }

  if (parsed.protocol === 'file:') {
    if (!isCoreAppRendererFileUrl(requestUrl, config.rendererRoots)) {
      return null
    }
    return {
      mode: 'production',
      policy: buildRendererCspPolicy({
        mode: 'production',
        allowWidgetEval: config.allowWidgetEval,
        includeHeaderOnlyDirectives: true
      })
    }
  }

  if (!config.isPackaged && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    const devOrigin = parseHttpOrigin(config.devServerUrl)
    if (devOrigin && parsed.origin === devOrigin.origin) {
      return {
        mode: 'development',
        policy: buildRendererCspPolicy({
          mode: 'development',
          devServerUrl: config.devServerUrl,
          allowWidgetEval: config.allowWidgetEval,
          includeHeaderOnlyDirectives: true
        })
      }
    }
  }

  return null
}

/**
 * Builds the narrow Electron `webRequest` URL filter patterns so unrelated origins and `tfile:`
 * asset traffic never cross into the main-process listener.
 */
export function buildRendererCspFilterUrls(
  config: Pick<RendererCspScopeConfig, 'isPackaged' | 'devServerUrl'>
): string[] {
  // Chromium's extensions::URLPattern requires a leading path slash on `file` match patterns
  // (`file:///*`, three slashes); `file://*` fails parsing with kEmptyPath.
  const urls = ['file:///*']
  if (!config.isPackaged) {
    const devOrigin = parseHttpOrigin(config.devServerUrl)
    if (devOrigin) {
      urls.push(`${devOrigin.origin}/*`)
    }
  }
  return urls
}

/**
 * Derives the standard local renderer directories that `TouchApp` and `renderer-url.ts` may load
 * `index.html` from in packaged or unpackaged file-backed runs.
 */
export function resolveDefaultRendererRoots(options: {
  mainDir: string
  appPath?: string | null
  resourcesPath?: string | null
  platform?: NodeJS.Platform
  overrideRoot?: string | null
}): string[] {
  const platform = options.platform ?? process.platform
  const candidates: Array<string | null | undefined> = [
    path.resolve(options.mainDir, '..', 'renderer'),
    options.appPath ? path.join(options.appPath, 'out', 'renderer') : null,
    options.appPath ? path.join(options.appPath, 'renderer') : null,
    options.resourcesPath ? path.join(options.resourcesPath, 'app', 'renderer') : null,
    options.resourcesPath ? path.join(options.resourcesPath, 'renderer') : null,
    platform === 'darwin' && options.appPath
      ? path.resolve(options.appPath, '..', '..', '..', 'Resources', 'app', 'renderer')
      : null,
    platform === 'darwin' ? path.resolve(options.mainDir, '..', '..', 'renderer') : null,
    options.overrideRoot ?? null
  ]

  return dedupeTokens(
    candidates
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => path.resolve(entry))
  )
}

/**
 * Returns a new response headers map with `Content-Security-Policy` set to `policy`, preserving
 * every other response header and replacing any differently-cased existing CSP header.
 */
export function withCspHeader(
  responseHeaders: Record<string, string[]> | undefined,
  policy: string
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(responseHeaders ?? {})) {
    if (name.toLowerCase() === CSP_HEADER.toLowerCase()) continue
    next[name] = value
  }
  next[CSP_HEADER] = [policy]
  return next
}

/**
 * Installs the enforcing CSP response header listener on `targetSession` (typically
 * `session.defaultSession`), strictly scoped to CoreApp's own renderer URLs.
 */
export function installRendererCspPolicy(
  targetSession: WebRequestCapableSession,
  options: InstallRendererCspPolicyOptions
): void {
  const filterUrls = buildRendererCspFilterUrls(options)

  // A session holds one onHeadersReceived listener: registering a second anywhere on
  // defaultSession silently replaces this one.
  targetSession.webRequest.onHeadersReceived(
    { urls: filterUrls, types: [...CSP_RESOURCE_TYPES] },
    (details, callback) => {
      if (details.resourceType !== 'mainFrame' && details.resourceType !== 'script') {
        callback({})
        return
      }

      const resolved = resolveRendererCspPolicyForUrl(details.url, options)
      if (!resolved) {
        callback({})
        return
      }

      if (details.resourceType === 'mainFrame') {
        options.onAttached?.(details.url, resolved.mode)
      }

      callback({ responseHeaders: withCspHeader(details.responseHeaders, resolved.policy) })
    }
  )
}
