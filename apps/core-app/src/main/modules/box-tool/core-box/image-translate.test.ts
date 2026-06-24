import { afterEach, describe, expect, it, vi } from 'vitest'

const sceneMocks = vi.hoisted(() => ({
  runNexusScene: vi.fn(),
  extractTranslatedImageFromSceneRun: vi.fn()
}))

const electronMocks = vi.hoisted(() => ({
  readImage: vi.fn(),
  writeImage: vi.fn(),
  createFromBuffer: vi.fn(() => ({
    isEmpty: () => false,
    toPNG: () => Buffer.from('native-image')
  }))
}))

const pinWindowMocks = vi.hoisted(() => ({
  openImageTranslatePinWindow: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
    readImage: electronMocks.readImage,
    writeImage: electronMocks.writeImage
  },
  nativeImage: {
    createFromBuffer: electronMocks.createFromBuffer
  }
}))

vi.mock('../../nexus/scene-client', () => sceneMocks)
vi.mock('./image-translate-pin-window', () => ({
  openImageTranslatePinWindow: pinWindowMocks.openImageTranslatePinWindow
}))

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  normalizeImageBase64Payload,
  translateClipboardImage,
  translateCoreBoxImageItem,
  translateImageBase64
} from './image-translate'

describe('normalizeImageBase64Payload', () => {
  it('normalizes raw base64 and data URL image payloads', () => {
    expect(normalizeImageBase64Payload(' raw-image-base64 ')).toBe('raw-image-base64')
    expect(normalizeImageBase64Payload(' data:image/png;base64, translated-image ')).toBe(
      'translated-image'
    )
    expect(normalizeImageBase64Payload('data:image/png;base64,')).toBeNull()
    expect(normalizeImageBase64Payload('  ')).toBeNull()
  })
})

