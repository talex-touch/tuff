import { describe, expect, it } from 'vitest'
import {
  BoxWindowOption,
  MainWindowOption,
  ScreenshotEditorWindowOption,
  ScreenshotOverlayWindowOption
} from '../config/default'
import {
  OPAQUE_WINDOW_BACKGROUND,
  OPAQUE_WINDOW_ENV_VAR,
  shouldApplyMicaFallback,
  shouldForceOpaqueWindow,
  withOpaqueFallback
} from './window-effects'

describe('window effects platform guards', () => {
  it('only applies mica fallback on Windows non-mica windows', () => {
    expect(shouldApplyMicaFallback('win32', false)).toBe(true)
    expect(shouldApplyMicaFallback('win32', true)).toBe(false)
    expect(shouldApplyMicaFallback('linux', false)).toBe(false)
    expect(shouldApplyMicaFallback('darwin', false)).toBe(false)
  })
})

describe('opaque window escape hatch', () => {
  const ON = { [OPAQUE_WINDOW_ENV_VAR]: '1' }

  it('reads only the explicit opt-in values', () => {
    expect(shouldForceOpaqueWindow({ [OPAQUE_WINDOW_ENV_VAR]: '1' })).toBe(true)
    expect(shouldForceOpaqueWindow({ [OPAQUE_WINDOW_ENV_VAR]: 'true' })).toBe(true)
    expect(shouldForceOpaqueWindow({ [OPAQUE_WINDOW_ENV_VAR]: '0' })).toBe(false)
    expect(shouldForceOpaqueWindow({ [OPAQUE_WINDOW_ENV_VAR]: '' })).toBe(false)
    expect(shouldForceOpaqueWindow({})).toBe(false)
  })

  it('changes nothing while the hatch is closed', () => {
    const options = { transparent: true, frame: false }
    expect(withOpaqueFallback(options, {})).toBe(options)
  })

  it('makes a transparent window with no colour of its own opaque', () => {
    expect(withOpaqueFallback({ transparent: true, frame: false }, ON)).toEqual({
      transparent: false,
      frame: false,
      backgroundColor: OPAQUE_WINDOW_BACKGROUND
    })
  })

  it('leaves a window that named its own colour alone', () => {
    // A capture overlay you cannot see through is a capture overlay you cannot use, so the
    // deliberate `#00000000` outranks the escape hatch.
    const overlay = { transparent: true, backgroundColor: '#00000000' }
    expect(withOpaqueFallback(overlay, ON)).toBe(overlay)
  })

  it('leaves an already-opaque window alone', () => {
    const editor = { transparent: false, backgroundColor: '#111315' }
    expect(withOpaqueFallback(editor, ON)).toBe(editor)
  })

  it('tolerates being handed nothing', () => {
    expect(withOpaqueFallback(undefined, ON)).toBeUndefined()
  })

  // Pins the hatch against the options the app actually ships rather than hand-written
  // stand-ins, so a window option changing shape cannot leave these tests passing on
  // examples that no longer resemble it.
  it('covers the shipped window options it is meant to rescue', () => {
    for (const shipped of [MainWindowOption, BoxWindowOption]) {
      expect(shipped.transparent).toBe(true)
      expect(shipped.backgroundColor).toBeUndefined()

      const rescued = withOpaqueFallback(shipped, ON)
      expect(rescued?.transparent).toBe(false)
      expect(rescued?.backgroundColor).toBe(OPAQUE_WINDOW_BACKGROUND)
    }
  })

  it('leaves the shipped screenshot windows exactly as they are', () => {
    expect(withOpaqueFallback(ScreenshotOverlayWindowOption, ON)).toBe(
      ScreenshotOverlayWindowOption
    )
    expect(withOpaqueFallback(ScreenshotEditorWindowOption, ON)).toBe(ScreenshotEditorWindowOption)
  })
})
