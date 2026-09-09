import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  buildClipboardWritePayload,
  getClipboardColorTokens,
  getClipboardMetrics,
  getClipboardOcrInsight,
  getClipboardRetentionLabel,
  getClipboardSizeLabel,
  getClipboardSourceInfo,
  getClipboardSubtitle,
  getClipboardSummary,
  getClipboardTagLabels,
  getClipboardTextInsight,
  getClipboardTitle,
  groupFilesByDirectory,
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

    expect(insight?.wordTokens).toContain('Tuff')
    expect(insight?.wordTokens).toContain('你好')
    expect(insight?.lineCount).toBe(2)
    expect(insight?.wordCount).toBeGreaterThan(0)
  })

  /**
   * 富文本的 HTML 带着它的排版：从控制台复制一行日志，标记里就有语法高亮的
   * `color: #767676`。扫它等于把「这段文字长什么样」当成「这段文字是什么」——
   * 一个时间戳因此被归进了「颜色」分类。
   */
  it('ignores colours that only exist in the rich-text markup', () => {
    const logLine: PluginClipboardItem = {
      id: 90,
      type: 'text',
      content: '2026-09-07 23:17:28   422   103   298K   6.2s',
      rawContent:
        '<span style="color: #767676">2026-09-07 23:17:28</span> <span style="color: rgb(118, 118, 118)">422</span>',
    }

    expect(getClipboardColorTokens(logLine)).toEqual([])

    // 正文里真写了色值的富文本仍然要认出来——`content` 是它的纯文本形式。
    const realColor: PluginClipboardItem = {
      id: 91,
      type: 'text',
      content: '主色 #112233',
      rawContent: '<span style="color: #FFFFFF">主色 #112233</span>',
    }
    expect(getClipboardColorTokens(realColor).map(token => token.value)).toEqual(['#112233'])
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

  it.each([
    ['api_key', 'API 密钥'],
    ['github', 'GitHub'],
    ['npm', 'npm'],
    ['openai', 'OpenAI'],
    ['stripe', 'Stripe'],
    ['google', 'Google'],
    ['aws', 'AWS'],
    ['slack', 'Slack'],
  ])('projects the known credential tag %s into its localized label', (tag, label) => {
    const item: PluginClipboardItem = {
      id: 18,
      type: 'text',
      content: 'synthetic credential note',
      metadata: JSON.stringify({ tags: [tag] }),
    }

    expect(getClipboardTagLabels(item)).toEqual([label])
  })

  it('preserves an unknown credential tag label', () => {
    const item: PluginClipboardItem = {
      id: 19,
      type: 'text',
      content: 'synthetic credential note',
      meta: { tags: ['openai', 'internal_service'] },
    }

    expect(getClipboardTagLabels(item)).toEqual(['OpenAI', 'internal_service'])
  })

  it.each([
    ['absent tags', {}],
    ['non-array tags', { tags: 'github' }],
    ['mixed malformed tags', { tags: [null, 42, {}] }],
  ])('omits %s metadata', (_name, meta) => {
    const item: PluginClipboardItem = {
      id: 20,
      type: 'text',
      content: 'synthetic credential note',
      meta,
    }

    expect(getClipboardTagLabels(item)).toEqual([])
  })

  it('omits malformed serialized tag metadata', () => {
    const item: PluginClipboardItem = {
      id: 21,
      type: 'text',
      content: 'synthetic credential note',
      metadata: '{not-json',
    }

    expect(getClipboardTagLabels(item)).toEqual([])
  })
})

describe('list row copy', () => {
  /**
   * 重排前 title 与 subtitle 对纯文本取的是同一行文字，列表里每条都复述两遍。
   * 这条负控制盯住的就是那个回归。
   */
  it('never repeats the content between title and subtitle', () => {
    for (const content of ['679839', 'dsh web: https://dsh.tagzxia.com/?token=abc', '第一行\n第二行']) {
      const item: PluginClipboardItem = {
        id: 30,
        type: 'text',
        content,
        timestamp: Date.parse('2026-09-05T03:49:00Z'),
      }

      expect(getClipboardSubtitle(item)).not.toBe(getClipboardTitle(item))
      expect(getClipboardSubtitle(item)).not.toContain(content.split('\n')[0])
    }
  })

  it('drops the file size from image titles so the row stays on one line', () => {
    const item: PluginClipboardItem = {
      id: 31,
      type: 'image',
      content: '',
      meta: { image_size: { width: 3520, height: 2306 }, image_file_size: 7_549_747 },
    }

    expect(getClipboardTitle(item)).toBe('image/png · 3520×2306')
    expect(getClipboardSubtitle(item)).toContain('7.2 MB')
  })
})

