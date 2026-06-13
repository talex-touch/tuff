import { describe, expect, it } from 'vitest'
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  buildClipboardWritePayload,
  getClipboardColorTokens,
  getClipboardOcrInsight,
  getClipboardSizeLabel,
  getClipboardTextInsight,
  parseFileList,
  resolveDetailImagePreview,
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

  it('marks thumbnail-only image fallback for detail rendering', () => {
    const item: PluginClipboardItem = {
      id: 3,
      type: 'image',
      content: 'data:image/png;base64,thumb',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_content_kind: 'thumbnail',
      },
    }

    expect(resolveDetailImageSrc(item)).toBe('data:image/png;base64,thumb')
    expect(resolveDetailImagePreview(item)).toEqual({
      src: 'data:image/png;base64,thumb',
      isThumbnailOnly: true,
    })
    expect(resolveListImageSrc(item)).toBe('data:image/png;base64,thumb')
  })

  it('uses content as the lightweight image fallback when thumbnail is absent', () => {
    const item: PluginClipboardItem = {
      id: 30,
      type: 'image',
      content: 'data:image/png;base64,content',
      thumbnail: null,
      meta: {
        image_content_kind: 'thumbnail',
      },
    }

    expect(resolveListImageSrc(item)).toBe('data:image/png;base64,content')
    expect(resolveDetailImagePreview(item)).toEqual({
      src: 'data:image/png;base64,content',
      isThumbnailOnly: true,
    })
  })

  it('uses lazily resolved original image url over thumbnail fallback', () => {
    const item: PluginClipboardItem = {
      id: 31,
      type: 'image',
      content: 'data:image/png;base64,thumb',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_content_kind: 'thumbnail',
      },
    }

    expect(resolveDetailImagePreview(item, 'tfile://original.png')).toEqual({
      src: 'tfile://original.png',
      isThumbnailOnly: false,
    })
  })

  it('reads camelCase image metadata for detail rendering', () => {
    const item: PluginClipboardItem = {
      id: 32,
      type: 'image',
      content: 'data:image/png;base64,thumb',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        imageOriginalUrl: 'tfile://original.png',
        imagePreviewUrl: 'tfile://preview.png',
        imageContentKind: 'thumbnail',
        imageSize: { width: 320, height: 180 },
        imageFileSize: 2048,
      },
    }

    expect(resolveDetailImagePreview(item)).toEqual({
      src: 'tfile://original.png',
      isThumbnailOnly: false,
    })
    expect(getClipboardSizeLabel(item)).toBe('320 × 180 · 2 KB')
    expect(buildClipboardWritePayload(item, resolveDetailImageSrc(item))).toEqual({
      image: 'tfile://original.png',
    })
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

  it('keeps selection near the deleted item by removed index', () => {
    const items: PluginClipboardItem[] = [
      { id: 40, type: 'text', content: 'newer' },
      { id: 20, type: 'text', content: 'middle' },
      { id: 30, type: 'text', content: 'older' },
    ]

    expect(selectNextClipboardItemId(items, 10, 10, 1)).toBe(20)
    expect(selectNextClipboardItemId(items, 10, 10, 9)).toBe(30)
  })

  it('extracts compact text insights for detail rendering', () => {
    const item: PluginClipboardItem = {
      id: 14,
      type: 'text',
      content: '你好 Tuff\n#fff',
    }

    const insight = getClipboardTextInsight(item)

    expect(insight?.characterTokens.slice(0, 4)).toEqual(['你', '好', 'T', 'u'])
    expect(insight?.wordTokens).toContain('Tuff')
    expect(insight?.characterCount).toBe(12)
    expect(insight?.lineCount).toBe(2)
    expect(insight?.wordCount).toBeGreaterThan(0)
  })

  it('extracts color tokens from text and metadata', () => {
    const item: PluginClipboardItem = {
      id: 15,
      type: 'text',
      content: 'primary #fff and rgb(12, 34, 56) and rgba(12, 34, 56, 0.5)',
      meta: {
        palette: ['#112233', { color: '#abc' }, '#fff'],
      },
    }

    expect(getClipboardColorTokens(item).map(color => color.value)).toEqual([
      '#FFFFFF',
      'rgb(12, 34, 56)',
      'rgba(12, 34, 56, 0.5)',
      '#112233',
      '#AABBCC',
    ])
  })

  it('normalizes ocr metadata for detail rendering', () => {
    const item: PluginClipboardItem = {
      id: 16,
      type: 'image',
      content: 'data:image/png;base64,a',
      meta: {
        ocr_status: 'done',
        ocr_text: 'Hello',
        ocr_language: 'en',
        ocr_confidence: 0.92,
        ocr_keywords: ['hello', 'text'],
      },
    }

    expect(getClipboardOcrInsight(item)).toMatchObject({
      status: 'done',
      text: 'Hello',
      language: 'en',
      confidence: '92%',
      keywords: ['hello', 'text'],
    })
  })

  it('reads color and ocr insights from serialized metadata', () => {
    const item: PluginClipboardItem = {
      id: 17,
      type: 'image',
      content: 'data:image/png;base64,a',
      metadata: JSON.stringify({
        dominantColor: '#101010',
        ocrStatus: 'success',
        ocrExcerpt: 'Invoice total',
        ocrConfidence: '88%',
        ocrKeywords: 'Invoice, total, invoice',
      }),
    }

    expect(getClipboardColorTokens(item).map(color => color.value)).toEqual(['#101010'])
    expect(getClipboardOcrInsight(item)).toMatchObject({
      status: 'success',
      statusLabel: '已完成',
      displayText: 'Invoice total',
      confidence: '88%',
      keywords: ['Invoice', 'total'],
    })
  })
})
