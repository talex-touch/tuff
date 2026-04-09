import { describe, expect, it } from 'vitest'
import { TuffInputType } from '@talex-touch/utils'
import type { IClipboardItem } from './types'
import { buildClipboardQueryInputs } from './clipboard-query-inputs'

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
})
