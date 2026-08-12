import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The renderer's Content-Security-Policy (#913).
 *
 * This is the privileged renderer: preload publishes ipcRenderer through contextBridge, and
 * channel-guard grants every non-plugin caller all permissions. script-src used to be
 * `* 'unsafe-inline' 'unsafe-eval'`, so a javascript: URL or inline handler that survived the
 * markdown sanitiser — release notes are rendered here — executed with that authority.
 *
 * Asserted against the file because re-adding 'unsafe-inline' is a one-word edit that nothing
 * else would catch.
 */

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8')

/**
 * Comments are stripped before parsing. The file documents these directives in prose right
 * above them, and the first version of this guard happily matched its own explanation of what
 * script-src must not contain.
 */
const policy = html.replace(/<!--[\s\S]*?-->/g, '')

function directive(name: string): string {
  const match = policy.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+);`, 'm'))
  expect(match, `directive ${name} not found — this guard is reading the wrong file`).not.toBeNull()
  return match![1].replace(/\s+/g, ' ').trim()
}

describe('renderer content security policy', () => {
  it('does not allow inline script', () => {
    // The directive that made javascript: URLs and inline handlers executable.
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
  })

  it('does not allow script from an arbitrary origin', () => {
    expect(directive('script-src').split(' ')).not.toContain('*')
  })

  it('restricts script to the app itself', () => {
    expect(directive('script-src')).toContain("'self'")
  })

  it('still allows eval, which the plugin widget runtime requires', () => {
    // Not an oversight. widget-registry.ts executes widget code through `new Function`, so
    // dropping this removes plugin widgets rather than hardening anything. Asserted so the
    // decision is visible rather than looking like an unfinished job.
    expect(directive('script-src')).toContain("'unsafe-eval'")
  })

  it('keeps inline style, which Vue style bindings need', () => {
    // Positive control in the other direction: a sweep that stripped 'unsafe-inline'
    // everywhere would satisfy the script-src assertions above and break every :style binding.
    expect(directive('style-src')).toContain("'unsafe-inline'")
  })

  it('has no inline script or event handler in the document itself', () => {
    // The policy above only helps if the page it ships with obeys it.
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/)
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i)
  })
})

describe('report-only CSP violations reach somewhere they can be read (#689)', () => {
  const entry = readFileSync(fileURLToPath(new URL('./src/main.ts', import.meta.url)), 'utf8')
  /**
   * Bounded to the listener itself. The first version of this sliced to end-of-file, so the
   * `.catch(` assertion below matched unrelated code further down and passed against a
   * mutation that removed the real one.
   */
  const listenerStart = entry.indexOf('securitypolicyviolation')
  const listenerEnd = entry.indexOf('function registerRouterEvents', listenerStart)
  const listener = entry.slice(listenerStart, listenerEnd)

  it('is reading the listener and not the whole file', () => {
    // Without this the two assertions below can pass on text that has nothing to do with the
    // listener, which is exactly how the first version of this block was wrong.
    expect(listenerStart).toBeGreaterThan(-1)
    expect(listenerEnd).toBeGreaterThan(listenerStart)
    expect(listener.length).toBeLessThan(1500)
  })

  it('forwards violations to the main process', () => {
    // The report-only policy exists to produce a runtime inventory of what the renderer
    // actually reaches, so default-src and connect-src can stop being wildcards. That
    // inventory was unreachable: createRendererLogger writes to the renderer console and
    // nowhere else, so the findings only ever existed in a devtools panel nobody has open
    // during real use. A policy that reports into a void is indistinguishable from no policy.
    expect(listener).toContain('AppEvents.security.reportCspViolation')
  })

  it('does not swallow the report when the send fails', () => {
    // Fire-and-forget, but explicitly: an unhandled rejection here would surface as noise in
    // the very console this moved the reporting out of.
    expect(listener).toMatch(/\.catch\(/)
  })

  it('the renderer logger it replaced really is console-only', () => {
    // Positive control for the claim above. If this ever starts persisting, the test at the
    // top of this block is asserting a workaround for a problem that no longer exists.
    const rendererLog = readFileSync(
      fileURLToPath(new URL('./src/utils/renderer-log.ts', import.meta.url)),
      'utf8'
    )
    expect(rendererLog).toMatch(/console\.(log|info|warn|error)/)
    expect(rendererLog).not.toMatch(/transport|ipcRenderer|window\.electron/)
  })
})
