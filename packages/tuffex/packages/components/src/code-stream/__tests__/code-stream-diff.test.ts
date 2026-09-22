import type { CodeDiffRow } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCodeStream from '../src/TxCodeStream.vue'

const CODE = [
  'export async function churnBatch() {',
  '  const base = await dairy.fetch({ flavor })',
  '  await freezer.store(base, { temp: "-16C" })',
  '}',
].join('\n')

const DIFF: CodeDiffRow[] = [
  { number: 1, content: 'export async function churnBatch() {' },
  { number: 2, content: '  const base = await dairy.fetch({ flavor })' },
  { number: 3, kind: 'removed', content: '  await freezer.store(base, { temp: "-14C" })' },
  { number: 3, kind: 'added', content: '  await freezer.store(base, { temp: "-16C" })' },
  { number: 4, kind: 'added', content: '  if (!base.approved) return null' },
  { number: 5, content: '}' },
]

// `lang: ''` keeps the plain-text branch, so assertions read the rendered text
// instead of waiting on an async highlighter.
function mountDiff(props: Record<string, unknown> = {}) {
  return mount(TxCodeStream, { props: { code: CODE, lang: '', diff: DIFF, ...props } })
}

describe('txCodeStream diff mode', () => {
  it('stays a plain listing until diff rows are supplied', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, lang: '' } })

    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(4)
    expect(wrapper.find('.tx-bui-code-stream__tally').exists()).toBe(false)
    expect(wrapper.find('.is-added').exists()).toBe(false)
  })

  it('treats an empty diff array as a listing, not an empty diff', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, lang: '', diff: [] } })

    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(4)
    expect(wrapper.find('.tx-bui-code-stream__tally').exists()).toBe(false)
  })

  it('renders one row per diff entry, tagged by kind', () => {
    const wrapper = mountDiff()
    const lines = wrapper.findAll('.tx-bui-code-stream__line')

    expect(lines).toHaveLength(6)
    expect(lines[2]!.classes()).toContain('is-removed')
    expect(lines[3]!.classes()).toContain('is-added')
    expect(lines[4]!.classes()).toContain('is-added')
    // An entry with no kind is context, not an unmarked change.
    expect(lines[0]!.classes()).toContain('is-context')
  })

  it('tallies added and removed rows in the header', () => {
    const wrapper = mountDiff()

    expect(wrapper.find('.tx-bui-code-stream__added').text()).toBe('+2')
    // U+2212, not a hyphen: it is a figure, matching the family's sign rule.
    expect(wrapper.find('.tx-bui-code-stream__removed').text()).toBe('−1')
  })

  it('omits a side of the tally that is zero', () => {
    const wrapper = mountDiff({
      diff: [{ number: 1, kind: 'added', content: 'new()' }],
    })

    expect(wrapper.find('.tx-bui-code-stream__added').text()).toBe('+1')
    expect(wrapper.find('.tx-bui-code-stream__removed').exists()).toBe(false)
  })

  it('lets a removed row and its replacement share a gutter number', () => {
    const numbers = mountDiff()
      .findAll('.tx-bui-code-stream__lineno')
      .map(n => n.text())

    // Both sides of the replacement are line 3 in their own revision.
    expect(numbers).toEqual(['1', '2', '3', '3', '4', '5'])
  })

  it('leaves the gutter blank for a row with no number', () => {
    const wrapper = mountDiff({
      diff: [{ content: 'orphan' }],
    })

    expect(wrapper.find('.tx-bui-code-stream__lineno').text()).toBe('')
  })

  it('renders the diff rows rather than code', () => {
    const text = mountDiff().find('.tx-bui-code-stream__body').text()

    // The removed revision only exists in the diff, never in `code`.
    expect(text).toContain('"-14C"')
    expect(text).toContain('"-16C"')
  })

  it('keeps the copy button yielding `code`, not the diff', () => {
    const wrapper = mountDiff()

    // Copying a diff with its markers stripped produces a file that is neither
    // revision, so the host says which text is copyable.
    expect(wrapper.findComponent({ name: 'TxCopyButton' }).props('text')).toBe(CODE)
  })

  it('reveals diff rows through the same counter as a listing', () => {
    const wrapper = mountDiff({ revealedLines: 3 })

    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(3)
  })

  it('reserves height from the diff row count, not the code line count', () => {
    // `code` is 4 lines and the diff is 6; a reveal must grow into the taller of
    // the two or the page jumps when the last rows arrive.
    const style = mountDiff().find('.tx-bui-code-stream__body').attributes('style')!
    expect(style).toContain('--tx-bui-code-stream-lines: 6')
  })

  it('shows the header for a diff even with nothing else in it', () => {
    const wrapper = mountDiff({ copyable: false, filename: '', langLabel: '' })

    expect(wrapper.find('.tx-bui-code-stream__header').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-code-stream__tally').exists()).toBe(true)
  })
})