describe('detail summary', () => {
  it('splits text metrics into characters and lines', () => {
    const item: PluginClipboardItem = {
      id: 32,
      type: 'text',
      content: 'abc\ndef',
      timestamp: Date.parse('2026-09-05T03:49:00Z'),
    }

    expect(getClipboardMetrics(item)).toEqual(['7 字符', '2 行'])
    expect(getClipboardSummary(item).typeLabel).toBe('文本')
    expect(getClipboardSummary(item).mime).toBe('text/plain')
  })

  it('splits image metrics into dimensions and byte size', () => {
    const item: PluginClipboardItem = {
      id: 33,
      type: 'image',
      content: '',
      meta: { image_size: { width: 320, height: 180 }, image_file_size: 2048 },
    }

    expect(getClipboardMetrics(item)).toEqual(['320 × 180', '2 KB'])
  })

  /** 全称 application/x-tuff-files 在 720 宽下会撞上右对齐的时间戳。 */
  it('shortens the tuff files mime for the summary strip', () => {
    const item: PluginClipboardItem = {
      id: 34,
      type: 'files',
      content: JSON.stringify(['/Users/demo/Downloads/a.pdf']),
    }

    expect(getClipboardSummary(item).mime).toBe('x-tuff-files')
    expect(getClipboardMetrics(item)).toEqual(['1 个文件'])
  })

  it('keeps the bundle id only when it differs from the display name', () => {
    const item: PluginClipboardItem = { id: 35, type: 'text', content: 'x', sourceApp: 'com.apple.Terminal' }

    expect(getClipboardSourceInfo(item, { displayName: '终端', icon: null } as never)).toEqual({
      displayName: '终端',
      bundleId: 'com.apple.Terminal',
      icon: null,
    })
    expect(getClipboardSourceInfo(item, null).bundleId).toBeNull()
  })
})

describe('file tree grouping', () => {
  it('groups files by parent directory and abbreviates the home path', () => {
    const content = JSON.stringify([
      '/Users/demo/Downloads/a.pdf',
      '/Users/demo/Downloads/b.md',
      '/Users/demo/Downloads/shots/c.png',
    ])

    expect(groupFilesByDirectory(content)).toEqual([
      {
        dir: '~/Downloads',
        files: [
          { name: 'a.pdf', path: '/Users/demo/Downloads/a.pdf', dir: '~/Downloads' },
          { name: 'b.md', path: '/Users/demo/Downloads/b.md', dir: '~/Downloads' },
        ],
      },
      {
        dir: '~/Downloads/shots',
        files: [
          { name: 'c.png', path: '/Users/demo/Downloads/shots/c.png', dir: '~/Downloads/shots' },
        ],
      },
    ])
  })

  it('returns nothing for malformed file payloads', () => {
    expect(groupFilesByDirectory('{not-json')).toEqual([])
    expect(groupFilesByDirectory(null)).toEqual([])
  })
})

describe('retention label', () => {
  const NOW = Date.UTC(2026, 8, 6, 20, 31)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function item(overrides: Partial<PluginClipboardItem>): PluginClipboardItem {
    return { id: 1, type: 'text', content: 'x', ...overrides }
  }

  it('explains why an entry is never deleted, rather than just saying never', () => {
    expect(getClipboardRetentionLabel(item({ retentionReason: 'favorite' }))).toBe(
      '永不自动删除（已收藏）',
    )
    expect(getClipboardRetentionLabel(item({ retentionReason: 'protected' }))).toBe(
      '永不自动删除（密钥）',
    )
    expect(getClipboardRetentionLabel(item({ retentionReason: 'disabled' }))).toBe('永不自动删除')
  })

  /** 相对时间给量级，绝对时间给确凿答案——只说「2 天后」没法区分明天下班前和后天早上。 */
  it.each([
    [30_000, '不到 1 分钟后'],
    [5 * 60_000, '5 分钟后'],
    [3 * 3_600_000, '3 小时后'],
    [2 * 86_400_000, '2 天后'],
  ])('renders %s ms out as %s, alongside the absolute time', (offset, expected) => {
    const label = getClipboardRetentionLabel(
      item({ retentionReason: 'policy', retentionExpiresAt: NOW + offset }),
    )
    expect(label).toContain(expected)
    expect(label).toMatch(/（\d{4}\/\d{2}\/\d{2}.+）$/)
  })

  /** 清理是周期性跑的，不是到点就删——所以过期的记录还能被看到，别写成「0 天后」。 */
  it('says an entry is awaiting cleanup rather than counting down past zero', () => {
    const label = getClipboardRetentionLabel(
      item({ retentionReason: 'policy', retentionExpiresAt: NOW - 1000 }),
    )
    expect(label).toContain('已过期，待清理')
    expect(label).not.toContain('0 天后')
  })

  it('says nothing when the host did not send a forecast', () => {
    expect(getClipboardRetentionLabel(item({}))).toBeNull()
    expect(getClipboardRetentionLabel(null)).toBeNull()
  })
})
