import type { ComponentPublicInstance } from 'vue'
import type { StreamState } from '../../stream-text/src/types'
import type { StreamPart } from '../src/types'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxStreamElement from '../src/TxStreamElement.vue'

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '') },
}))

vi.mock('../../stream-markdown/src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

type Wrapper = ReturnType<typeof mount<typeof TxStreamElement>>

const SOURCES = [{ id: 'a', url: 'https://example.com/a', title: 'Scoop Data' }]

const ANSWER = [
  '## Why it churns',
  '',
  'Sorting dominates here [1], not the reduce.',
  '',
  '- Cache the fetch',
  '- Keep it',
  '',
  '```ts',
  'const a = 1',
  '```',
].join('\n')

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

/** What the reader sees in the live layer: carets excluded, whitespace collapsed. */
function shown(wrapper: Wrapper): string {
  const live = wrapper.find('.tx-stream-element__live').element.cloneNode(true) as HTMLElement
  live.querySelectorAll('.tx-stream-text__caret, .tx-bui-code-stream__stream-caret, .tx-stream-element__caret, .tx-bui-code-stream__header').forEach(node => node.remove())
  return (live.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function freshWords(wrapper: Wrapper): string[] {
  return wrapper.findAll('.tx-stream-element__live .tx-stream-text__word').map(node => node.text())
}

describe('txStreamElement', () => {
  it('shows complete content at mount as it is, with no entrance and no caret', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: ANSWER, sources: SOURCES } })
    await flushPromises()
    expect(shown(wrapper)).toContain('Why it churns')
    expect(shown(wrapper)).toContain('Keep it')
    expect(wrapper.find('.tx-bui-code-stream').exists()).toBe(true)
    expect(freshWords(wrapper)).toEqual([])
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
  })

  it('reveals the parts strictly in order on one clock, the caret riding the write head', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: '', streaming: true, sources: SOURCES } })
    await nextTick()
    // Live before the first word: the caret waits on an empty line.
    expect(wrapper.find('.tx-stream-element__lead .tx-stream-caret').exists()).toBe(true)
    expect(wrapper.attributes('aria-busy')).toBe('true')

    await wrapper.setProps({ content: ANSWER })
    await advance(16)
    // The heading has begun; the paragraph after it is not mounted yet.
    expect(wrapper.find('h2').exists()).toBe(true)
    expect(wrapper.find('p.tx-stream-element__text').exists()).toBe(false)

    const seen: string[] = []
    for (let frame = 0; frame < 40; frame++) {
      await advance(16)
      seen.push(shown(wrapper))
      // One write head at a time.
      expect(wrapper.findAll('.tx-stream-caret').length).toBeLessThanOrEqual(1)
    }
    // Every frame extends the previous one: nothing later shows before something earlier.
    for (let index = 1; index < seen.length; index++)
      expect(seen[index]!.startsWith(seen[index - 1]!.replace(/\s*$/, '').slice(0, -1))).toBe(true)

    await wrapper.setProps({ streaming: false })
    await advance(600)
    await flushPromises()
    expect(shown(wrapper)).toContain('const a = 1')
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
  })

  it('gives a new part\'s first word an entrance too', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: 'First line here.', streaming: true } })
    await advance(100)
    await wrapper.setProps({ content: 'First line here.\n\nSecond paragraph starts' })
    await advance(40)
    const second = wrapper.findAll('p.tx-stream-element__text')[1]
    expect(second?.exists()).toBe(true)
    expect(second!.findAll('.tx-stream-text__word').map(node => node.text())).toContain('Second')
  })

  it('plays the entrance of every word due when a part mounts, as in a catch-up', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: 'Done first.', streaming: true } })
    await advance(200)
    // A burst: many words at once, released several per frame before the next render.
    await wrapper.setProps({ content: 'Done first.\n\nThen a long burst of words arrives all at once here.' })
    vi.advanceTimersByTime(80)
    await nextTick()
    await nextTick()
    const second = wrapper.findAll('p.tx-stream-element__text')[1]!
    const entering = second.findAll('.tx-stream-text__word').map(node => node.text())
    expect(entering.length).toBeGreaterThan(1)
    expect(entering[0]).toBe('Then')
  })

  it('re-renders only the part at the write head as the clock ticks', async () => {
    // First word of every TxStreamText that updates.
    const updated: string[] = []
    const wrapper = mount(TxStreamElement, {
      props: { content: '', streaming: true },
      global: {
        mixins: [{
          updated(this: ComponentPublicInstance) {
            if (this.$options.name === 'TxStreamText')
              updated.push((this.$el as HTMLElement).textContent?.trim().split(/\s+/)[0] ?? '')
          },
        }],
      },
    })
    const earlier = 'Alpha stays put.\n\nBravo too.'
    await wrapper.setProps({ content: earlier })
    // Frame by frame, so the parts mount and settle as they would in a browser.
    for (let frame = 0; frame < 60; frame++)
      await advance(24)
    updated.length = 0
    await wrapper.setProps({ content: `${earlier}\n\nCharlie keeps streaming a good many words along here` })
    for (let frame = 0; frame < 20; frame++)
      await advance(24)
    expect(updated.filter(word => word === 'Charlie').length).toBeGreaterThan(3)
    expect(updated.filter(word => word === 'Alpha')).toEqual([])
    // Once, as the write head leaves it.
    expect(updated.filter(word => word === 'Bravo').length).toBeLessThanOrEqual(1)
  })

  it('drops a caret at once as the write head moves on, and retracts the last one', async () => {
    // Real transitions: the stub would remove a leaving caret at once either way.
    const wrapper = mount(TxStreamElement, { props: { content: '', streaming: true }, global: { stubs: { transition: false } } })
    await wrapper.setProps({ content: 'First part here.\n\nSecond part follows' })
    const paragraphs = () => wrapper.findAll('p.tx-stream-element__text')
    for (let frame = 0; frame < 40 && paragraphs().length < 2; frame++)
      await advance(24)
    // The frame the second part takes the write head: one caret, no leave playing.
    expect(paragraphs()).toHaveLength(2)
    expect(wrapper.findAll('.tx-stream-caret')).toHaveLength(1)
    expect(paragraphs()[1]!.find('.tx-stream-caret').exists()).toBe(true)
    expect(wrapper.find('.tx-stream-text-caret-leave-active').exists()).toBe(false)
    for (let frame = 0; frame < 40; frame++)
      await advance(24)
    await wrapper.setProps({ streaming: false })
    // The answer ends: the last caret retracts through its leave transition.
    expect(wrapper.find('.tx-stream-text-caret-leave-active').exists()).toBe(true)
  })

  it('renders code with TxCodeStream and delegated Markdown with TxStreamMarkdown', async () => {
    const wrapper = mount(TxStreamElement, {
      props: { content: 'Table:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst a = 1\n```' },
    })
    await flushPromises()
    expect(wrapper.find('.tx-stream-element__markdown.tx-stream-md').exists()).toBe(true)
    expect(wrapper.find('.tx-stream-element__markdown table').exists()).toBe(true)
    expect(wrapper.find('.tx-stream-element__code.tx-bui-code-stream').text()).toContain('const a = 1')
  })

  it('turns [n] into a chip that emits cite with its source', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: 'Fast [1] and done.', sources: SOURCES } })
    await flushPromises()
    const chip = wrapper.find('.tx-stream-text__atom a')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(wrapper.emitted('cite')?.[0]).toEqual([SOURCES[0]])
  })

  it('reports every state change and done once', async () => {
    const states: StreamState[] = []
    let done = 0
    const wrapper = mount(TxStreamElement, {
      props: { 'content': '', 'streaming': true, 'onState-change': (s: StreamState) => states.push(s), 'onDone': () => { done++ } },
    })
    await wrapper.setProps({ content: 'One two three.' })
    await advance(600)
    await wrapper.setProps({ content: 'One two three.\n\nFour five six seven.' })
    await advance(16)
    await wrapper.setProps({ streaming: false })
    await advance(600)
    expect(states).toEqual(['paused', 'streaming', 'draining', 'done'])
    expect(done).toBe(1)
  })

  it('replays complete content from the first word, holding the layout with reserve', async () => {
    const wrapper = mount(TxStreamElement, { props: { content: ANSWER, reserve: true } })
    await flushPromises()
    const vm = wrapper.vm as unknown as { replay: () => void, skip: () => void, state: StreamState }
    vm.replay()
    await advance(32)
    const reserve = wrapper.find('.tx-stream-element__reserve')
    expect(reserve.exists()).toBe(true)
    expect(reserve.attributes('aria-hidden')).toBe('true')
    expect(reserve.attributes('inert')).toBeDefined()
    expect(reserve.text()).toContain('Keep it')
    expect(shown(wrapper).length).toBeLessThan(10)
    expect(freshWords(wrapper).length).toBeGreaterThan(0)

    vm.skip()
    await nextTick()
    await flushPromises()
    expect(shown(wrapper)).toContain('Keep it')
    expect(freshWords(wrapper)).toEqual([])
    expect(wrapper.find('.tx-stream-element__reserve').exists()).toBe(false)
    expect(vm.state).toBe('done')
  })

  it('holds the answer\'s height through a reserve replay, and lets go when it ends', async () => {
    // The copy renders delegated parts late; the height the answer has now covers those frames.
    const wrapper = mount(TxStreamElement, { props: { content: ANSWER, reserve: true } })
    await flushPromises()
    const live = () => wrapper.find('.tx-stream-element__live').element as HTMLElement
    vi.spyOn(live(), 'getBoundingClientRect').mockReturnValue({ height: 480.5 } as DOMRect)
    expect(live().style.minHeight).toBe('')
    ;(wrapper.vm as unknown as { replay: () => void }).replay()
    await nextTick()
    expect(wrapper.find('.tx-stream-element__reserve').exists()).toBe(true)
    expect(live().style.minHeight).toBe('480.5px')
    for (let frame = 0; frame < 200 && wrapper.find('.tx-stream-element__reserve').exists(); frame++)
      await advance(24)
    expect(wrapper.find('.tx-stream-element__reserve').exists()).toBe(false)
    expect(live().style.minHeight).toBe('')
  })

  it('renders structured parts, custom ones through renderers', async () => {
    const parts: StreamPart[] = [
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Before the chart.' }] },
      { type: 'custom', name: 'chart', props: { value: 7 } },
    ]
    const Chart = { props: ['value'], setup: (p: { value: number }) => () => h('b', { class: 'chart' }, `chart ${p.value}`) }
    const wrapper = mount(TxStreamElement, { props: { parts, renderers: { chart: Chart } } })
    await flushPromises()
    expect(wrapper.find('.tx-stream-element__custom .chart').text()).toBe('chart 7')
  })

  it('under reduced motion shows everything as it arrives, without entrances', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    const wrapper = mount(TxStreamElement, { props: { content: '', streaming: true } })
    await nextTick()
    expect(wrapper.classes()).toContain('is-reveal-none')
    await wrapper.setProps({ content: 'All of these words at once.\n\nAnd this too.' })
    await nextTick()
    await nextTick()
    expect(shown(wrapper)).toContain('And this too')
    expect(freshWords(wrapper)).toEqual([])
  })

  it('renders on the server as plain text, with no animated elements', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(TxStreamElement, { content: 'Hello **server** world.', streaming: true }),
    }))
    expect(html).toContain('server')
    expect(html).not.toContain('tx-stream-text__word')
  })
})
