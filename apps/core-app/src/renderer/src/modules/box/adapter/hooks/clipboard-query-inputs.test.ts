import { describe, expect, it } from 'vitest'
import { TuffInputType } from '@talex-touch/utils'
import type { IClipboardItem } from './types'
import { buildClipboardQueryInputs } from './clipboard-query-inputs'
import { resolveTextClipboardAttachmentIdentity } from './clipboard-text-utils'

function createClipboardItem(overrides?: Partial<IClipboardItem>): IClipboardItem {
  return {
    type: 'text',
    content: 'clipboard text',
    timestamp: '2026-04-09T12:00:00.000Z',
    thumbnail: null,
    rawContent: null,
    sourceApp: null,
    isFavorite: false,
    metadata: null,
    meta: null,
    ...overrides
  }
}

describe('buildClipboardQueryInputs', () => {
  it('attaches active long text clipboard content', () => {
    const inputs = buildClipboardQueryInputs({
      clipboardItem: createClipboardItem({ content: 'a'.repeat(120) })
    })

    expect(inputs).toEqual([
      {
        type: TuffInputType.Text,
        content: 'a'.repeat(120),
        metadata: undefined
      }
    ])
  })

  it('uses the same text attachment identity for repeated clipboard content', () => {
    const first = createClipboardItem({
      id: 1,
      content: 'repeat me'.repeat(20),
      timestamp: '2026-04-09T12:00:00.000Z'
    })
    const second = createClipboardItem({
      id: 2,
      content: 'repeat me'.repeat(20),
      timestamp: '2026-04-09T12:01:00.000Z'
    })

    expect(resolveTextClipboardAttachmentIdentity(second)).toBe(
      resolveTextClipboardAttachmentIdentity(first)
    )
  })

  it('attaches pending short text clipboard content for plugin execution when query matches', () => {
    const inputs = buildClipboardQueryInputs({
      pendingTextClipboardItem: createClipboardItem({
        content: 'hello',
        meta: { source: 'clipboard', tags: ['short'] }
      }),
      queryText: 'hello',
      allowPendingTextClipboard: true
    })

    expect(inputs).toEqual([
      {
        type: TuffInputType.Text,
        content: 'hello',
        metadata: { source: 'clipboard', tags: ['short'] }
      }
    ])
  })

  it('ignores pending short text clipboard content when query was edited', () => {
    const inputs = buildClipboardQueryInputs({
      pendingTextClipboardItem: createClipboardItem({ content: 'hello' }),
      queryText: 'hello world',
      allowPendingTextClipboard: true
    })

    expect(inputs).toEqual([])
  })

  it('ignores pending long text clipboard content when it is already inline in query text', () => {
    const content = 'long text '.repeat(20)
    const inputs = buildClipboardQueryInputs({
      pendingTextClipboardItem: createClipboardItem({ content }),
      queryText: content,
      allowPendingTextClipboard: true
    })

    expect(inputs).toEqual([])
  })

  it('marks clipboard image previews as resolvable original image inputs', () => {
    const inputs = buildClipboardQueryInputs({
      clipboardItem: createClipboardItem({
        id: 42,
        type: 'image',
        content: 'data:image/png;base64,preview',
        thumbnail: 'data:image/png;base64,thumb'
      })
    })

    expect(inputs).toEqual([
      {
        type: TuffInputType.Image,
        content: 'data:image/png;base64,thumb',
        thumbnail: 'data:image/png;base64,thumb',
        metadata: {
          clipboardId: 42,
          contentKind: 'preview',
          canResolveOriginal: true
        }
      }
    ])
  })

  it('can ignore clipboard image previews for plain text search', () => {
    const inputs = buildClipboardQueryInputs({
      clipboardItem: createClipboardItem({
        id: 42,
        type: 'image',
        content: 'data:image/png;base64,preview',
        thumbnail: 'data:image/png;base64,thumb'
      }),
      queryText: 'calculator',
      includeClipboardImage: false
    })

    expect(inputs).toEqual([])
  })
})
