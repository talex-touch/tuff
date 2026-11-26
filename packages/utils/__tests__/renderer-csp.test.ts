import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRendererCspPolicy,
  CSP_HEADER,
  PRODUCTION_RENDERER_CSP,
  PRODUCTION_RENDERER_META_CSP,
  SENTRY_INGEST_ORIGIN,
} from '../../../apps/core-app/src/main/core/renderer-csp'

/**
 * The renderer CSP is the only barrier between injected content and `system.executeCommand` (#689).
 *
 * The renderer holds the contextBridge `ipcRenderer`, so anything that reaches its DOM and executes
 * — markdown, plugin-supplied rich text, an AI response — reaches local code execution.
 *
 * Both layers now enforce the hardened policy:
 * 1. `main/core/renderer-csp.ts` attaches the authoritative `Content-Security-Policy` response
 *    header (including header-only `frame-ancestors 'none'` and worker script coverage) strictly
 *    scoped to CoreApp's own renderer URLs.
 * 2. `apps/core-app/src/renderer/index.html` carries the matching fallback `<meta>` policy with
 *    zero wildcards (`*`).
 *
 * `'unsafe-eval'` is asserted as *present* on purpose. Official CoreBox plugin widgets
 * (`touch-intelligence`, `touch-translation`) execute compiled code through `new Function` in
 * `widget-registry.ts`, so removing it without migrating that executor breaks plugin widgets.
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
  const stripped = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '')
  const match = new RegExp(
    `http-equiv="${httpEquiv}"\\s*\\n?\\s*content="([\\s\\S]*?)"`,
  ).exec(stripped)
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

const csp = policyFor('Content-Security-Policy')
const headerCsp = PRODUCTION_RENDERER_CSP.replace(/\s+/g, ' ').trim()

function find(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map(part => part.trim())
    .find(part => part === name || part.startsWith(`${name} `))
}

function directive(name: string): string | undefined {
  return find(csp, name)
}

function headerDirective(name: string): string | undefined {
  return find(headerCsp, name)
}

describe('renderer Content-Security-Policy', () => {
  it('is present and parsed', () => {
    // Positive control: every assertion below passes vacuously against an empty policy, which is
    // exactly what a changed attribute shape would produce.
    expect(csp.length).toBeGreaterThan(80)
    expect(directive('script-src')).toBeDefined()
  })

  it('keeps script-src free of wildcards, unsafe-inline, and data:', () => {
    // The regression #913 fixed plus dropping `data:` script injection (#689).
    const scriptSrc = directive('script-src')!

    expect(scriptSrc).not.toMatch(/(^|\s)\*/)
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('data:')
    expect(scriptSrc).toContain('\'self\'')
    expect(scriptSrc).toContain('blob:')
  })

  it('still allows \'unsafe-eval\', which the widget runtime needs', () => {
    // Stated as a requirement rather than left implicit: widget-registry.ts runs widget code through
    // `new Function`. Dropping this is a product change, not a hardening.
    expect(directive('script-src')).toContain('\'unsafe-eval\'')
  })

  it('locks down object-src, frame-src, worker-src, base-uri, and form-action', () => {
    expect(directive('object-src')).toBe('object-src \'none\'')
    // WorkspaceFileViewer.vue renders PDF previews in `<iframe :src="pdfBlobUrl">`.
    expect(directive('frame-src')).toBe('frame-src blob:')
    expect(directive('worker-src')).toBe('worker-src \'self\' blob:')
    expect(directive('base-uri')).toBe('base-uri \'self\'')
    expect(directive('form-action')).toBe('form-action \'self\'')
  })

  it('eliminates wildcards from default-src, connect-src, img-src, font-src, style-src, and media-src', () => {
    for (const name of [
      'default-src',
      'connect-src',
      'img-src',
      'font-src',
      'style-src',
      'style-src-elem',
      'media-src',
    ]) {
      const value = directive(name)
      expect(value, name).toBeDefined()
      expect(value, name).not.toMatch(/(^|\s)\*(\s|$)/)
    }
    expect(directive('default-src')).toBe('default-src \'self\' tfile:')
    expect(directive('connect-src')).not.toMatch(/\bws:|\bwss:/)
    expect(directive('connect-src')).toContain(SENTRY_INGEST_ORIGIN)
    expect(directive('connect-src')).toContain('tfile:')
  })

  it('matches the fallback meta policy exported by main/core/renderer-csp.ts', () => {
    const normalizedMeta = csp
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .join('; ')
    expect(normalizedMeta).toBe(PRODUCTION_RENDERER_META_CSP)
  })
})

describe('enforcing response-header CSP policy', () => {
  it('delivers the narrowed enforcing policy via Content-Security-Policy header', () => {
    expect(CSP_HEADER).toBe('Content-Security-Policy')
    expect(headerCsp.length).toBeGreaterThan(80)
    expect(headerDirective('default-src')).toBe('default-src \'self\' tfile:')
    expect(headerDirective('frame-ancestors')).toBe('frame-ancestors \'none\'')
  })

  it('contains no wildcards and no dev localhost/ws origins in production', () => {
    for (const name of ['default-src', 'script-src', 'connect-src', 'img-src', 'font-src', 'style-src', 'media-src']) {
      expect(headerDirective(name), name).not.toMatch(/(^|\s)\*(\s|$)/)
    }
    expect(headerDirective('connect-src')).toContain(SENTRY_INGEST_ORIGIN)
    expect(headerDirective('connect-src')).not.toContain('localhost')
    expect(headerDirective('connect-src')).not.toContain('127.0.0.1')
    expect(headerDirective('connect-src')).not.toMatch(/\bws:|\bwss:/)
  })

  it('scopes Vite HMR loopback origins strictly to development mode', () => {
    const devPolicy = buildRendererCspPolicy({
      mode: 'development',
      devServerUrl: 'http://127.0.0.1:5173',
    })
    const devConnect = find(devPolicy, 'connect-src')
    expect(devConnect).toContain('ws://127.0.0.1:5173')
    expect(devConnect).toContain('ws://localhost:*')
    expect(devConnect).not.toMatch(/(^|\s)\*(\s|$)/)
  })

  it('keeps securitypolicyviolation forwarding active and never reintroduces report-only meta', () => {
    expect(RENDERER_MAIN).toContain('addEventListener(\'securitypolicyviolation\'')
    expect(INDEX_HTML).not.toMatch(/http-equiv="Content-Security-Policy-Report-Only"/)
  })
})
