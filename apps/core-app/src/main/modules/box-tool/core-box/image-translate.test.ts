import { afterEach, describe, expect, it, vi } from 'vitest'

const sceneMocks = vi.hoisted(() => ({
  runNexusScene: vi.fn(),
  extractTranslatedImageFromSceneRun: vi.fn()
}))

const electronMocks = vi.hoisted(() => ({
  writeImage: vi.fn(),
  createFromBuffer: vi.fn(() => ({
    isEmpty: () => false
  }))
}))

const pinWindowMocks = vi.hoisted(() => ({
  openImageTranslatePinWindow: vi.fn()
}))

vi.mock('electron', () => ({
  clipboard: {
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
import { translateCoreBoxImageItem } from './image-translate'

describe('translateCoreBoxImageItem', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('runs screenshot translate scene for clipboard image item and writes translated image', async () => {
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
})
