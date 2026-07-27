import { afterEach, describe, expect, it, vi } from 'vitest'

const { getFileIconMock } = vi.hoisted(() => ({
  getFileIconMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getFileIcon: getFileIconMock
  }
}))

import { canUseElectronFileIcon, getElectronFileIcon } from './electron-file-icon'

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform
  })
}

afterEach(() => {
  setPlatform(originalPlatform)
  vi.clearAllMocks()
})

describe('electron file icon boundary', () => {
  it('rejects the unsupported large size on Darwin before entering Electron', async () => {
    setPlatform('darwin')

    expect(canUseElectronFileIcon({ size: 'large' })).toBe(false)
    await expect(
      getElectronFileIcon('/Applications/Tuff.app', { size: 'large' })
    ).resolves.toBeNull()
    expect(getFileIconMock).not.toHaveBeenCalled()
  })

  it.each(['small', 'normal'] as const)('allows %s file icons on Darwin', async (size) => {
    setPlatform('darwin')
    const icon = { size }
    getFileIconMock.mockResolvedValue(icon)

    expect(canUseElectronFileIcon({ size })).toBe(true)
    await expect(getElectronFileIcon('/Applications/Tuff.app', { size })).resolves.toBe(icon)
    expect(getFileIconMock).toHaveBeenCalledWith('/Applications/Tuff.app', { size })
  })

  it('does not impose the Darwin size rule on other platforms', async () => {
    setPlatform('win32')
    const icon = { size: 'large' }
    getFileIconMock.mockResolvedValue(icon)

    expect(canUseElectronFileIcon({ size: 'large' })).toBe(true)
    await expect(getElectronFileIcon('C:\\Apps\\Tuff.exe', { size: 'large' })).resolves.toBe(icon)
  })
})
