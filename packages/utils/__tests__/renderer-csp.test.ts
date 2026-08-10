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
  'utf8'
)

const csp = (() => {
  const match = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([\s\S]*?)"/.exec(INDEX_HTML)
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim()
})()

function directive(name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
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
    expect(scriptSrc).toContain("'self'")
  })

  it("still allows 'unsafe-eval', which the widget runtime needs", () => {
    // Stated as a requirement rather than left implicit: widget-registry.ts runs widget code through
    // `new Function`. Dropping this is a product change, not a hardening.
    expect(directive('script-src')).toContain("'unsafe-eval'")
  })

  it('closes the directives nothing uses instead of letting them fall through', () => {
    // Without these three, `default-src *` governs them — and the renderer has no <object>,
    // <embed>, <iframe> or `new Worker` to justify that.
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('frame-src')).toBe("frame-src 'none'")
    expect(directive('worker-src')).toBe("worker-src 'self' blob:")
  })

  it('records that default-src and connect-src are still open', () => {
    // Not an endorsement — an acknowledgement. Narrowing connect-src needs the set of origins the
    // renderer actually reaches, and users configure arbitrary AI provider base URLs, so it cannot
    // be derived by reading the source. If someone does narrow it, this test should be updated
    // rather than deleted, so the change is deliberate.
    expect(directive('connect-src')).toContain('*')
    expect(directive('default-src')).toContain('*')
  })
})
