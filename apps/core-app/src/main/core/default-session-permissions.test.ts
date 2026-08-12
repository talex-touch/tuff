import { describe, expect, it, vi } from 'vitest'
import {
  installDefaultSessionPermissionPolicy,
  isDefaultSessionPermissionAllowed
} from './default-session-permissions'

/**
 * defaultSession had no permission handlers, and Electron approves by default, so
 * the privileged renderer could take camera, microphone, geolocation or
 * clipboard-read silently (#696).
 *
 * The plugin session's blanket deny was not an option here: the renderer really
 * does use microphone, clipboard and notifications. These pin both halves — that
 * the dangerous ones are refused, and that the three the app depends on still
 * work, since the failure mode of getting this wrong is a feature that silently
 * stops functioning.
 */

describe('default session permission policy', () => {
  it('refuses the permissions no caller in the renderer asks for', () => {
    for (const permission of [
      'geolocation',
      'midi',
      'midiSysex',
      'usb',
      'serial',
      'hid',
      'bluetooth',
      'openExternal',
      'pointerLock',
      'idle-detection',
      'window-management',
      'unknown-future-permission'
    ]) {
      expect(isDefaultSessionPermissionAllowed(permission)).toBe(false)
    }
  })

  it('allows the three the renderer actually uses', () => {
    // VoicePanel.vue (getUserMedia), the clipboard callers, and new Notification().
    expect(isDefaultSessionPermissionAllowed('media', { mediaTypes: ['audio'] })).toBe(true)
    expect(isDefaultSessionPermissionAllowed('clipboard-read')).toBe(true)
    expect(isDefaultSessionPermissionAllowed('clipboard-sanitized-write')).toBe(true)
    expect(isDefaultSessionPermissionAllowed('notifications')).toBe(true)
  })

  it('refuses the camera even though microphone shares the media permission', () => {
    // Electron reports both under 'media'. The renderer has no camera caller, so
    // allowing voice input must not hand over the camera with it.
    expect(isDefaultSessionPermissionAllowed('media', { mediaTypes: ['video'] })).toBe(false)
    expect(isDefaultSessionPermissionAllowed('media', { mediaTypes: ['audio', 'video'] })).toBe(
      false
    )
  })

  it('treats a media request with no stated types as allowed audio', () => {
    // Some callers omit mediaTypes; refusing those would break voice input, and
    // the video branch above is what actually guards the camera.
    expect(isDefaultSessionPermissionAllowed('media')).toBe(true)
  })

  it('installs both handlers, since either one missing falls back to approve', () => {
    const setPermissionCheckHandler = vi.fn()
    const setPermissionRequestHandler = vi.fn()

    installDefaultSessionPermissionPolicy({
      setPermissionCheckHandler,
      setPermissionRequestHandler
    })

    expect(setPermissionCheckHandler).toHaveBeenCalledTimes(1)
    expect(setPermissionRequestHandler).toHaveBeenCalledTimes(1)
    expect(setPermissionCheckHandler.mock.calls[0]![0]).toBeTypeOf('function')
    expect(setPermissionRequestHandler.mock.calls[0]![0]).toBeTypeOf('function')
  })

  it('answers through the handlers it installed, not just through the predicate', () => {
    let check: ((wc: unknown, p: string, o: string, d: unknown) => boolean) | undefined
    let request:
      | ((wc: unknown, p: string, cb: (granted: boolean) => void, d: unknown) => void)
      | undefined
    const denied: string[] = []

    installDefaultSessionPermissionPolicy(
      {
        setPermissionCheckHandler: (handler) => {
          check = handler as typeof check
        },
        setPermissionRequestHandler: (handler) => {
          request = handler as typeof request
        }
      },
      { onDenied: (permission) => denied.push(permission) }
    )

    expect(check!(null, 'geolocation', 'file://', undefined)).toBe(false)
    expect(check!(null, 'clipboard-read', 'file://', undefined)).toBe(true)

    const granted: boolean[] = []
    request!(null, 'media', (value) => granted.push(value), { mediaTypes: ['video'] })
    request!(null, 'media', (value) => granted.push(value), { mediaTypes: ['audio'] })

    expect(granted).toEqual([false, true])
    expect(denied).toEqual(['geolocation', 'media'])
  })
})

describe('default session permission policy wiring', () => {
  it('is actually applied to session.defaultSession at app ready', async () => {
    // Positive control on the wiring, not on the policy. Everything above would
    // pass just as well if this module were never called — which is the whole
    // failure mode here, since the pre-existing bug was an absent handler rather
    // than a wrong one.
    //
    // Asserted against the source because precore installs it inside
    // app.whenReady(); importing it would drag in the Electron app lifecycle.
    const { readFileSync } = await import('node:fs')
    const { dirname, resolve } = await import('node:path')
    const { fileURLToPath } = await import('node:url')

    const precore = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'precore.ts'),
      'utf8'
    )

    expect(precore).toContain('installDefaultSessionPermissionPolicy(session.defaultSession')
    // Before whenReady there is no session; after modules load, windows already
    // exist. The call has to sit inside the whenReady handler.
    const readyIndex = precore.indexOf('app.whenReady()')
    const installIndex = precore.indexOf('installDefaultSessionPermissionPolicy(')
    expect(readyIndex).toBeGreaterThan(-1)
    expect(installIndex).toBeGreaterThan(readyIndex)
  })
})
