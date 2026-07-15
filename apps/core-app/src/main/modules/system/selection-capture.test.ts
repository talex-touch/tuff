import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CAPTURED_AT = 1_784_030_400_000

const mocks = vi.hoisted(() => ({
  availableFormats: vi.fn(),
  clear: vi.fn(),
  execFileAsync: vi.fn(),
  getSelectionCaptureCapabilityPatch: vi.fn(),
  getXdotoolUnavailableReason: vi.fn(),
  readBuffer: vi.fn(),
  readText: vi.fn(),
  sendPlatformShortcut: vi.fn(),
  writeBuffer: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    availableFormats: mocks.availableFormats,
    clear: mocks.clear,
    readBuffer: mocks.readBuffer,
    readText: mocks.readText,
    writeBuffer: mocks.writeBuffer
  }
}))

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mocks.execFileAsync)
}))

vi.mock('../platform/capability-adapter', () => ({
  getSelectionCaptureCapabilityPatch: mocks.getSelectionCaptureCapabilityPatch
}))

vi.mock('./desktop-shortcut', () => ({
  sendPlatformShortcut: mocks.sendPlatformShortcut
}))

vi.mock('./linux-desktop-tools', () => ({
  getXdotoolUnavailableReason: mocks.getXdotoolUnavailableReason
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn()
  }))
}))

import { selectionCaptureService } from './selection-capture'

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
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

async function advanceCopyPollingDelay(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(120)
}

