import { describe, expect, it } from 'vitest'
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  buildClipboardWritePayload,
  parseFileList,
  resolveDetailImageSrc,
  resolveListImageSrc,
  selectNextClipboardItemId,
} from './clipboard-items'

describe('clipboard-items helpers', () => {
  it('prefers original image url for detail rendering', () => {
    const item: PluginClipboardItem = {
      id: 1,
      type: 'image',
      content: 'tfile://preview.png',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_original_url: 'tfile://original.png',
        image_preview_url: 'tfile://preview.png',
      },
    }

    expect(resolveDetailImageSrc(item)).toBe('tfile://original.png')
  })

  it('uses preview image url when original is unavailable', () => {
    const item: PluginClipboardItem = {
      id: 2,
      type: 'image',
      content: '',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_preview_url: 'tfile://preview.png',
      },
    }

    expect(resolveDetailImageSrc(item)).toBe('tfile://preview.png')
  })

  it('does not promote thumbnail to detail preview', () => {
    const item: PluginClipboardItem = {
      id: 3,
      type: 'image',
      content: 'data:image/png;base64,thumb',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_content_kind: 'thumbnail',
      },
    }

    expect(resolveDetailImageSrc(item)).toBeNull()
    expect(resolveListImageSrc(item)).toBe('data:image/png;base64,thumb')
  })

  it('keeps file payloads structured for clipboard write', () => {
    const item: PluginClipboardItem = {
      id: 4,
      type: 'files',
      content: JSON.stringify(['/tmp/a.png', '/tmp/b.png']),
      rawContent: null,
    }

    expect(parseFileList(item.content)).toEqual(['/tmp/a.png', '/tmp/b.png'])
    expect(buildClipboardWritePayload(item, null)).toEqual({
      files: ['/tmp/a.png', '/tmp/b.png'],
    })
  })

  it('picks the next available selection after delete', () => {
    const items: PluginClipboardItem[] = [
      { id: 11, type: 'text', content: 'A' },
      { id: 12, type: 'text', content: 'B' },
      { id: 13, type: 'text', content: 'C' },
    ]

    expect(selectNextClipboardItemId(items, 12)).toBe(12)
    expect(selectNextClipboardItemId(items.filter(item => item.id !== 12), 12, 12)).toBe(11)
  })
})
