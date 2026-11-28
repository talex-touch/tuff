import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  clipboardWriteTextMock,
  execFileSafeMock,
  writeFileMock,
  unlinkMock,
  openExternalMock,
  showShareResultMock,
  checkPermissionMock
} = vi.hoisted(() => ({
  clipboardWriteTextMock: vi.fn(),
  execFileSafeMock: vi.fn(async () => ({ stdout: '', stderr: '' })),
  writeFileMock: vi.fn(async () => undefined),
  unlinkMock: vi.fn(async () => undefined),
  openExternalMock: vi.fn(async () => undefined),
  showShareResultMock: vi.fn(),
  checkPermissionMock: vi.fn(() => ({ allowed: true }))
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  execFileSafe: execFileSafeMock
}))

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: writeFileMock,
    unlink: unlinkMock
  }
}))

vi.mock('../permission', () => ({
  getPermissionModule: vi.fn(() => ({
    checkPermission: checkPermissionMock
  }))
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock
  },
  clipboard: {
    writeText: clipboardWriteTextMock
  }
}))

vi.mock('../../utils/i18n-helper', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    params ? `${key} ${JSON.stringify(params)}` : key
}))

vi.mock('./share-notification', () => ({
  shareNotificationService: {
    showShareResult: showShareResultMock
  }
}))

import { nativeShareService } from './native-share'

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('native-share targets', () => {
  it('darwin exposes real system share targets only', async () => {
    await withPlatform('darwin', () => {
      expect(nativeShareService.getAvailableTargets().map((item) => item.id)).toEqual([
        'system-share',
        'airdrop',
        'mail',
        'messages'
      ])
    })
  })

  it('Windows and Linux only expose mail target', async () => {
    await withPlatform('win32', () => {
      expect(nativeShareService.getAvailableTargets().map((item) => item.id)).toEqual(['mail'])
    })
    await withPlatform('linux', () => {
      expect(nativeShareService.getAvailableTargets().map((item) => item.id)).toEqual(['mail'])
    })
  })
})

describe('native-share behavior', () => {
  it('materializes image data URL to temp file on macOS before sharing', async () => {
    await withPlatform('darwin', async () => {
      const result = await nativeShareService.share({
        target: 'mail',
        title: 'Screenshot',
        text: 'data:image/png;base64,aGVsbG8='
      })

      expect(result).toEqual({ success: true, target: 'mail' })
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      const [tempPath, , writeOpts] = (writeFileMock.mock.calls[0] ?? []) as unknown as [
        unknown,
        unknown,
        Record<string, unknown>
      ]
      expect(String(tempPath)).toContain('tuff-native-share-')
      expect(writeOpts).toEqual({ flag: 'wx', mode: 0o600 })
      expect(execFileSafeMock).toHaveBeenCalledWith(
        'osascript',
        expect.arrayContaining([expect.stringContaining('Mail')])
      )
      expect(showShareResultMock).toHaveBeenCalledWith({ success: true, target: 'mail' })

      await nativeShareService.cleanupTempFiles()
      expect(unlinkMock).toHaveBeenCalledWith(String(tempPath))
    })
  })

  it('rejects oversized image data URLs and cleans up temp files on share failure', async () => {
    await withPlatform('darwin', async () => {
      const oversized = `data:image/png;base64,${'A'.repeat(7_500_000)}`
      const oversizedResult = await nativeShareService.share({
        target: 'mail',
        text: oversized
      })
      expect(oversizedResult.success).toBe(false)
      expect(writeFileMock).not.toHaveBeenCalled()

      execFileSafeMock.mockRejectedValueOnce(new Error('Mail crashed'))
      const failResult = await nativeShareService.share({
        target: 'mail',
        text: 'data:image/png;base64,aGVsbG8='
      })
      expect(failResult.success).toBe(false)
      expect(writeFileMock).toHaveBeenCalledTimes(1)
      expect(unlinkMock).toHaveBeenCalledTimes(1)
    })
  })

  it('enforces clipboard:write for plugin callers invoking macOS Messages share', async () => {
    await withPlatform('darwin', async () => {
      checkPermissionMock.mockReturnValueOnce({ allowed: false })
      const result = await nativeShareService.share(
        {
          target: 'messages',
          text: 'secret from plugin'
        },
        { callerPluginId: 'untrusted-plugin', callerSdkApi: 260101 }
      )
      expect(result.success).toBe(false)
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    })
  })

  it('fails honestly for unavailable Windows share targets', async () => {
    await withPlatform('win32', async () => {
      const result = await nativeShareService.share({
        target: 'system',
        text: 'hello'
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('nativeShare.errors.noShareSheet {"platform":"Windows"}')
      expect(openExternalMock).not.toHaveBeenCalled()
      expect(showShareResultMock).toHaveBeenCalledWith(result)
    })
  })

  it('marks macOS Messages share as requiring user action instead of pretending delivery completed', async () => {
    await withPlatform('darwin', async () => {
      const result = await nativeShareService.share({
        target: 'messages',
        text: 'hello from flow'
      })

      expect(result).toEqual({
        success: true,
        target: 'messages',
        requiresUserAction: true
      })
      expect(clipboardWriteTextMock).toHaveBeenCalledWith('hello from flow')
      expect(showShareResultMock).toHaveBeenCalledWith({
        success: true,
        target: 'messages',
        requiresUserAction: true
      })
    })
  })
})
