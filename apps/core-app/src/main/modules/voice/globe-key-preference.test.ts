import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execFileSafe: vi.fn(), openExternal: vi.fn() }))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({ execFileSafe: mocks.execFileSafe }))
vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }))
vi.mock('../../utils/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }))

import { openKeyboardSettings, readGlobeKeyStatus } from './globe-key-preference'

describe('readGlobeKeyStatus', () => {
  beforeEach(() => {
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
})

describe('openKeyboardSettings', () => {
  beforeEach(() => {
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
})
