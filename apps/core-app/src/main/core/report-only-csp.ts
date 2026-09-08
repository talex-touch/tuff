/**
 * Delivery for the renderer's candidate narrow CSP, in report-only mode (#689).
 *
 * This policy used to sit in a second `<meta http-equiv="Content-Security-Policy-Report-Only">`
 * in renderer/index.html, where Chromium threw it away verbatim:
 *
 *   The report-only Content Security Policy '…' was delivered via a <meta> element, which is
 *   disallowed. The policy has been ignored.
 *
 * Report-only is header-only; only the enforcing policy works in a `<meta>`. So the violation log
 * that the wildcards in the enforcing policy are waiting on was empty by construction — a gate
 * that read as satisfied the day it was written and could never produce the evidence it exists
 * for. The policy text was never the defect; delivery was.
 *
 * `webRequest` does see `file://` in Electron 41, so the same directives attached from
 * `onHeadersReceived` apply in a packaged build as well as against the dev server.
 *
 * Scope is `session.defaultSession`, which is every window the app loads its own renderer into
 * (main window, CoreBox, Assistant, Screenshot, OmniPanel, MetaOverlay) and nothing else —
 * external links go through `shell.openExternal`, and plugin Surfaces get a per-activation
 * partition rather than this session.
 *
 * What the policy is for, carried over from renderer/index.html: reading the renderer statically
 * says those wildcards are close to unused. There are three `fetch`/`axios` matches in the whole
 * renderer and two of them are comments in i18n.ts; the only real one is `attachment-payload.ts`,
 * which reads `blob:` URLs and already refuses any other scheme. `nexus-store-provider.ts`
 * resolves a user-configurable base URL but does not fetch it — that request is made in main.
 * There is no `new WebSocket` and no `EventSource`, and the widget sandbox denies `sendBeacon`
 * outright. What genuinely remains is Sentry, initialised in the renderer, and the dev server.
 *
 * Static reading is exactly what cannot settle it, though: a dependency may reach for something at
 * runtime that no literal in the tree mentions. So this reports rather than enforces, violations
 * are forwarded to the main log from the renderer entry, and the wildcards in the enforcing policy
 * stay until that log is empty in real use — which, now, means something.
 */

/**
 * Directives held as a list because a header value containing a newline is dropped, and the
 * `<meta>` version this replaces was written across eight indented lines.
 */
const REPORT_ONLY_DIRECTIVES = [
  "default-src 'self' blob: data: tfile: remix:",
  // Copied from the enforcing policy rather than left to fall back to default-src. Without it
  // the widget runtime's `new Function` (widget-registry.ts) reports a violation every time it
  // runs, which is a decision already taken rather than a finding — and drowns the inventory
  // this policy exists to collect.
  "script-src 'self' 'unsafe-eval' blob: data:",
  "connect-src 'self' https://o4508024637620224.ingest.us.sentry.io blob: data: tfile: ws://localhost:* http://localhost:*",
  "img-src 'self' data: blob: tfile: file: remix:",
  "font-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' blob: data:",
  "style-src-elem 'self' 'unsafe-inline' blob: data:",
  "media-src 'self' blob: data: tfile:"
]

export const REPORT_ONLY_CSP_HEADER = 'Content-Security-Policy-Report-Only'

export const REPORT_ONLY_CSP = REPORT_ONLY_DIRECTIVES.join('; ')

/**
 * Replaces any existing copy of the header rather than appending to it: header names are
 * case-insensitive, so a differently-cased one left in place would put two report-only policies
 * in play and report every violation twice.
 */
export function withReportOnlyCsp(
  responseHeaders: Record<string, string[]> | undefined
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(responseHeaders ?? {})) {
    if (name.toLowerCase() === REPORT_ONLY_CSP_HEADER.toLowerCase()) continue
    next[name] = value
  }
  next[REPORT_ONLY_CSP_HEADER] = [REPORT_ONLY_CSP]
  return next
}

interface HeadersReceivedDetails {
  url: string
  resourceType: string
  responseHeaders?: Record<string, string[]>
}

interface HeadersReceivedResponse {
  responseHeaders?: Record<string, string[]>
}

/** Electron's own filter union, restated so the fake session in the test does not need electron. */
type WebRequestResourceType =
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

interface WebRequestCapableSession {
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

export interface InstallReportOnlyCspPolicyOptions {
  /**
   * Called for each document the header is attached to.
   *
   * The point of the whole change is that an empty `[csp-report-only]` log used to be
   * indistinguishable from a policy that never loaded. Something has to say "delivered" for the
   * absence of violations to mean anything.
   */
  onAttached?: (url: string) => void
}

export function installReportOnlyCspPolicy(
  targetSession: WebRequestCapableSession,
  options: InstallReportOnlyCspPolicyOptions = {}
): void {
  // A session holds one onHeadersReceived listener: registering a second anywhere on
  // defaultSession replaces this one without a word. Nothing else does today — the only other
  // webRequest use in the app is onBeforeRequest on a per-plugin session.
  targetSession.webRequest.onHeadersReceived(
    // `types` keeps subresources out of the listener entirely, which matters: defaultSession
    // serves every `tfile:` icon and thumbnail, and routing each one through a main-process
    // callback to no effect is the kind of cost that does not show up until it does.
    { urls: ['<all_urls>'], types: ['mainFrame'] },
    (details, callback) => {
      // The filter above should already cover this. Repeated so the listener is correct on its
      // own: if `types` ever stops matching, the fallback is a stamped subresource, not silence.
      if (details.resourceType !== 'mainFrame') {
        // No responseHeaders means the response passes through untouched.
        callback({})
        return
      }

      options.onAttached?.(details.url)
      callback({ responseHeaders: withReportOnlyCsp(details.responseHeaders) })
    }
  )
}
