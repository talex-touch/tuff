import { describe, expect, it } from 'vitest'
import {
  sortPilotChatBlocksByTimeline,
  toPilotChatBlockSeq,
  toPilotChatBlockStreamOrder,
} from '@talex-touch/tuff-intelligence/pilot'

function createRunCard(cardType: string, seq: number, streamOrder = 0) {
  return {
    type: 'card',
    name: 'pilot_run_event_card',
    value: '',
    data: JSON.stringify({
      cardType,
      seq,
    }),
    extra: streamOrder > 0 ? { streamOrder } : undefined,
  }
}

describe('pilot-chat-block-order', () => {
  it('按 seq 将运行卡插回 assistant markdown 前面', () => {
    const blocks = [
      {
        type: 'markdown',
        value: '最终回答',
      },
      createRunCard('intent', 1),
      createRunCard('planning', 2),
      createRunCard('thinking', 3),
      {
        type: 'card',
        name: 'pilot_tool_card',
        value: '',
        data: JSON.stringify({
          toolName: 'websearch',
          seq: 4,
        }),
      },
    ]

    const ordered = sortPilotChatBlocksByTimeline(blocks)
    const labels = ordered.map((block) => {
      if (block.type !== 'card') {
        return String(block.type)
      }
      const payload = JSON.parse(String(block.data || '{}')) as Record<string, unknown>
      return String(payload.cardType || payload.toolName || 'card')
    })

    expect(labels).toEqual(['intent', 'planning', 'thinking', 'websearch', 'markdown'])
  })

  it('同 seq 时按 streamOrder 稳定排序', () => {
    const blocks = [
      createRunCard('planning', 6, 3),
      createRunCard('intent', 6, 1),
      createRunCard('memory', 6, 2),
    ]

    const ordered = sortPilotChatBlocksByTimeline(blocks)
    expect(ordered.map(item => JSON.parse(String(item.data || '{}')).cardType)).toEqual([
      'intent',
      'memory',
      'planning',
    ])
    expect(toPilotChatBlockSeq(ordered[0])).toBe(6)
    expect(toPilotChatBlockStreamOrder(ordered[0])).toBe(1)
  })
})
