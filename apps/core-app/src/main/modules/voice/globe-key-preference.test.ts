import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execFileSafe: vi.fn(), openExternal: vi.fn() }))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({ execFileSafe: mocks.execFileSafe }))
vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }))
vi.mock('../../utils/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }))

import {
  disableGlobeKeyAction,
  openKeyboardSettings,
  readGlobeKeyStatus
} from './globe-key-preference'

/**
 * The preference this module writes only exists on macOS, and every macOS assertion below is
 * unreachable on a Linux runner unless the platform is pinned. Leaving it to the host made the
 * suite green on a developer Mac and 7-failed on the Ubuntu CI runner, so the platform is part of
 * the fixture instead of the environment — and the non-macOS contract gets its own cases.
 */
const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}

afterEach(() => {
  setPlatform(originalPlatform)
})

describe('readGlobeKeyStatus', () => {
  beforeEach(() => {
    setPlatform('darwin')
    mocks.execFileSafe.mockReset()
    mocks.openExternal.mockReset()
  })

  it('reports the system as out of the way only for Do Nothing', async () => {
    mocks.execFileSafe.mockResolvedValue({ stdout: '0\n', stderr: '' })

    await expect(readGlobeKeyStatus()).resolves.toEqual({
      applies: true,
      systemActionActive: false
    })
  })

  it('reports every other configured action as active', async () => {
    mocks.execFileSafe.mockResolvedValue({ stdout: '2\n', stderr: '' })

    await expect(readGlobeKeyStatus()).resolves.toEqual({
      applies: true,
      systemActionActive: true
    })
  })

  /**
   * `defaults read` exits non-zero when the key was never written, which is the state every Mac
   * ships in. Treating that as "nothing to warn about" would hide the hint on exactly the
   * machines that need it, so the failure path has to stay on the loud side.
   */
  it('treats an unwritten preference as the live system default', async () => {
    mocks.execFileSafe.mockRejectedValue(new Error('does not exist'))

    await expect(readGlobeKeyStatus()).resolves.toEqual({
      applies: true,
      systemActionActive: true
    })
  })

  it('treats an unparsable value as unknown rather than as disabled', async () => {
    mocks.execFileSafe.mockResolvedValue({ stdout: 'nonsense\n', stderr: '' })

    await expect(readGlobeKeyStatus()).resolves.toEqual({
      applies: true,
      systemActionActive: true
    })
  })

  it('claims nothing on a platform that has no Globe key preference', async () => {
    setPlatform('linux')

    await expect(readGlobeKeyStatus()).resolves.toEqual({
      applies: false,
      systemActionActive: false
    })
    expect(mocks.execFileSafe).not.toHaveBeenCalled()
  })
})

describe('disableGlobeKeyAction', () => {
  beforeEach(() => {
    setPlatform('darwin')
    mocks.execFileSafe.mockReset()
  })

  /**
   * The write takes effect immediately on macOS 26 — no logout, no agent restart. Three separate
   * documents say otherwise and all of them are repeating each other; pressing the key is what
   * settled it. This pins the shape that discovery bought: write, then re-read.
   */
  it('writes Do Nothing and reports what the system says afterwards', async () => {
    mocks.execFileSafe.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'write') return { stdout: '', stderr: '' }
      return { stdout: '0\n', stderr: '' }
    })

    await expect(disableGlobeKeyAction()).resolves.toEqual({
      applies: true,
      systemActionActive: false
    })
    expect(mocks.execFileSafe).toHaveBeenCalledWith('defaults', [
      'write',
      'com.apple.HIToolbox',
      'AppleFnUsageType',
      '-int',
      '0'
    ])
  })

  /**
   * A write that fails, or that succeeds and changes nothing, must leave the row on screen. The
   * status comes from re-reading the preference, never from the write's own exit code, so the
   * user keeps the manual route instead of being told it is handled.
   */
  it('keeps reporting the system as active when the write does not stick', async () => {
    mocks.execFileSafe.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === 'write') throw new Error('write refused')
      return { stdout: '2\n', stderr: '' }
    })

    await expect(disableGlobeKeyAction()).resolves.toEqual({
      applies: true,
      systemActionActive: true
    })
  })

  it('writes nothing where there is no such preference to write', async () => {
    setPlatform('win32')

    await expect(disableGlobeKeyAction()).resolves.toEqual({
      applies: false,
      systemActionActive: false
    })
    expect(mocks.execFileSafe).not.toHaveBeenCalled()
  })
})

describe('openKeyboardSettings', () => {
  beforeEach(() => {
    setPlatform('darwin')
    mocks.openExternal.mockReset()
  })

  it('opens the pane that owns the Globe key preference', async () => {
    mocks.openExternal.mockResolvedValue(undefined)

    await expect(openKeyboardSettings()).resolves.toBe(true)
    expect(mocks.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.Keyboard-Settings.extension'
    )
  })

  it('reports a refused open instead of throwing at the settings page', async () => {
    mocks.openExternal.mockRejectedValue(new Error('no handler'))

    await expect(openKeyboardSettings()).resolves.toBe(false)
  })

  it('reports no pane to open away from macOS', async () => {
    setPlatform('linux')

    await expect(openKeyboardSettings()).resolves.toBe(false)
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })
})
