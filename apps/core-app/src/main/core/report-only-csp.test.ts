/**
 * The report-only CSP and how it is delivered (#689).
 *
 * The defect this suite exists for was not the policy text: it was that the policy lived in a
 * `<meta http-equiv="Content-Security-Policy-Report-Only">`, which Chromium refuses outright
 * ("The policy has been ignored"). Report-only is header-only. So the `[csp-report-only]` log
 * that narrowing `default-src` / `connect-src` was waiting on had been empty by construction
 * since the day it was written — a gate that could never fail, and therefore never report.
 *
 * Everything below is anchored on that: the policy must not be in the document, it must be
 * attachable as a header, and it must be one line, because a header value containing a newline
 * is dropped and the failure would look exactly like the one being fixed.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  installReportOnlyCspPolicy,
  REPORT_ONLY_CSP,
  REPORT_ONLY_CSP_HEADER,
  withReportOnlyCsp
} from './report-only-csp'

const RENDERER_HTML = readFileSync(path.join(__dirname, '../../renderer/index.html'), 'utf8')
const PRECORE = readFileSync(path.join(__dirname, 'precore.ts'), 'utf8')

interface CapturedListener {
  filter: { urls: string[]; types?: string[] }
  respond: (details: {
    url: string
    resourceType: string
    responseHeaders?: Record<string, string[]>
  }) => { responseHeaders?: Record<string, string[]> }
}

function installOnFakeSession(options?: { onAttached?: (url: string) => void }): CapturedListener {
  let captured: CapturedListener | null = null

  installReportOnlyCspPolicy(
    {
      webRequest: {
        onHeadersReceived: (filter, listener) => {
          captured = {
            filter,
            respond: (details) => {
              let response: { responseHeaders?: Record<string, string[]> } | null = null
              listener(details, (value) => {
                response = value
              })
              // A listener that never calls back stalls the request, so the absence is the bug.
              expect(response, 'listener did not call back').not.toBeNull()
              return response!
            }
          }
        }
      }
    },
    options
  )

  expect(captured, 'installer did not register an onHeadersReceived listener').not.toBeNull()
  return captured!
}

describe('report-only CSP is not delivered through the document', () => {
  it('renderer/index.html carries no report-only meta', () => {
    // The one-line edit that reintroduces the whole defect.
    expect(RENDERER_HTML).not.toMatch(/http-equiv\s*=\s*"Content-Security-Policy-Report-Only"/i)
  })

  it('the scan above can see a meta CSP at all', () => {
    // Positive control. Without it, "no report-only meta" passes just as happily on a renamed
    // file, an empty read, or a rewritten attribute style — the same shape of empty-by-
    // construction result that this whole change is about.
    expect(RENDERER_HTML).toMatch(/http-equiv\s*=\s*"Content-Security-Policy"/i)
  })
})

describe('the policy is deliverable as a header', () => {
  it('is a single line', () => {
    // A header value with a newline in it is dropped, which would put the policy right back where
    // it started: present in the source, absent at runtime.
    expect(REPORT_ONLY_CSP).not.toMatch(/[\r\n]/)
  })

  it('still names the directives the inventory is being collected for', () => {
    for (const directive of ['default-src', 'connect-src', 'img-src', 'style-src', 'media-src']) {
      expect(REPORT_ONLY_CSP).toContain(`${directive} `)
    }
  })

  it('keeps unsafe-eval in script-src', () => {
    // Not a loosening. The enforcing policy grants it deliberately, because widget-registry.ts
    // runs widget code through `new Function`. Left to fall back to default-src, this policy
    // would report a violation on every widget execution — a decision already taken, reported as
    // a finding, in the log whose emptiness is the release criterion.
    expect(REPORT_ONLY_CSP).toMatch(/script-src [^;]*'unsafe-eval'/)
  })
})

describe('withReportOnlyCsp', () => {
  it('adds the header while keeping the rest of the response', () => {
    const headers = withReportOnlyCsp({ 'Content-Type': ['text/html'] })
    expect(headers['Content-Type']).toEqual(['text/html'])
    expect(headers[REPORT_ONLY_CSP_HEADER]).toEqual([REPORT_ONLY_CSP])
  })

  it('works on a response that carried no headers', () => {
    // file:// responses arrive with responseHeaders undefined, which is the packaged case.
    expect(withReportOnlyCsp(undefined)[REPORT_ONLY_CSP_HEADER]).toEqual([REPORT_ONLY_CSP])
  })

  it('replaces a differently-cased copy instead of adding a second one', () => {
    // Header names are case-insensitive. Two report-only policies means every violation reported
    // twice, and the duplicate would be invisible to an exact-key check.
    const headers = withReportOnlyCsp({
      'content-security-policy-report-only': ["default-src 'none'"]
    })
    const present = Object.keys(headers).filter(
      (name) => name.toLowerCase() === REPORT_ONLY_CSP_HEADER.toLowerCase()
    )
    expect(present).toHaveLength(1)
    expect(headers[present[0]]).toEqual([REPORT_ONLY_CSP])
  })
})

describe('installReportOnlyCspPolicy', () => {
  it('asks the session for main-frame responses only', () => {
    // defaultSession also serves every tfile: icon and thumbnail. Without the type filter each
    // one takes a round trip through this listener to no effect.
    const { filter } = installOnFakeSession()
    expect(filter.types).toEqual(['mainFrame'])
    expect(filter.urls).toEqual(['<all_urls>'])
  })

  it('attaches the policy to a document response', () => {
    const { respond } = installOnFakeSession()
    const response = respond({
      url: 'file:///Applications/Tuff.app/Contents/Resources/app.asar/out/renderer/index.html',
      resourceType: 'mainFrame',
      responseHeaders: { 'Content-Type': ['text/html'] }
    })
    expect(response.responseHeaders?.[REPORT_ONLY_CSP_HEADER]).toEqual([REPORT_ONLY_CSP])
  })

  it('leaves a subresource response untouched', () => {
    // Belt to the filter's braces: returning no responseHeaders is what passes the response
    // through, and returning a stamped one here would apply a document policy to an image.
    const { respond } = installOnFakeSession()
    const response = respond({
      url: 'tfile://icon/app.png',
      resourceType: 'image',
      responseHeaders: { 'Content-Type': ['image/png'] }
    })
    expect(response.responseHeaders).toBeUndefined()
  })

  it('reports each document it attached to', () => {
    // The delivery signal. An empty violation log only means something if something says the
    // policy loaded, which is precisely what the <meta> version could never do.
    const attached: string[] = []
    const { respond } = installOnFakeSession({ onAttached: (url) => attached.push(url) })
    respond({ url: 'http://localhost:5173/', resourceType: 'mainFrame' })
    respond({ url: 'tfile://icon/app.png', resourceType: 'image' })
    expect(attached).toEqual(['http://localhost:5173/'])
  })
})

describe('the policy is installed before any window can load', () => {
  /**
   * Bounded to the whenReady callback rather than the whole file: an unanchored search would
   * match the import line and pass on a build where the call had been deleted.
   */
  const readyStart = PRECORE.indexOf('void app.whenReady().then(')
  const readyEnd = PRECORE.indexOf("powerMonitor.on('shutdown'", readyStart)
  const readyBlock = PRECORE.slice(readyStart, readyEnd)

  it('is reading the whenReady block and not the whole file', () => {
    expect(readyStart).toBeGreaterThan(-1)
    expect(readyEnd).toBeGreaterThan(readyStart)
  })

  it('installs on the default session inside it', () => {
    expect(readyBlock).toContain('installReportOnlyCspPolicy(session.defaultSession')
  })

  it('sits next to the permission policy, which is there for the same reason', () => {
    // Positive control for the slice, and the load-bearing fact: modules load after this and
    // some of them create windows, so a policy installed later misses the first document.
    expect(readyBlock).toContain('installDefaultSessionPermissionPolicy(session.defaultSession')
  })
})
