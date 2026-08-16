import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { highlightToHtml } from '../../stream-markdown/src/shiki-runtime'
import TxCodeStream from '../src/TxCodeStream.vue'

vi.mock('../../stream-markdown/src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

const highlight = vi.mocked(highlightToHtml)

const CODE = [
  'export async function churnBatch() {',
  '  const flavor = await getFlavor("pistachio");',
  '  return flavor.gallons;',
  '}',
].join('\n')

function shikiHtml(lines: string[]): string {
  return `<pre class="shiki"><code>${
    lines.map(line => `<span class="line"><span style="color:#24292F">${line}</span></span>`).join('\n')
  }</code></pre>`
}

beforeEach(() => {
  highlight.mockReset()
  highlight.mockResolvedValue(null)
})

describe('txCodeStream reveal', () => {
  it('shows the whole listing when no reveal is set', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE } })

    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(4)
    expect(wrapper.findAll('.tx-bui-code-stream__code')[0]!.text())
      .toBe('export async function churnBatch() {')
  })

  it('reveals a prefix of the lines', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 2 } })

    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(2)

    await wrapper.setProps({ revealedLines: 3 })
    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(3)
  })

  it('clamps a reveal outside the listing', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 99 } })
    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(4)

    await wrapper.setProps({ revealedLines: -4 })
    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(4)

    await wrapper.setProps({ revealedLines: 0 })
    expect(wrapper.findAll('.tx-bui-code-stream__line')).toHaveLength(0)
  })

  it('reuses already-revealed lines so their entrance does not replay', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 1 } })
    const first = wrapper.find('.tx-bui-code-stream__line').element

    await wrapper.setProps({ revealedLines: 2 })
    expect(wrapper.findAll('.tx-bui-code-stream__line')[0]!.element).toBe(first)
  })

  it('announces completion once the last line lands, and not on arrival', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 4 } })
    expect(wrapper.emitted('complete')).toBeUndefined()

    await wrapper.setProps({ revealedLines: 1 })
    await wrapper.setProps({ revealedLines: 3 })
    expect(wrapper.emitted('complete')).toBeUndefined()

    await wrapper.setProps({ revealedLines: 4 })
    expect(wrapper.emitted('complete')).toHaveLength(1)
  })
})

describe('txCodeStream caret', () => {
  it('marks the last revealed line while lines are still arriving', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 2 } })

    const carets = wrapper.findAll('.tx-bui-code-stream__caret')
    expect(carets).toHaveLength(1)
    expect(wrapper.findAll('.tx-bui-code-stream__line')[1]!.find('.tx-bui-code-stream__caret').exists()).toBe(true)
  })

  it('drops the caret once the listing is complete', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 2 } })

    await wrapper.setProps({ revealedLines: 4 })
    expect(wrapper.find('.tx-bui-code-stream__caret').exists()).toBe(false)
  })

  it('can be turned off', () => {
    const wrapper = mount(TxCodeStream, {
      props: { code: CODE, revealedLines: 2, caret: false },
    })

    expect(wrapper.find('.tx-bui-code-stream__caret').exists()).toBe(false)
  })
})

describe('txCodeStream gutter and sizing', () => {
  it('numbers the lines and can stop', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE } })

    expect(wrapper.findAll('.tx-bui-code-stream__lineno').map(node => node.text()))
      .toEqual(['1', '2', '3', '4'])
    expect(wrapper.find('.tx-bui-code-stream__lineno').attributes('aria-hidden')).toBe('true')

    await wrapper.setProps({ lineNumbers: false })
    expect(wrapper.find('.tx-bui-code-stream__lineno').exists()).toBe(false)
  })

  it('reserves the full listing height regardless of the reveal', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, revealedLines: 1 } })

    expect(wrapper.find('.tx-bui-code-stream__body').attributes('style'))
      .toContain('--tx-bui-code-stream-lines: 4')
  })

  it('takes an explicit floor', () => {
    expect(
      mount(TxCodeStream, { props: { code: CODE, minHeight: 137 } })
        .find('.tx-bui-code-stream__body')
        .attributes('style'),
    ).toContain('--tx-bui-code-stream-min-height: 137px')

    expect(
      mount(TxCodeStream, { props: { code: CODE, minHeight: '12rem' } })
        .find('.tx-bui-code-stream__body')
        .attributes('style'),
    ).toContain('--tx-bui-code-stream-min-height: 12rem')
  })
})