describe('selectionCaptureService.capture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
    mocks.availableFormats.mockReturnValue([])
    mocks.execFileAsync.mockResolvedValue({ stdout: '', stderr: '' })
    mocks.getSelectionCaptureCapabilityPatch.mockResolvedValue({ supportLevel: 'supported' })
    mocks.getXdotoolUnavailableReason.mockReturnValue('xdotool unavailable')
    mocks.readText.mockReturnValue('')
    mocks.sendPlatformShortcut.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prefers direct macOS accessibility text without touching the clipboard fallback', async () => {
    mocks.getSelectionCaptureCapabilityPatch.mockResolvedValue({
      supportLevel: 'supported',
      limitations: ['Direct AX selection is available.']
    })
    mocks.execFileAsync.mockResolvedValue({ stdout: '  Direct AX selection  \n', stderr: '' })

    const result = await withPlatform('darwin', () =>
      selectionCaptureService.capture({ enabled: true })
    )

    expect(result).toEqual({
      text: 'Direct AX selection',
      supportLevel: 'supported',
      limitations: ['Direct AX selection is available.'],
      capturedAt: CAPTURED_AT
    })
    expect(mocks.execFileAsync).toHaveBeenCalledWith('osascript', expect.any(Array))
    expect(mocks.sendPlatformShortcut).not.toHaveBeenCalled()
    expect(mocks.availableFormats).not.toHaveBeenCalled()
  })

  it('captures through the platform shortcut and restores every clipboard format byte-for-byte', async () => {
    const snapshot = [
      { format: 'text/plain', data: Buffer.from('original plain', 'utf8') },
      { format: 'text/html', data: Buffer.from('<b>original html</b>', 'utf8') },
      { format: 'application/x-app-state', data: Buffer.from([0x00, 0xff, 0x01]) }
    ]
    mocks.getSelectionCaptureCapabilityPatch.mockResolvedValue({
      supportLevel: 'best_effort',
      limitations: ['Copy shortcut may be ignored by the focused app.']
    })
    mocks.availableFormats.mockReturnValue(snapshot.map(({ format }) => format))
    mocks.readBuffer.mockImplementation(
      (format: string) => snapshot.find((item) => item.format === format)?.data
    )
    mocks.readText.mockReturnValue('  copied selection  ')

    const capture = withPlatform('linux', () => selectionCaptureService.capture({ enabled: true }))
    await advanceCopyPollingDelay()

    await expect(capture).resolves.toEqual({
      text: 'copied selection',
      supportLevel: 'best_effort',
      limitations: ['Copy shortcut may be ignored by the focused app.'],
      capturedAt: CAPTURED_AT
    })
    expect(mocks.sendPlatformShortcut).toHaveBeenCalledWith('copy')
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(mocks.writeBuffer).toHaveBeenNthCalledWith(1, 'text/plain', snapshot[0].data)
    expect(mocks.writeBuffer).toHaveBeenNthCalledWith(2, 'text/html', snapshot[1].data)
    expect(mocks.writeBuffer).toHaveBeenNthCalledWith(
      3,
      'application/x-app-state',
      snapshot[2].data
    )
  })

  it('restores the clipboard when the focused app yields no selected text', async () => {
    const original = Buffer.from('original image payload')
    mocks.availableFormats.mockReturnValue(['image/png'])
    mocks.readBuffer.mockReturnValue(original)
    mocks.readText.mockReturnValue(' \n ')

    const capture = withPlatform('win32', () => selectionCaptureService.capture({ enabled: true }))
    await advanceCopyPollingDelay()

    await expect(capture).resolves.toMatchObject({
      text: '',
      supportLevel: 'supported',
      issueCode: 'empty',
      issueMessage: 'No selected text was captured from the active application.',
      capturedAt: CAPTURED_AT
    })
    expect(mocks.writeBuffer).toHaveBeenCalledWith('image/png', original)
  })

  it('restores the clipboard when sending the copy shortcut fails', async () => {
    const original = Buffer.from('original rich text')
    mocks.availableFormats.mockReturnValue(['text/rtf'])
    mocks.readBuffer.mockReturnValue(original)
    mocks.sendPlatformShortcut.mockRejectedValue(new Error('copy permission denied'))

    const result = await withPlatform('linux', () =>
      selectionCaptureService.capture({ enabled: true })
    )

    expect(result).toMatchObject({
      text: '',
      supportLevel: 'supported',
      issueCode: 'failed',
      issueMessage: 'copy permission denied',
      capturedAt: CAPTURED_AT
    })
    expect(mocks.writeBuffer).toHaveBeenCalledWith('text/rtf', original)
  })

  it.each([
    {
      name: 'disabled capture',
      capability: {
        supportLevel: 'unsupported',
        issueCode: 'DISABLED',
        reason: 'Selection capture is disabled.',
        limitations: ['Enable selection capture to use this command.']
      },
      enabled: false,
      expectedIssueCode: 'disabled'
    },
    {
      name: 'unsupported platform capture',
      capability: {
        supportLevel: 'unsupported',
        issueCode: 'PLATFORM_UNSUPPORTED',
        reason: 'Selection capture is unavailable on this platform.',
        limitations: ['No supported capture backend is installed.']
      },
      enabled: true,
      expectedIssueCode: 'unsupported'
    }
  ])(
    'returns explicit metadata for $name without attempting clipboard capture',
    async ({ capability, enabled, expectedIssueCode }) => {
      mocks.getSelectionCaptureCapabilityPatch.mockResolvedValue(capability)

      const result = await withPlatform('linux', () => selectionCaptureService.capture({ enabled }))

      expect(result).toEqual({
        text: '',
        supportLevel: 'unsupported',
        issueCode: expectedIssueCode,
        issueMessage: capability.reason,
        limitations: capability.limitations,
        capturedAt: CAPTURED_AT
      })
      expect(mocks.availableFormats).not.toHaveBeenCalled()
      expect(mocks.sendPlatformShortcut).not.toHaveBeenCalled()
    }
  )

  it('fails closed without selected text when clipboard restoration fails', async () => {
    mocks.availableFormats.mockReturnValue(['text/html'])
    mocks.readBuffer.mockReturnValue(Buffer.from('<i>original</i>'))
    mocks.readText.mockReturnValue('new selection')
    mocks.writeBuffer.mockImplementation(() => {
      throw new Error('clipboard locked')
    })

    const capture = withPlatform('linux', () => selectionCaptureService.capture({ enabled: true }))
    await advanceCopyPollingDelay()

    await expect(capture).resolves.toEqual({
      text: '',
      supportLevel: 'supported',
      limitations: undefined,
      issueCode: 'failed',
      issueMessage: 'Clipboard snapshot restore failed after selection capture.',
      capturedAt: CAPTURED_AT
    })
  })
})