describe('translateCoreBoxImageItem', () => {
  afterEach(() => {
    delete process.env.TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE
    delete process.env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR
    delete process.env.TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE_CLIPBOARD_FILE
    vi.clearAllMocks()
  })

  it('runs image translate scene for clipboard image item and writes translated image', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'corebox-image-translate-'))
    const imagePath = path.join(tempDir, 'source.png')
    await writeFile(imagePath, Buffer.from('source-image'))

    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: Buffer.from('translated-image').toString('base64')
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      sourceText: 'hello',
      targetText: '你好'
    })

    const result = await translateCoreBoxImageItem({
      id: 'clipboard-1',
      kind: 'image',
      source: {
        id: 'clipboard-history',
        type: 'history',
        name: 'Clipboard History'
      },
      render: {
        mode: 'default',
        basic: {
          title: 'Image'
        }
      },
      meta: {
        raw: {
          type: 'image',
          content: imagePath
        }
      }
    })

    expect(result).toEqual({
      success: true,
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      sourceText: 'hello',
      targetText: '你好'
    })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: Buffer.from('source-image').toString('base64'),
        targetLang: 'zh'
      },
      capability: 'image.translate.e2e'
    })
    expect(electronMocks.createFromBuffer).toHaveBeenCalledWith(Buffer.from('translated-image'))
    expect(electronMocks.writeImage).toHaveBeenCalledTimes(1)
    expect(pinWindowMocks.openImageTranslatePinWindow).not.toHaveBeenCalled()
  })

  it('opens pin window instead of writing clipboard when requested', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'corebox-image-translate-'))
    const imagePath = path.join(tempDir, 'source.png')
    await writeFile(imagePath, Buffer.from('source-image'))

    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: Buffer.from('translated-image').toString('base64')
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })

    const result = await translateCoreBoxImageItem(
      {
        id: 'clipboard-1',
        kind: 'image',
        source: {
          id: 'clipboard-history',
          type: 'history',
          name: 'Clipboard History'
        },
        render: {
          mode: 'default',
          basic: {
            title: 'Image'
          }
        },
        meta: {
          raw: {
            type: 'image',
            content: imagePath
          }
        }
      },
      'zh',
      { openPinWindow: true }
    )

    expect(result).toMatchObject({ success: true })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: Buffer.from('source-image').toString('base64'),
        targetLang: 'zh'
      },
      capability: undefined
    })
    expect(pinWindowMocks.openImageTranslatePinWindow).toHaveBeenCalledWith({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
  })

  it('returns IMAGE_UNAVAILABLE when item has no readable image source', async () => {
    const result = await translateCoreBoxImageItem({
      id: 'clipboard-1',
      kind: 'image',
      source: {
        id: 'clipboard-history',
        type: 'history',
        name: 'Clipboard History'
      },
      render: {
        mode: 'default',
        basic: {
          title: 'Image'
        }
      },
      meta: {
        raw: {
          type: 'image',
          content: ''
        }
      }
    })

    expect(result).toMatchObject({
      success: false,
      code: 'IMAGE_UNAVAILABLE'
    })
    expect(sceneMocks.runNexusScene).not.toHaveBeenCalled()
  })

  it('returns IMAGE_UNAVAILABLE before scene execution for empty image payload', async () => {
    const result = await translateImageBase64(' ')

    expect(result).toMatchObject({
      success: false,
      code: 'IMAGE_UNAVAILABLE'
    })
    expect(sceneMocks.runNexusScene).not.toHaveBeenCalled()
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
    expect(pinWindowMocks.openImageTranslatePinWindow).not.toHaveBeenCalled()
  })

  it('runs image translate scene for current clipboard image and opens pin window', async () => {
    const sourceBase64 = Buffer.from('clipboard-image').toString('base64')
    const translatedBase64 = Buffer.from('translated-image').toString('base64')

    electronMocks.readImage.mockReturnValue({
      isEmpty: () => false,
      toPNG: () => Buffer.from('clipboard-image')
    })
    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: translatedBase64
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: translatedBase64,
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })

    const result = await translateClipboardImage('zh', { openPinWindow: true })

    expect(result).toMatchObject({
      success: true,
      sourceText: 'hello',
      targetText: '你好'
    })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: sourceBase64,
        targetLang: 'zh'
      },
      capability: undefined
    })
    expect(pinWindowMocks.openImageTranslatePinWindow).toHaveBeenCalledWith({
      translatedImageBase64: translatedBase64,
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
  })

  it('returns IMAGE_UNAVAILABLE when current clipboard image is empty', async () => {
    electronMocks.readImage.mockReturnValue({
      isEmpty: () => true,
      toPNG: () => Buffer.from('unused')
    })

    const result = await translateClipboardImage('zh', { openPinWindow: true })

    expect(result).toMatchObject({
      success: false,
      code: 'IMAGE_UNAVAILABLE'
    })
    expect(sceneMocks.runNexusScene).not.toHaveBeenCalled()
    expect(pinWindowMocks.openImageTranslatePinWindow).not.toHaveBeenCalled()
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
  })

  it('uses visible evidence clipboard file only inside isolated userData', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'visible-evidence-clipboard-'))
    const imagePath = path.join(tempDir, 'clipboard.png')
    await writeFile(imagePath, Buffer.from('clipboard-image'))
    process.env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR = tempDir
    process.env.TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE_CLIPBOARD_FILE = imagePath
    electronMocks.readImage.mockReturnValue({
      isEmpty: () => true,
      toPNG: () => Buffer.from('unused')
    })
    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: Buffer.from('translated-image').toString('base64')
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })

    const result = await translateClipboardImage('zh', { openPinWindow: true })

    expect(result).toMatchObject({
      success: true,
      sourceText: 'hello',
      targetText: '你好'
    })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: Buffer.from('clipboard-image').toString('base64'),
        targetLang: 'zh'
      },
      capability: undefined
    })
    expect(electronMocks.createFromBuffer).toHaveBeenCalledWith(Buffer.from('translated-image'))
  })

  it('ignores visible evidence clipboard file outside isolated userData', async () => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'visible-evidence-user-data-'))
    const externalDir = await mkdtemp(path.join(tmpdir(), 'visible-evidence-external-'))
    const imagePath = path.join(externalDir, 'clipboard.png')
    await writeFile(imagePath, Buffer.from('clipboard-image'))
    process.env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR = userDataDir
    process.env.TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE_CLIPBOARD_FILE = imagePath
    electronMocks.readImage.mockReturnValue({
      isEmpty: () => true,
      toPNG: () => Buffer.from('unused')
    })

    const result = await translateClipboardImage('zh', { openPinWindow: true })

    expect(result).toMatchObject({
      success: false,
      code: 'IMAGE_UNAVAILABLE'
    })
    expect(sceneMocks.runNexusScene).not.toHaveBeenCalled()
  })

  it('returns SCENE_UNAVAILABLE when Nexus screenshot scene request fails', async () => {
    sceneMocks.runNexusScene.mockRejectedValue(new Error('provider unavailable'))

    const result = await translateImageBase64(
      Buffer.from('source-image').toString('base64'),
      'zh',
      {
        openPinWindow: true
      }
    )

    expect(result).toMatchObject({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'provider unavailable'
    })
    expect(pinWindowMocks.openImageTranslatePinWindow).not.toHaveBeenCalled()
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
  })

  it('uses visible evidence image translate payload only when explicitly enabled', async () => {
    process.env.TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE = '1'
    process.env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR = '/tmp/tuff-visible-evidence-test'

    const result = await translateImageBase64(
      Buffer.from('source-image').toString('base64'),
      'zh',
      {
        openPinWindow: true
      }
    )

    expect(result).toMatchObject({
      success: true,
      sourceText: 'Visible evidence clipboard image: hello world',
      targetText: '可见证据剪贴板图片：你好世界'
    })
    expect(sceneMocks.runNexusScene).not.toHaveBeenCalled()
    expect(pinWindowMocks.openImageTranslatePinWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        imageMimeType: 'image/png',
        sourceText: 'Visible evidence clipboard image: hello world',
        targetText: '可见证据剪贴板图片：你好世界'
      })
    )
  })

  it('translates a raw image base64 payload through the screenshot scene and opens pin window', async () => {
    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: Buffer.from('translated-image').toString('base64')
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })

    const result = await translateImageBase64(
      Buffer.from('source-image').toString('base64'),
      'zh',
      { openPinWindow: true }
    )

    expect(result).toMatchObject({
      success: true,
      sourceText: 'hello',
      targetText: '你好'
    })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: Buffer.from('source-image').toString('base64'),
        targetLang: 'zh'
      },
      capability: undefined
    })
    expect(pinWindowMocks.openImageTranslatePinWindow).toHaveBeenCalledWith({
      translatedImageBase64: Buffer.from('translated-image').toString('base64'),
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { mode: 'client-render' }
    })
    expect(electronMocks.writeImage).not.toHaveBeenCalled()
  })

  it('normalizes data URL payload before running screenshot scene', async () => {
    const sourceBase64 = Buffer.from('source-image').toString('base64')
    const translatedBase64 = Buffer.from('translated-image').toString('base64')

    sceneMocks.runNexusScene.mockResolvedValue({
      status: 'completed',
      output: {
        translatedImageBase64: translatedBase64
      }
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: translatedBase64
    })

    const result = await translateImageBase64(` data:image/png;base64,${sourceBase64} `, 'en')

    expect(result).toMatchObject({ success: true })
    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: sourceBase64,
        targetLang: 'en'
      },
      capability: 'image.translate.e2e'
    })
  })
})