describe('txCodeStream header', () => {
  it('renders the filename and language label', () => {
    const wrapper = mount(TxCodeStream, {
      props: { code: CODE, filename: 'churn.ts', langLabel: 'TypeScript' },
    })

    expect(wrapper.find('.tx-bui-code-stream__filename').text()).toBe('churn.ts')
    expect(wrapper.find('.tx-bui-code-stream__lang').text()).toBe('TypeScript')
  })

  it('disappears when there is nothing to put in it', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE, copyable: false } })

    expect(wrapper.find('.tx-bui-code-stream__header').exists()).toBe(false)
  })

  it('survives on the copy button alone', () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE } })

    expect(wrapper.find('.tx-bui-code-stream__header').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-code-stream__copy').exists()).toBe(true)
  })

  it('reuses TxCopyButton and forwards its copy event', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE } })

    const copy = wrapper.findComponent({ name: 'TxCopyButton' })
    expect(copy.props('text')).toBe(CODE)

    copy.vm.$emit('copy', CODE)
    await flushPromises()
    expect(wrapper.emitted('copy')).toEqual([[CODE]])
  })

  it('takes custom copy copy', () => {
    const copy = mount(TxCodeStream, {
      props: { code: CODE, copyLabel: '复制', copiedLabel: '已复制' },
    }).findComponent({ name: 'TxCopyButton' })

    expect(copy.props('copyLabel')).toBe('复制')
    expect(copy.props('copiedLabel')).toBe('已复制')
  })

  it('replaces the title through the header slot and appends through actions', () => {
    const wrapper = mount(TxCodeStream, {
      props: { code: CODE, filename: 'churn.ts' },
      slots: { header: '<b class="custom-header">agent</b>', actions: '<i class="custom-action" />' },
    })

    expect(wrapper.find('.custom-header').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-code-stream__filename').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-code-stream__actions .custom-action').exists()).toBe(true)
  })
})

describe('txCodeStream highlighting', () => {
  it('renders plain text and never calls the highlighter without a language', async () => {
    const wrapper = mount(TxCodeStream, { props: { code: CODE } })
    await flushPromises()

    expect(highlight).not.toHaveBeenCalled()
    expect(wrapper.findAll('.tx-bui-code-stream__code')[3]!.text()).toBe('}')
    expect(wrapper.find('.tx-bui-code-stream__code').html()).not.toContain('<span')
  })

  it('splits shiki output back into lines', async () => {
    highlight.mockResolvedValue(shikiHtml([
      'export async function churnBatch() {',
      '  const flavor = await getFlavor("pistachio");',
      '  return flavor.gallons;',
      '}',
    ]))

    const wrapper = mount(TxCodeStream, { props: { code: CODE, lang: 'ts' } })
    await flushPromises()

    expect(highlight).toHaveBeenCalledWith(CODE, 'ts', 'light')

    const codes = wrapper.findAll('.tx-bui-code-stream__code')
    expect(codes).toHaveLength(4)
    // Proves the mock is live: the colour span only exists in highlighted output.
    expect(codes[0]!.html()).toContain('style="color:#24292F"')
    expect(codes[3]!.text()).toBe('}')
  })

  it('falls back to plain text when the highlighter returns a different line count', async () => {
    highlight.mockResolvedValue(shikiHtml(['only one line']))

    const wrapper = mount(TxCodeStream, { props: { code: CODE, lang: 'ts' } })
    await flushPromises()

    expect(wrapper.findAll('.tx-bui-code-stream__code')).toHaveLength(4)
    expect(wrapper.find('.tx-bui-code-stream__code').html()).not.toContain('<span')
    expect(wrapper.findAll('.tx-bui-code-stream__code')[0]!.text())
      .toBe('export async function churnBatch() {')
  })

  it('drops highlighting again when the language is cleared', async () => {
    highlight.mockResolvedValue(shikiHtml([
      'export async function churnBatch() {',
      '  const flavor = await getFlavor("pistachio");',
      '  return flavor.gallons;',
      '}',
    ]))

    const wrapper = mount(TxCodeStream, { props: { code: CODE, lang: 'ts' } })
    await flushPromises()
    expect(wrapper.find('.tx-bui-code-stream__code').html()).toContain('<span')

    await wrapper.setProps({ lang: '' })
    await flushPromises()
    expect(wrapper.find('.tx-bui-code-stream__code').html()).not.toContain('<span')
  })

  it('re-highlights for the resolved theme', async () => {
    highlight.mockResolvedValue(null)

    mount(TxCodeStream, { props: { code: CODE, lang: 'ts', theme: 'dark' } })
    await flushPromises()

    expect(highlight).toHaveBeenCalledWith(CODE, 'ts', 'dark')
  })
})
