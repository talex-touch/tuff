import type { StreamState } from '../../stream-text/src/types'
import type { StreamPart } from '../src/types'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxStreamElement from '../src/TxStreamElement.vue'

vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }))
vi.mock('../../stream-markdown/src/shiki-runtime', () => ({ highlightToHtml: vi.fn(async () => null) }))

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

const SOURCES = [{ id: 'a', url: 'https://example.com/a', title: 'Scoop Data' }]

describe('txStreamElement slots', () => {
  it('hands the caret slot the state, at the write head only', async () => {
    const wrapper = mount(TxStreamElement, {
      props: { content: '', streaming: true },
      slots: { caret: ({ state }: { state: StreamState }) => h('i', { class: 'my-caret' }, state) },
    })
    await nextTick()
    expect(wrapper.find('.my-caret').text()).toBe('streaming')
    await wrapper.setProps({ content: 'First paragraph here.\n\nSecond one.' })
    await advance(200)
    expect(wrapper.findAll('.my-caret')).toHaveLength(1)
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
    await wrapper.setProps({ streaming: false })
    await advance(600)
    expect(wrapper.find('.my-caret').exists()).toBe(false)
  })

  it('replaces citation chips and custom inlines', async () => {
    const parts: StreamPart[] = [{
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'Up ' },
        { type: 'custom', name: 'delta', props: { value: '+23%' } },
        { type: 'text', text: ' says ' },
        { type: 'citation', source: SOURCES[0]!, index: 1 },
      ],
    }]
    const wrapper = mount(TxStreamElement, {
      props: { parts },
      slots: {
        citation: ({ index }: { index?: number }) => h('sup', { class: 'my-cite' }, String(index)),
        inline: ({ name, props }: { name: string, props?: Record<string, unknown> }) => h('b', { class: 'my-inline' }, `${name} ${props?.value}`),
      },
    })
    await flushPromises()
    expect(wrapper.find('.my-cite').text()).toBe('1')
    expect(wrapper.find('.my-inline').text()).toBe('delta +23%')
  })

  it('replaces code blocks with the revealed code and whether it streams', async () => {
    const seen: { code: string, streaming: boolean, lang?: string }[] = []
    const wrapper = mount(TxStreamElement, {
      props: { content: '', streaming: true },
      slots: {
        code: ({ part, code, streaming }: { part: Extract<StreamPart, { type: 'code' }>, code: string, streaming: boolean }) => {
          seen.push({ code, streaming, lang: part.lang })
          return h('pre', { class: 'my-code' }, code)
        },
      },
    })
    await wrapper.setProps({ content: '```ts\nconst a = 1\nconst b = 2\n```' })
    await advance(40)
    expect(wrapper.find('.my-code').exists()).toBe(true)
    expect(seen.some(entry => entry.streaming && entry.lang === 'ts' && entry.code.length > 0 && entry.code.length < 'const a = 1\nconst b = 2'.length)).toBe(true)
    await wrapper.setProps({ streaming: false })
    await advance(600)
    expect(wrapper.find('.my-code').text()).toBe('const a = 1\nconst b = 2')
    expect(seen.at(-1)!.streaming).toBe(false)
  })

  it('renders custom parts through part-<name> with the state, and the footer once done', async () => {
    const parts: StreamPart[] = [
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Before the chart.' }] },
      { type: 'custom', name: 'chart', props: { value: 7 } },
    ]
    const wrapper = mount(TxStreamElement, {
      props: { parts, streaming: true },
      slots: {
        'part-chart': ({ part, state }: { part: Extract<StreamPart, { type: 'custom' }>, state: StreamState }) =>
          h('figure', { class: 'my-chart' }, `${part.props?.value} ${state}`),
        'footer': ({ state, done }: { state: StreamState, done: boolean }) =>
          h('footer', { class: 'my-footer' }, `${state} ${done}`),
      },
    })
    await advance(300)
    expect(wrapper.find('.my-chart').text()).toMatch(/^7 (streaming|paused)$/)
    expect(wrapper.find('.my-footer').text()).toMatch(/false$/)
    await wrapper.setProps({ streaming: false })
    await advance(600)
    expect(wrapper.find('.my-footer').text()).toBe('done true')
  })

  it('follows the host when a slot comes or goes', async () => {
    const Host = defineComponent({
      props: { custom: Boolean },
      setup(props) {
        return () => h(
          TxStreamElement,
          { content: 'Sorting dominates [1] here.\n\nA second part.', sources: SOURCES },
          props.custom ? { citation: ({ index }: { index?: number }) => h('sup', { class: 'my-cite' }, String(index)) } : {},
        )
      },
    })
    const wrapper = mount(Host, { props: { custom: true } })
    await flushPromises()
    expect(wrapper.find('.my-cite').exists()).toBe(true)
    await wrapper.setProps({ custom: false })
    expect(wrapper.find('.my-cite').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-inline-citation').exists()).toBe(true)
    await wrapper.setProps({ custom: true })
    expect(wrapper.find('.my-cite').exists()).toBe(true)
  })

  it('leaves the caret out entirely with caret: false', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: '', streaming: true, caret: false } })
    await nextTick()
    await wrapper.setProps({ content: 'Some words and a table.\n\n| a |\n|---|\n| 1 |' })
    await advance(300)
    await flushPromises()
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
  })
})
