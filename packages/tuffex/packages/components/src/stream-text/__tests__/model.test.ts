import type { StreamModel } from '../src/model'
import type { StreamInline } from '../src/types'
import { describe, expect, it } from 'vitest'
import { buildStreamModel, sliceStreamContent } from '../src/model'

const SOURCE = { id: 's1', url: 'https://example.com/a', title: 'Example' }

/** What a unit is, independent of how the runs are numbered. */
function shape(model: StreamModel): string[] {
  return model.units.map((unit) => {
    const run = model.runs[unit.run]
    return `${unit.kind}|${unit.text}|${JSON.stringify(unit.ws)}|${run ? `${run.marks.join('+')}@${run.href ?? ''}` : ''}`
  })
}

const CASES: Record<string, StreamInline[] | string> = {
  'plain English': 'Sorting dominates at O(n log n), so the reduce is not the bottleneck.',
  'Chinese': '开心果是这个月增长最快的口味，销量涨了 23%，核果类口味也在同一区间升温。',
  'marks and a link': [
    { type: 'text', text: 'Use ' },
    { type: 'text', text: 'dairy.fetch', marks: ['code'] },
    { type: 'text', text: ' and ' },
    { type: 'text', text: 'read the docs', href: 'https://example.com/docs' },
    { type: 'text', text: ' first.' },
  ],
  'citations with spaces around them': [
    { type: 'text', text: 'See ' },
    { type: 'citation', source: SOURCE, index: 1 },
    { type: 'text', text: ' and ' },
    { type: 'citation', source: SOURCE, index: 2 },
    { type: 'text', text: ' for more.' },
  ],
  'a custom inline first': [
    { type: 'custom', name: 'delta', props: { value: '+23%' } },
    { type: 'text', text: '  after a double space' },
  ],
  'emoji and opening quotes': '他说“好的”👋 then (left) — done.',
}

describe('sliceStreamContent', () => {
  for (const [name, content] of Object.entries(CASES)) {
    it(`gives back exactly the first n units: ${name}`, () => {
      const full = buildStreamModel(content)
      const expected = shape(full)
      expect(expected.length).toBeGreaterThan(2)
      for (let n = 0; n <= expected.length + 1; n++) {
        const rebuilt = buildStreamModel(sliceStreamContent(full, n))
        expect(shape(rebuilt), `${name} @ ${n}`).toEqual(expected.slice(0, n))
      }
    })
  }

  it('keeps whitespace out of the words, wherever the cut falls', () => {
    const full = buildStreamModel('one two  three')
    expect(sliceStreamContent(full, 2)).toEqual([{ type: 'text', text: 'one two  ' }])
  })
})
