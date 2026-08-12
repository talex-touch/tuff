import type { AiMessagePart } from '@talex-touch/tuffex/ai-elements'
import { describe, expect, it } from 'vitest'
import { shouldUseChainView, toChainSteps } from './chain-steps'

const parts: AiMessagePart[] = [
  { type: 'reasoning', text: 'Look for the report\nthen summarise', done: true },
  { type: 'tool-call', id: 'c1', name: 'tuff_search_files', status: 'done', output: '3 hits' },
  { type: 'text', text: 'Here are the files.' }
]

describe('toChainSteps', () => {
  it('turns reasoning and tool parts into steps, leaving the answer text out', () => {
    const steps = toChainSteps(parts, false)

    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ kind: 'thinking', status: 'done' })
    // Title is the first line only; the full text stays in the body.
    expect(steps[0]?.title).toBe('Look for the report')
    expect(steps[0]?.body).toContain('then summarise')
    expect(steps[1]).toMatchObject({ id: 'c1', kind: 'tool', status: 'done', body: '3 hits' })
  })

  it('marks in-flight spans active only while the turn streams', () => {
    const live: AiMessagePart[] = [
      { type: 'reasoning', text: 'thinking', done: false },
      { type: 'tool-call', id: 'c2', name: 'read', status: 'running' }
    ]

    expect(toChainSteps(live, true).map((step) => step.status)).toEqual(['active', 'active'])
    // Same parts on a settled turn describe an interrupted run, not a live one.
    expect(toChainSteps(live, false).map((step) => step.status)).toEqual(['done', 'error'])
  })

  it('prefers a tool summary over the raw name and surfaces errors', () => {
    const steps = toChainSteps(
      [
        {
          type: 'tool-call',
          id: 'c3',
          name: 'tuff_open_path',
          summary: 'Open /tmp/report.pdf',
          status: 'error',
          error: 'User denied'
        }
      ],
      false
    )

    expect(steps[0]).toMatchObject({
      title: 'Open /tmp/report.pdf',
      body: 'User denied',
      status: 'error'
    })
  })

  it('truncates a long first line so a title stays one line', () => {
    const steps = toChainSteps([{ type: 'reasoning', text: 'x'.repeat(200), done: true }], false)
    expect(steps[0]!.title.length).toBeLessThanOrEqual(49)
    expect(steps[0]!.title.endsWith('…')).toBe(true)
  })

  it('returns nothing for a plain text answer', () => {
    expect(toChainSteps([{ type: 'text', text: 'hi' }], false)).toEqual([])
    expect(toChainSteps(undefined, false)).toEqual([])
  })
})

describe('shouldUseChainView', () => {
  it('reserves the timeline for genuinely multi-step trails', () => {
    expect(shouldUseChainView([])).toBe(false)
    expect(shouldUseChainView(toChainSteps(parts.slice(1), false))).toBe(false)
    expect(shouldUseChainView(toChainSteps(parts, false))).toBe(true)
  })
})
