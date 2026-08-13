import type { AiMessagePart } from '@talex-touch/tuffex/ai-elements'
import { describe, expect, it } from 'vitest'
import { toMessageSegments } from './chain-steps'

const parts: AiMessagePart[] = [
  { type: 'reasoning', text: 'Look for the report\nthen summarise', done: true },
  { type: 'tool-call', id: 'c1', name: 'tuff_search_files', status: 'done', output: '3 hits' },
  { type: 'text', text: 'Here are the files.' }
]

describe('toMessageSegments', () => {
  it('carries reasoning, tools and prose as segments in stream order', () => {
    const segments = toMessageSegments(parts, false)

    expect(segments.map((segment) => segment.kind)).toEqual(['reasoning', 'tool', 'text'])
    expect(segments[2]?.kind === 'text' && segments[2].text).toBe('Here are the files.')
    expect(segments[0]).toMatchObject({ kind: 'reasoning' })
    expect(segments[0]?.kind === 'reasoning' && segments[0].step).toMatchObject({
      kind: 'thinking',
      status: 'done'
    })
    // Title is the first line only; the full text stays in the body.
    expect(segments[0]?.kind === 'reasoning' && segments[0].step.title).toBe('Look for the report')
    expect(segments[0]?.kind === 'reasoning' && segments[0].step.body).toContain('then summarise')
    expect(segments[1]).toMatchObject({ kind: 'tool', id: 'c1' })
    expect(segments[1]?.kind === 'tool' && segments[1].part.status).toBe('done')
  })

  it('gives every reasoning span its own segment across a tool call', () => {
    const segments = toMessageSegments(
      [
        { type: 'reasoning', text: 'first thought', done: true },
        { type: 'tool-call', id: 'c1', name: 'read', status: 'done', output: 'ok' },
        { type: 'reasoning', text: 'second thought', done: true }
      ],
      false
    )

    expect(segments.map((segment) => segment.kind)).toEqual(['reasoning', 'tool', 'reasoning'])
  })

  it('keeps prose in place between two thoughts', () => {
    // The whole point of the reader's complaint: think, speak, think reads in
    // that order, rather than collecting every thought above all the prose.
    const segments = toMessageSegments(
      [
        { type: 'reasoning', text: 'first thought', done: true },
        { type: 'text', text: 'Partial answer.' },
        { type: 'reasoning', text: 'second thought', done: true },
        { type: 'text', text: 'The rest of it.' }
      ],
      false
    )

    expect(segments.map((segment) => segment.kind)).toEqual([
      'reasoning',
      'text',
      'reasoning',
      'text'
    ])
    expect(segments[0]?.id).not.toBe(segments[2]?.id)
    expect(segments[1]?.id).not.toBe(segments[3]?.id)
  })

  it('streams only the tail of the turn, never a settled paragraph', () => {
    // Prose with anything after it is finished; keeping the streaming
    // treatment on it would leave earlier paragraphs dimmed forever.
    const segments = toMessageSegments(
      [
        { type: 'text', text: 'First paragraph.' },
        { type: 'reasoning', text: 'reconsidering', done: true },
        { type: 'text', text: 'Still typing' }
      ],
      true
    )

    expect(segments[0]?.kind === 'text' && segments[0].streaming).toBe(false)
    expect(segments[2]?.kind === 'text' && segments[2].streaming).toBe(true)
  })

  it('leaves the tail settled once the turn is done', () => {
    const segments = toMessageSegments([{ type: 'text', text: 'Done.' }], false)
    expect(segments[0]?.kind === 'text' && segments[0].streaming).toBe(false)
  })

  it('skips an empty text part left by a rollback', () => {
    const segments = toMessageSegments(
      [
        { type: 'text', text: '' },
        { type: 'text', text: 'real' }
      ],
      false
    )

    expect(segments).toHaveLength(1)
    expect(segments[0]?.kind === 'text' && segments[0].text).toBe('real')
  })

  it('keeps segment ids stable as the stream appends parts', () => {
    // Ids key the reader's open/collapse choice; drifting ones would reset it
    // on every delta.
    const head: AiMessagePart[] = [
      { type: 'reasoning', text: 'first thought', done: true },
      { type: 'tool-call', id: 'c1', name: 'read', status: 'done', output: 'ok' }
    ]
    const grown: AiMessagePart[] = [...head, { type: 'reasoning', text: 'later', done: false }]

    const before = toMessageSegments(head, true).map((segment) => segment.id)
    const after = toMessageSegments(grown, true).map((segment) => segment.id)

    expect(after.slice(0, before.length)).toEqual(before)
  })

  it('marks in-flight spans active only while the turn streams', () => {
    const live: AiMessagePart[] = [
      { type: 'reasoning', text: 'thinking', done: false },
      { type: 'tool-call', id: 'c2', name: 'read', status: 'running' }
    ]

    const streaming = toMessageSegments(live, true)
    expect(streaming[0]?.kind === 'reasoning' && streaming[0].step.status).toBe('active')
    expect(streaming[1]?.kind === 'tool' && streaming[1].part.status).toBe('running')

    // Same parts on a settled turn describe an interrupted run, not a live one:
    // the card renders from status, so a left-over `running` would spin forever.
    const settled = toMessageSegments(live, false)
    expect(settled[0]?.kind === 'reasoning' && settled[0].step.status).toBe('done')
    expect(settled[1]?.kind === 'tool' && settled[1].part.status).toBe('error')
  })

  it('does not copy a tool part that needs no correcting', () => {
    // Callers write back to the part — a submitted form marks itself there so
    // the answer persists with the thread. A defensive copy would eat that.
    const part: AiMessagePart = {
      type: 'tool-call',
      id: 'c4',
      name: 'tuff_render_form',
      status: 'done',
      output: 'form'
    }
    const segments = toMessageSegments([part], false)

    expect(segments[0]?.kind === 'tool' && segments[0].part).toBe(part)
  })

  it('leaves the stored part untouched when it does correct an interrupted call', () => {
    const part: AiMessagePart = { type: 'tool-call', id: 'c5', name: 'read', status: 'running' }
    const segments = toMessageSegments([part], false)

    expect(segments[0]?.kind === 'tool' && segments[0].part.status).toBe('error')
    expect(part.status).toBe('running')
  })

  it('labels an interrupted call, and never overwrites a real error', () => {
    // The card renders `error` as its alert text — an unlabelled interruption
    // would show an empty red block.
    const interrupted = toMessageSegments(
      [{ type: 'tool-call', id: 'c6', name: 'read', status: 'running' }],
      false,
      { interrupted: 'Interrupted' }
    )
    expect(interrupted[0]?.kind === 'tool' && interrupted[0].part.error).toBe('Interrupted')

    const failed = toMessageSegments(
      [{ type: 'tool-call', id: 'c7', name: 'read', status: 'error', error: 'User denied' }],
      false,
      { interrupted: 'Interrupted' }
    )
    expect(failed[0]?.kind === 'tool' && failed[0].part.error).toBe('User denied')
  })

  it('titles a text-less span with the host label, which now heads the block', () => {
    // The title is the block header — a hard-coded English fallback would show
    // through in a localized UI.
    const segments = toMessageSegments([{ type: 'reasoning', text: '', done: false }], true, {
      thinking: '正在思考'
    })

    expect(segments[0]?.kind === 'reasoning' && segments[0].step.title).toBe('正在思考')
  })

  it('truncates a long first line so a title stays one line', () => {
    const segments = toMessageSegments(
      [{ type: 'reasoning', text: 'x'.repeat(200), done: true }],
      false
    )
    const step = segments[0]?.kind === 'reasoning' ? segments[0].step : null

    expect(step!.title.length).toBeLessThanOrEqual(49)
    expect(step!.title.endsWith('…')).toBe(true)
  })

  it('keeps the full text as body when the title had to truncate', () => {
    // A truncated title is a preview; without this the tail of the first
    // line rendered nowhere at all.
    const text = `${'x'.repeat(200)}\nsecond line`
    const segments = toMessageSegments([{ type: 'reasoning', text, done: true }], false)

    expect(segments[0]?.kind === 'reasoning' && segments[0].step.body).toBe(text)
  })

  it('forwards reasoning duration onto the step', () => {
    const segments = toMessageSegments(
      [{ type: 'reasoning', text: 'quick check', done: true, durationMs: 3200 }],
      false
    )

    expect(segments[0]?.kind === 'reasoning' && segments[0].step.durationMs).toBe(3200)
  })

  it('returns nothing for a turn that never entered parts mode', () => {
    // Such a turn keeps its answer in `content`; the host renders that instead.
    expect(toMessageSegments(undefined, false)).toEqual([])
    expect(toMessageSegments([], false)).toEqual([])
  })

  it('reproduces the message content exactly, so the host can render one or the other', () => {
    // Rendering both would show the answer twice — the concatenation here is
    // precisely what `message.content` holds in parts mode.
    const streamed: AiMessagePart[] = [
      { type: 'text', text: 'Before. ' },
      { type: 'reasoning', text: 'a thought', done: true },
      { type: 'tool-call', id: 'c8', name: 'read', status: 'done' },
      { type: 'text', text: 'After.' }
    ]
    const content = 'Before. After.'

    const prose = toMessageSegments(streamed, false)
      .filter((segment) => segment.kind === 'text')
      .map((segment) => (segment.kind === 'text' ? segment.text : ''))
      .join('')

    expect(prose).toBe(content)
  })
})
