import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  clipboardWriteTextMock,
  execFileSafeMock,
  writeFileMock,
  unlinkMock,
  openExternalMock,
  showShareResultMock,
  enforcePermissionMock,
  getPermissionModuleMock
} = vi.hoisted(() => {
  const enforcePermissionMock = vi.fn()
  return {
    clipboardWriteTextMock: vi.fn(),
    execFileSafeMock: vi.fn(async () => ({ stdout: '', stderr: '' })),
    writeFileMock: vi.fn(async () => undefined),
    unlinkMock: vi.fn(async () => undefined),
    openExternalMock: vi.fn(async () => undefined),
    showShareResultMock: vi.fn(),
    enforcePermissionMock,
    getPermissionModuleMock: vi.fn<
      () => { enforcePermission: typeof enforcePermissionMock } | null
    >(() => ({
      enforcePermission: enforcePermissionMock
    }))
  }
})

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
  getPermissionModule: getPermissionModuleMock
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
      // Denied path: enforcePermission throws -> blocked before clipboard write
      enforcePermissionMock.mockImplementationOnce(() => {
        throw new Error('Permission denied: clipboard:write')
      })
      const deniedResult = await nativeShareService.share(
        {
          target: 'messages',
          text: 'secret from plugin'
        },
        { callerPluginId: 'untrusted-plugin', callerSdkApi: 260101 }
      )
      expect(deniedResult.success).toBe(false)
      expect(deniedResult.error).toBe('nativeShare.errors.systemFailed')
      expect(enforcePermissionMock).toHaveBeenCalledWith(
        'untrusted-plugin',
        'clipboard:write',
        260101
      )
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()

      // Fail-closed path: null permission module -> blocked before clipboard write
      getPermissionModuleMock.mockReturnValueOnce(null)
      const unavailableResult = await nativeShareService.share(
        {
          target: 'messages',
          text: 'secret while perm unavailable'
        },
        { callerPluginId: 'untrusted-plugin', callerSdkApi: 260101 }
      )
      expect(unavailableResult.success).toBe(false)
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()

      // Allowed path: enforcePermission succeeds -> writes clipboard and succeeds
      const allowedResult = await nativeShareService.share(
        {
          target: 'messages',
          text: 'allowed plugin message'
        },
        { callerPluginId: 'trusted-plugin', callerSdkApi: 260101 }
      )
      expect(allowedResult).toEqual({
        success: true,
        target: 'messages',
        requiresUserAction: true
      })
      expect(enforcePermissionMock).toHaveBeenLastCalledWith(
        'trusted-plugin',
        'clipboard:write',
        260101
      )
      expect(clipboardWriteTextMock).toHaveBeenCalledWith('allowed plugin message')
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
