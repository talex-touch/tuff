import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { TuffInputType } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveClipboardInputs } from './resolve-clipboard-inputs'

const clipboardModuleMock = vi.hoisted(() => ({
  getItemById: vi.fn()
}))

vi.mock('../../../clipboard', () => ({
  clipboardModule: clipboardModuleMock
}))

describe('resolveClipboardInputs', () => {
  beforeEach(() => {
    clipboardModuleMock.getItemById.mockReset()
  })

  it('resolves clipboard file inputs by clipboard id', async () => {
    clipboardModuleMock.getItemById.mockResolvedValue({
      id: 1,
      type: 'files',
      content: '["/tmp/report.txt"]'
    })
    const inputs = [
      {
        type: TuffInputType.Files,
        content: '',
        metadata: { clipboardId: 1 }
      }
    ]

    const result = await resolveClipboardInputs(inputs)

    expect(result).toEqual({ resolvedCount: 1, clipboardIds: [1] })
    expect(inputs[0].content).toBe('["/tmp/report.txt"]')
  })

  it('resolves clipboard image preview inputs to original image data urls', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tuff-clipboard-image-'))
    const imagePath = path.join(dir, 'clipboard.png')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    clipboardModuleMock.getItemById.mockResolvedValue({
      id: 2,
      type: 'image',
      content: imagePath,
      thumbnail: 'data:image/png;base64,preview'
    })
    const inputs = [
      {
        type: TuffInputType.Image,
        content: 'data:image/png;base64,preview',
        metadata: {
          clipboardId: 2,
          canResolveOriginal: true,
          contentKind: 'preview'
        }
      }
    ]

    const result = await resolveClipboardInputs(inputs)

    expect(result).toEqual({ resolvedCount: 1, clipboardIds: [2] })
    expect(inputs[0].content).toBe('data:image/png;base64,iVBORw==')
    expect(inputs[0].metadata).toMatchObject({
      clipboardId: 2,
      canResolveOriginal: true,
      contentKind: 'original',
      resolvedFromClipboardId: 2
    })
  })

  it('does not resolve image inputs that already carry full data urls', async () => {
    const inputs = [
      {
        type: TuffInputType.Image,
        content: 'data:image/png;base64,raw',
        metadata: {
          clipboardId: 3,
          canResolveOriginal: true
        }
      }
    ]

    const result = await resolveClipboardInputs(inputs)

    expect(result).toEqual({ resolvedCount: 0, clipboardIds: [] })
    expect(clipboardModuleMock.getItemById).not.toHaveBeenCalled()
    expect(inputs[0].content).toBe('data:image/png;base64,raw')
  })

  it('keeps preview image inputs when the original clipboard file is unavailable', async () => {
    clipboardModuleMock.getItemById.mockResolvedValue({
      id: 4,
      type: 'image',
      content: '/tmp/tuff-missing-clipboard-image.png'
    })
    const inputs = [
      {
        type: TuffInputType.Image,
        content: 'data:image/png;base64,preview',
        metadata: {
          clipboardId: 4,
          canResolveOriginal: true,
          contentKind: 'preview'
        }
      }
    ]

    const result = await resolveClipboardInputs(inputs)

    expect(result).toEqual({ resolvedCount: 0, clipboardIds: [4] })
    expect(inputs[0].content).toBe('data:image/png;base64,preview')
    expect(inputs[0].metadata).toMatchObject({ contentKind: 'preview' })
  })
})
