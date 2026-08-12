import { beforeEach, describe, expect, it, vi } from 'vitest'

const validateExternalUrlMock = vi.fn()
const openExternalMock = vi.fn()
const clipboardMock = {
  readText: vi.fn(() => 'text'),
  writeText: vi.fn(),
  readImage: vi.fn(() => 'image'),
  writeImage: vi.fn(),
  clear: vi.fn(),
  has: vi.fn(() => true)
}

vi.mock('electron', () => ({
  clipboard: clipboardMock,
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 0 })),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true }))
  },
  shell: { openExternal: openExternalMock }
}))

vi.mock('../../utils/external-url-policy', () => ({
  validateExternalUrl: validateExternalUrlMock
}))

const {
  createRemovedChannelError,
  createSafePluginClipboardApi,
  createSafePluginDialogApi,
  createSafePluginOpenUrl,
  withPluginSdkapiPayload
} = await import('./plugin-safe-api')

function fakeLogger(): { warn: ReturnType<typeof vi.fn> } {
  return { warn: vi.fn() }
}

/**
 * The reason this file exists (#339).
 *
 * A plugin passes a URL straight from its own code and this wrapper is the last thing before
 * `shell.openExternal`. `external-url-policy` has its own tests; what had none was the wrapper
 * deciding whether to call it, because it sat among four thousand lines of `plugin.ts` with no
 * export to reach it by.
 */
describe('createSafePluginOpenUrl', () => {
  beforeEach(() => {
    validateExternalUrlMock.mockReset()
    openExternalMock.mockReset()
  })

  it('opens the URL the policy returned, not the one the plugin passed', async () => {
    // The policy may normalise; opening the raw input would defeat any normalisation it did.
    validateExternalUrlMock.mockReturnValue({
      allowed: true,
      url: 'https://example.test/normalised'
    })

    await createSafePluginOpenUrl('touch-demo', fakeLogger() as never)('https://example.test')

    expect(openExternalMock).toHaveBeenCalledWith('https://example.test/normalised')
  })

  it('never reaches the shell when the policy refuses', async () => {
    validateExternalUrlMock.mockReturnValue({
      allowed: false,
      reason: 'protocol-not-allowed',
      protocol: 'file:'
    })
    const logger = fakeLogger()

    await expect(
      createSafePluginOpenUrl('touch-demo', logger as never)('file:///etc/passwd')
    ).rejects.toThrow('PLUGIN_OPEN_URL_BLOCKED:protocol-not-allowed')

    expect(openExternalMock).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  /**
   * The thrown message carries the reason, and the log carries the reason and protocol. Neither
   * carries the URL — a blocked `file://` or a credential-bearing link would otherwise end up in
   * the plugin log verbatim.
   */
  it('keeps the refused URL out of the error and the log', async () => {
    validateExternalUrlMock.mockReturnValue({
      allowed: false,
      reason: 'protocol-not-allowed',
      protocol: 'file:'
    })
    const logger = fakeLogger()
    const secret = 'file:///Users/someone/.ssh/id_rsa'

    await expect(
      createSafePluginOpenUrl('touch-demo', logger as never)(secret)
    ).rejects.not.toThrow(secret)

    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(secret)
  })

  it('rethrows a shell failure rather than reporting success', async () => {
    validateExternalUrlMock.mockReturnValue({ allowed: true, url: 'https://example.test' })
    openExternalMock.mockRejectedValue(new Error('no handler'))
    const logger = fakeLogger()

    await expect(
      createSafePluginOpenUrl('touch-demo', logger as never)('https://example.test')
    ).rejects.toThrow('no handler')

    expect(logger.warn).toHaveBeenCalledOnce()
  })
})

describe('createSafePluginClipboardApi', () => {
  it('exposes exactly the six clipboard methods plus copyAndPaste', () => {
    const copyAndPaste = vi.fn()
    const api = createSafePluginClipboardApi(copyAndPaste as never)

    // A named set is only worth having if something notices when it grows. `writeBookmark`,
    // `readBuffer` and `writeBuffer` are real Electron clipboard methods deliberately left out.
    expect(Object.keys(api).sort()).toEqual([
      'clear',
      'copyAndPaste',
      'has',
      'readImage',
      'readText',
      'writeImage',
      'writeText'
    ])
  })

  it('forwards to Electron rather than reimplementing anything', () => {
    const api = createSafePluginClipboardApi(vi.fn() as never)

    expect(api.readText()).toBe('text')
    api.writeText('hello')
    expect(clipboardMock.writeText).toHaveBeenCalledWith('hello')
  })
})

describe('createSafePluginDialogApi', () => {
  it('exposes exactly the three dialog methods', () => {
    // `showErrorBox` and `showCertificateTrustDialog` are the omissions that matter here.
    expect(Object.keys(createSafePluginDialogApi()).sort()).toEqual([
      'showMessageBox',
      'showOpenDialog',
      'showSaveDialog'
    ])
  })
})

describe('withPluginSdkapiPayload', () => {
  it('stamps the sdkapi onto an object payload', () => {
    expect(withPluginSdkapiPayload({ a: 1 }, 260615)).toEqual({ a: 1, _sdkapi: 260615 })
  })

  /**
   * Arrays, primitives and null are returned untouched. Spreading an array would turn it into an
   * object keyed by index, which reaches the handler as a shape nothing downstream expects.
   */
  it('leaves anything that is not a plain object alone', () => {
    for (const payload of [[1, 2], 'text', 42, null, undefined])
      expect(withPluginSdkapiPayload(payload, 260615)).toBe(payload)
  })

  it('leaves the payload alone when there is no sdkapi to stamp', () => {
    const payload = { a: 1 }

    expect(withPluginSdkapiPayload(payload, undefined)).toBe(payload)
    expect(withPluginSdkapiPayload(payload, '260615' as never)).toBe(payload)
  })

  it('overwrites an _sdkapi the plugin supplied itself', () => {
    expect(withPluginSdkapiPayload({ _sdkapi: 1 }, 260615)).toEqual({ _sdkapi: 260615 })
  })
})

describe('createRemovedChannelError', () => {
  it('names the capability and points at the replacement', () => {
    const error = createRemovedChannelError('channel.raw')

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('channel.raw')
    expect(error.message).toContain('typed transport')
  })
})
