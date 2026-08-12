import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The renderer CSP is the only barrier between injected content and `system.executeCommand` (#689).
 *
 * The renderer holds the contextBridge `ipcRenderer`, so anything that reaches its DOM and executes
 * — markdown, plugin-supplied rich text, an AI response — reaches local code execution. #913
 * already removed the wildcard and `'unsafe-inline'` from `script-src`, which was the severe half.
 *
 * What this pins is that they do not come back, and that the directives nothing uses stay closed
 * rather than falling through to `default-src *`.
 *
 * `'unsafe-eval'` is asserted as *present* on purpose. The plugin widget runtime executes widget
 * code through `new Function`, so removing it would delete plugin widgets rather than harden
 * anything — a test that demanded its absence would be demanding a product change.
 *
 * Lives in packages/utils because `ci / CI - utils` is blocking, while `App suites (core-app)` is
 * continue-on-error and reports success however the suite does.
 */

const INDEX_HTML = readFileSync(
  path.resolve(__dirname, '../../../apps/core-app/src/renderer/index.html'),
  'utf8',
)

const RENDERER_MAIN = readFileSync(
  path.resolve(__dirname, '../../../apps/core-app/src/renderer/src/main.ts'),
  'utf8',
)

function policyFor(httpEquiv: string): string {
  const match = new RegExp(
    `http-equiv="${httpEquiv}"\\s*\\n?\\s*content="([\\s\\S]*?)"`,
  ).exec(INDEX_HTML)
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

const csp = policyFor('Content-Security-Policy')
const reportOnly = policyFor('Content-Security-Policy-Report-Only')

function find(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map(part => part.trim())
    .find(part => part === name || part.startsWith(`${name} `))
}

function directive(name: string): string | undefined {
  return find(csp, name)
}

function reportOnlyDirective(name: string): string | undefined {
  return find(reportOnly, name)
}

describe('renderer Content-Security-Policy', () => {
  it('is present and parsed', () => {
    // Positive control: every assertion below passes vacuously against an empty policy, which is
    // exactly what a changed attribute shape would produce.
    expect(csp.length).toBeGreaterThan(80)
    expect(directive('script-src')).toBeDefined()
  })

  it('keeps script-src free of a wildcard and of unsafe-inline', () => {
    // The regression #913 fixed: either of these lets a javascript: URL or an inline handler that
    // survives the markdown sanitiser run inside the privileged renderer.
    const scriptSrc = directive('script-src')!

    expect(scriptSrc).not.toMatch(/(^|\s)\*/)
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).toContain('\'self\'')
  })

  it('still allows \'unsafe-eval\', which the widget runtime needs', () => {
    // Stated as a requirement rather than left implicit: widget-registry.ts runs widget code through
    // `new Function`. Dropping this is a product change, not a hardening.
    expect(directive('script-src')).toContain('\'unsafe-eval\'')
  })

  it('closes the directives nothing uses instead of letting them fall through', () => {
    // Without these three, `default-src *` governs them — and the renderer has no <object>,
    // <embed>, <iframe> or `new Worker` to justify that.
    expect(directive('object-src')).toBe('object-src \'none\'')
    expect(directive('frame-src')).toBe('frame-src \'none\'')
    expect(directive('worker-src')).toBe('worker-src \'self\' blob:')
  })

  it('records that default-src and connect-src are still open', () => {
    // Not an endorsement — an acknowledgement. Narrowing them needs the set of origins the
    // renderer actually reaches at runtime, which reading the source cannot settle. The
    // report-only policy below is how that set is being collected. If someone does narrow these,
    // this test should be updated rather than deleted, so the change is deliberate.
    expect(directive('connect-src')).toContain('*')
    expect(directive('default-src')).toContain('*')
  })
})

describe('the report-only candidate policy', () => {
  it('is present, and is the narrow one', () => {
    // Positive control first: an empty match would satisfy "contains no wildcard" trivially.
    expect(reportOnly.length).toBeGreaterThan(80)
    expect(reportOnlyDirective('default-src')).toBe('default-src \'self\' blob: data: tfile: remix:')
  })

  it('drops the wildcards the enforcing policy still carries', () => {
    // The whole point of it. A report-only copy of the enforcing policy would report nothing and
    // look like a clean bill of health.
    for (const name of ['default-src', 'connect-src', 'img-src', 'font-src', 'media-src']) {
      expect(reportOnlyDirective(name), name).not.toContain('*;')
      expect(reportOnlyDirective(name), name).not.toMatch(/\s\*\s|\s\*$/)
    }
  })

  it('keeps the origins the renderer is known to need', () => {
    // Sentry is initialised in the renderer (sentry-renderer.ts), and the dev server plus its
    // websocket would otherwise fill the log with noise that is not a finding.
    expect(reportOnlyDirective('connect-src')).toContain('ingest.us.sentry.io')
    expect(reportOnlyDirective('connect-src')).toContain('ws://localhost:*')
  })

  it('is reported rather than enforced, and the report is listened for', () => {
    // A report-only policy nobody listens to is decoration. The listener is what turns it into
    // the inventory that unblocks narrowing the real policy.
    expect(INDEX_HTML).toContain('Content-Security-Policy-Report-Only')
    expect(RENDERER_MAIN).toContain('addEventListener(\'securitypolicyviolation\'')
  })
})
