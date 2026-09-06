/**
 * `useArgMapper` read the window role from `process.argv`, which the renderer's main world does not
 * have — `contextIsolation` and `sandbox` are on for every window (`window-security-profile.ts`).
 * Argv resolved to `[]` there, and because `{}` is truthy the empty parse was cached permanently,
 * so `isMainWindow()` was always false in the renderer. That silently disabled the manual update
 * check and, through the same gate, every update prompt the main process asked for.
 *
 * The preload already parses the role for `windowMode`; it now carries it across the contextBridge
 * in `StartupContext.role`. These tests pin both halves: the bridge is preferred where it exists,
 * and an empty parse is never cached — either alone leaves the bug reachable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isCoreBox,
  isMainWindow,
  isMetaOverlay,
  useArgMapper,
  useTouchType,
} from '../renderer/hooks/arg-mapper'
import type { WindowRole } from '../renderer/window-role'

const REAL_PROCESS = (globalThis as any).process

/** Renderer main world: a `window`, no `process`, and whatever the bridge exposed. */
function asRenderer(role?: WindowRole): void {
  delete (globalThis as any).process
  const api = role
    ? { getStartupContextSnapshot: () => ({ startupInfo: null, metaOverlay: false, windowMode: 'MainApp', role }) }
    : undefined
  ;(globalThis as any).window = { $argMapper: undefined, api }
}

/** Preload realm: `process.argv` is available and `window.api` is not. */
function asPreload(argv: string[]): void {
  ;(globalThis as any).process = { argv }
  ;(globalThis as any).window = { $argMapper: undefined }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  ;(globalThis as any).process = REAL_PROCESS
  delete (globalThis as any).window
})

describe('useArgMapper resolves the window role in the renderer', () => {
  it('reads the role the preload published, with no process available', () => {
    asRenderer({ touchType: 'main' })

    expect(useArgMapper()).toMatchObject({ touchType: 'main' })
    expect(useTouchType()).toBe('main')
  })

  it('identifies each window kind from the bridged role', () => {
    asRenderer({ touchType: 'main' })
    expect(isMainWindow()).toBe(true)
    expect(isCoreBox()).toBe(false)

    asRenderer({ touchType: 'core-box', coreType: 'division-box' })
    expect(isCoreBox()).toBe(true)
    expect(isMainWindow()).toBe(false)
  })

  it('carries metaOverlay across the bridge as the composed boolean', () => {
    asRenderer({ touchType: 'main', metaOverlay: true })
    expect(isMetaOverlay()).toBe(true)
  })
})

describe('useArgMapper does not cache an empty parse', () => {
  it('re-resolves after the bridge becomes available', () => {
    // The regression in one test: with no source, the old implementation cached `{}` and the
    // window stayed role-less for the rest of the session even once the bridge could answer.
    asRenderer(undefined)
    expect(useArgMapper()).toEqual({})
    expect(isMainWindow()).toBe(false)

    ;(globalThis as any).window.api = {
      getStartupContextSnapshot: () => ({
        startupInfo: null,
        metaOverlay: false,
        windowMode: 'MainApp',
        role: { touchType: 'main' } satisfies WindowRole,
      }),
    }

    expect(isMainWindow()).toBe(true)
  })

  it('leaves the cache unwritten while the result is empty', () => {
    asRenderer(undefined)
    useArgMapper()
    expect((globalThis as any).window.$argMapper).toBeUndefined()
  })
})

describe('useArgMapper keeps working where argv is the only source', () => {
  it('parses argv in the preload realm, which has no window.api', () => {
    asPreload(['electron', '--touch-type=core-box', '--core-type=omni-panel'])

    expect(useArgMapper()).toMatchObject({ touchType: 'core-box', coreType: 'omni-panel' })
    expect(isCoreBox()).toBe(true)
  })

  it('still records unknown values under their raw keys', () => {
    asPreload(['electron', '--touch-type=not-a-real-type'])

    const mapper = useArgMapper()
    expect(mapper.touchType).toBeUndefined()
    expect(mapper.rawTouchType).toBe('not-a-real-type')
  })

  it('caches a non-empty parse instead of re-reading argv', () => {
    asPreload(['electron', '--touch-type=main'])
    useArgMapper()

    // Argv changing underneath must not matter: a resolved role is stable for the window's life.
    ;(globalThis as any).process.argv = ['electron', '--touch-type=core-box']
    expect(useTouchType()).toBe('main')
  })
})
