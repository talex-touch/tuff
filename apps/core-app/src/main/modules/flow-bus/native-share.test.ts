import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  clipboardWriteTextMock,
  execFileSafeMock,
  writeFileMock,
  openExternalMock,
  showShareResultMock
} = vi.hoisted(() => ({
  clipboardWriteTextMock: vi.fn(),
  execFileSafeMock: vi.fn(async () => ({ stdout: '', stderr: '' })),
  writeFileMock: vi.fn(async () => undefined),
  openExternalMock: vi.fn(async () => undefined),
  showShareResultMock: vi.fn()
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  execFileSafe: execFileSafeMock
}))

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: writeFileMock
  }
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: openExternalMock
  },
  clipboard: {
    writeText: clipboardWriteTextMock
  }
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
      const [tempPath] = (writeFileMock.mock.calls[0] ?? []) as unknown as [unknown, unknown]
      expect(String(tempPath)).toContain('tuff-native-share-')
      expect(execFileSafeMock).toHaveBeenCalledWith(
        'osascript',
        expect.arrayContaining([expect.stringContaining('Mail')])
      )
      expect(showShareResultMock).toHaveBeenCalledWith({ success: true, target: 'mail' })
    })
  })

  it('fails honestly for unavailable Windows share targets', async () => {
    await withPlatform('win32', async () => {
      const result = await nativeShareService.share({
        target: 'system',
        text: 'hello'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not provide a system share sheet')
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
