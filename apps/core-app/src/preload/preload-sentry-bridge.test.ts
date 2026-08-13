import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = readFileSync(path.join(here, 'index.ts'), 'utf8')
const MAIN_INDEX = readFileSync(path.join(here, '..', 'main', 'index.ts'), 'utf8')

/**
 * #1718. `@sentry/electron/renderer` looks for an IPC bridge on `window.__SENTRY_IPC__` that the
 * preload installs. When it is absent the SDK does not fail — it takes a documented fallback,
 * `fetch('sentry-ipc://envelope/…')` per envelope plus a `window.__SENTRY_RENDERER_ID__` global,
 * and says so through a `debug.log` nobody reads.
 *
 * That is why this is a test rather than a comment: the call site cannot tell the two apart, so
 * deleting the import looks exactly like keeping it.
 *
 * Source-level rather than behavioural. Importing the preload here would pull in `electron`, and
 * the bridge's observable effect is a `contextBridge.exposeInMainWorld` call in a renderer realm
 * this suite does not have. The same shape as `duplicate-instance-bootstrap.test.ts`, which asserts
 * ordering in `main/index.ts` by reading it.
 */
describe('#1718 sentry preload bridge', () => {
  it('reads a preload that is actually there, so the assertions below are not vacuous', () => {
    expect(PRELOAD.length).toBeGreaterThan(0)
    expect(PRELOAD).toContain('contextBridge')
    expect(MAIN_INDEX).toContain('app.whenReady()')
  })

  it('imports @sentry/electron/preload for its side effect', () => {
    // Bare import: `preload/default.js` calls `hookupIpc()` at module scope. A named import would
    // be wrong here — there is nothing to name, and a bundler may drop it.
    expect(PRELOAD).toMatch(/^import '@sentry\/electron\/preload'$/m)
  })

  /**
   * The finding that made #1718 a deliberate choice rather than a rescue.
   *
   * The issue's open question was whether renderer envelopes arrive at all: the SDK registers
   * `sentry-ipc` through `protocol.registerSchemesAsPrivileged`, which Electron ignores after
   * `ready`. If `Sentry.init` ran late, the fallback would fail outright and renderer errors would
   * go nowhere. It does not — `preInitBeforeReady()` precedes `app.whenReady()`, so the fallback
   * was working and the bridge is an upgrade, not a fix.
   *
   * Pinned here because that ordering is a one-line edit away from being wrong, and both paths
   * would still look identical from the renderer.
   */
  it('pre-initialises Sentry before app.whenReady, which is what makes the scheme privileged', () => {
    // Anchored to the start of a line and to `.then(`, not to the bare call. The first version
    // searched for `app.whenReady()` and matched the *comment* two lines above the pre-init, which
    // failed on correct code — the ordering is right, the assertion was reading prose.
    const preInit = MAIN_INDEX.indexOf('sentryModule.preInitBeforeReady()')
    const whenReady = MAIN_INDEX.search(/^app\.whenReady\(\)\.then\(/m)
    expect(preInit, 'sentryModule.preInitBeforeReady() not found').toBeGreaterThanOrEqual(0)
    expect(whenReady, 'top-level app.whenReady().then( not found').toBeGreaterThanOrEqual(0)
    expect(preInit).toBeLessThan(whenReady)
  })
})
