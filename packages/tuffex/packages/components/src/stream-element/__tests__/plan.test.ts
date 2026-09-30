import type { PlanNode } from '../src/plan'
import type { StreamPart } from '../src/types'
import { describe, expect, it } from 'vitest'
import { codeWordEnds } from '../../code-stream/src/units'
import { buildStreamModel } from '../../stream-text/src/model'
import { lineEnds, planParts } from '../src/plan'

const PARTS: StreamPart[] = [
  { type: 'heading', depth: 2, inlines: [{ type: 'text', text: 'Why it churns' }] },
  { type: 'paragraph', inlines: [{ type: 'text', text: 'Sorting dominates here.' }] },
  { type: 'list', ordered: false, items: [
    { parts: [{ type: 'paragraph', tight: true, inlines: [{ type: 'text', text: 'Cache the fetch' }] }] },
    { parts: [{ type: 'paragraph', tight: true, inlines: [{ type: 'text', text: 'Keep it' }] }] },
  ] },
  { type: 'code', lang: 'ts', code: 'const a = 1\nconst b = 2' },
  { type: 'markdown', raw: '| a | b |\n|---|---|\n| 1 | 2 |\n' },
  { type: 'rule' },
  { type: 'custom', name: 'chart', props: { value: 3 } },
  { type: 'quote', parts: [{ type: 'paragraph', inlines: [{ type: 'text', text: 'Quoted words' }] }] },
]

describe('planParts', () => {
  it('lays every part on one clock, in document order, in the units each child releases', () => {
    const plan = planParts(PARTS)
    const [heading, paragraph, list, code, markdown, rule, custom, quote] = plan.nodes as PlanNode[]
    expect(heading).toMatchObject({ kind: 'text', start: 0, units: buildStreamModel('Why it churns').units.length })
    expect(paragraph!.start).toBe(heading!.start + heading!.units)
    expect(list).toMatchObject({ kind: 'list', start: paragraph!.start + paragraph!.units, units: 5 })
    expect(code).toMatchObject({ kind: 'code', units: codeWordEnds('const a = 1\nconst b = 2').length })
    expect(markdown).toMatchObject({ kind: 'markdown', units: 3 })
    expect(rule).toMatchObject({ kind: 'atom', units: 1 })
    expect(custom).toMatchObject({ kind: 'atom', units: 1 })
    expect(quote).toMatchObject({ kind: 'quote', units: 2, start: custom!.start + 1 })
    expect(plan.total).toBe(quote!.start + quote!.units)
  })

  it('keys parts by position and type, so a type change remounts and nothing else does', () => {
    const before = planParts(PARTS).nodes.map(node => node.key)
    const after = planParts([{ type: 'heading', depth: 1, inlines: [{ type: 'text', text: 'Why it churns' }] }, ...PARTS.slice(1)]).nodes.map(node => node.key)
    expect(after.slice(1)).toEqual(before.slice(1))
    const retyped = planParts([{ type: 'paragraph', inlines: [{ type: 'text', text: 'Why it churns' }] }, ...PARTS.slice(1)]).nodes.map(node => node.key)
    expect(retyped[0]).not.toBe(before[0])
    expect(retyped.slice(1)).toEqual(before.slice(1))
  })

  it('reuses an unchanged text part\'s model and content across parses', () => {
    const first = planParts(PARTS)
    const again = planParts(PARTS.map(part => structuredClone(part)), undefined, first.cache)
    const a = first.nodes[1] as Extract<PlanNode, { kind: 'text' }>
    const b = again.nodes[1] as Extract<PlanNode, { kind: 'text' }>
    expect(b.model).toBe(a.model)
    expect(b.full).toBe(a.full)
  })
})

describe('lineEnds', () => {
  it('ends each line after its newline, and a last line without one at the end', () => {
    expect(lineEnds('a\nbb\nccc')).toEqual([2, 5, 8])
    expect(lineEnds('a\n')).toEqual([2])
    expect(lineEnds('')).toEqual([])
  })
})
