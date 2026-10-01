import type { StreamInline, StreamState } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxStreamText from '../src/TxStreamText.vue'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

type Wrapper = ReturnType<typeof mount<typeof TxStreamText>>

/** Words still making their entrance. */
function freshWords(wrapper: Wrapper): string[] {
  return wrapper.findAll('.tx-stream-text__live .tx-stream-text__word').map(node => node.text())
}

/** What the reader sees in the live layer, caret excluded. */
function shown(wrapper: Wrapper): string {
  const live = wrapper.find('.tx-stream-text__live').element.cloneNode(true) as HTMLElement
  live.querySelectorAll('.tx-stream-text__caret').forEach(node => node.remove())
  return live.textContent ?? ''
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

const SOURCE = { id: 's1', url: 'https://example.com/a', title: 'Example' }

describe('txStreamText', () => {
  it('shows content that was there at mount as plain text, with no entrance and no caret', () => {
    const wrapper = mount(TxStreamText, { props: { content: 'Hello quiet world' } })
    expect(shown(wrapper)).toBe('Hello quiet world')
    expect(freshWords(wrapper)).toEqual([])
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
  })

  it('brings new words in as animated elements, then settles them into text', async () => {
    const wrapper = mount(TxStreamText, { props: { content: 'Hello ', streaming: true } })
    await wrapper.setProps({ content: 'Hello brave new world ' })
    await advance(16)
    expect(freshWords(wrapper)).toEqual(['brave'])
    await advance(120)
    expect(freshWords(wrapper)).toEqual(['brave', 'new', 'world'])
    expect(shown(wrapper)).toBe('Hello brave new world ')
    await advance(600)
    expect(freshWords(wrapper)).toEqual([])
    expect(shown(wrapper)).toBe('Hello brave new world ')
  })

  it('holds a word back while it may still be growing, and lets it out when the stream ends', async () => {
    const wrapper = mount(TxStreamText, { props: { content: '', streaming: true } })
    await wrapper.setProps({ content: 'Hello brave new wor' })
    // Inside the quiet grace: the source may still be mid-word.
    await advance(150)
    expect(shown(wrapper)).toBe('Hello brave new ')
    await wrapper.setProps({ content: 'Hello brave new world', streaming: false })
    await advance(400)
    expect(shown(wrapper)).toBe('Hello brave new world')
  })

  it('shows a held-back word once the source goes quiet, as mid-sentence pauses do', async () => {
    const wrapper = mount(TxStreamText, { props: { content: '', streaming: true } })
    await wrapper.setProps({ content: '我们正在查询' })
    await advance(120)
    expect(shown(wrapper)).not.toContain('查询')
    await advance(200)
    expect(shown(wrapper)).toBe('我们正在查询')
  })

  it('shows a last word that closes on punctuation without waiting', async () => {
    const wrapper = mount(TxStreamText, { props: { content: '', streaming: true } })
    await wrapper.setProps({ content: '火车从屏幕上驶过。' })
    await advance(150)
    expect(shown(wrapper)).toBe('火车从屏幕上驶过。')
  })

  it('shows the caret while live and drops it when done', async () => {
    const wrapper = mount(TxStreamText, { props: { content: 'Hi ', streaming: true } })
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(true)
    expect(wrapper.find('.tx-stream-text__caret').attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('aria-busy')).toBe('true')
    await wrapper.setProps({ streaming: false })
    await advance(400)
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
  })

  it('removes a caret switched off at once, and retracts it when the stream ends', async () => {
    // Real transitions: the stub removes a leaving caret at once either way.
    const live = () => mount(TxStreamText, { props: { content: 'Hi ', streaming: true }, global: { stubs: { transition: false } } })
    const off = live()
    await off.setProps({ caret: false })
    expect(off.find('.tx-stream-text__caret').exists()).toBe(false)
    const ended = live()
    await ended.setProps({ streaming: false })
    expect(ended.find('.tx-stream-text-caret-leave-active').exists()).toBe(true)
  })

  it('emits each state change and done once', async () => {
    const wrapper = mount(TxStreamText, { props: { content: '', streaming: true } })
    await wrapper.setProps({ content: 'one two three ' })
    await advance(900)
    // A backlog is still waiting when the source stops, so it drains.
    await wrapper.setProps({ content: 'one two three four five six seven eight nine ten eleven twelve ' })
    await advance(32)
    await wrapper.setProps({ streaming: false })
    await advance(500)
    expect(wrapper.emitted('state-change')?.map(args => args[0])).toEqual(['paused', 'streaming', 'draining', 'done'])
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('re-releases only what a rewrite changed', async () => {
    const wrapper = mount(TxStreamText, { props: { content: 'alpha beta gamma' } })
    await wrapper.setProps({ content: 'alpha beta delta' })
    await advance(16)
    expect(freshWords(wrapper)).toEqual(['delta'])
    expect(shown(wrapper)).toBe('alpha beta delta')
  })

  it('renders a citation as a chip that emits cite with its source', async () => {
    const content: StreamInline[] = [
      { type: 'text', text: 'See ' },
      { type: 'citation', source: SOURCE, index: 1 },
      { type: 'text', text: ' for more.' },
    ]
    const wrapper = mount(TxStreamText, { props: { content } })
    const chip = wrapper.find('.tx-stream-text__atom a')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(wrapper.emitted('cite')?.[0]).toEqual([SOURCE])
    // Rebuilding the array with equal values is not a rewrite.
    await wrapper.setProps({ content: content.map(part => ({ ...part })) })
    await advance(16)
    expect(freshWords(wrapper)).toEqual([])
  })

  it('with appear, content present at mount enters too', () => {
    const wrapper = mount(TxStreamText, { props: { content: 'Hello brave new world', appear: true, paced: false } })
    expect(freshWords(wrapper)).toEqual(['Hello', 'brave', 'new', 'world'])
  })

  it('keeps the space after inline code or a link outside it', async () => {
    const content: StreamInline[] = [
      { type: 'text', text: 'Call ' },
      { type: 'text', text: 'dairy.fetch', marks: ['code'] },
      { type: 'text', text: ' per row, see ' },
      { type: 'text', text: 'the docs', href: 'https://example.com/docs' },
      { type: 'text', text: ' first.' },
    ]
    const settled = mount(TxStreamText, { props: { content } })
    expect(settled.find('.tx-stream-text__live code').element.textContent).toBe('dairy.fetch')
    expect(settled.find('.tx-stream-text__live a').element.textContent).toBe('the docs')
    expect(shown(settled)).toBe('Call dairy.fetch per row, see the docs first.')
    // Still entering: the word is an element, its space the text after the pill.
    const entering = mount(TxStreamText, { props: { content: [], streaming: true } })
    await entering.setProps({ content })
    await advance(100)
    expect(entering.find('.tx-stream-text__live code .tx-stream-text__word').exists()).toBe(true)
    expect(entering.find('.tx-stream-text__live code').element.textContent).toBe('dairy.fetch')
  })

  it('keeps the space after a chip', () => {
    const wrapper = mount(TxStreamText, {
      props: {
        content: [
          { type: 'text', text: 'See ' },
          { type: 'citation', source: SOURCE, index: 1 },
          { type: 'text', text: ' for more.' },
        ],
      },
    })
    const atom = wrapper.find('.tx-stream-text__live .tx-stream-text__atom').element
    expect(atom.nextSibling?.textContent?.startsWith(' ')).toBe(true)
    expect(shown(wrapper).replace(atom.textContent ?? '', '[1]')).toBe('See [1] for more.')
  })

  it('lets hosts replace the caret, the citation chip and custom inline runs', () => {
    const wrapper = mount(TxStreamText, {
      props: {
        streaming: true,
        content: [
          { type: 'text', text: 'Price ' },
          { type: 'citation', source: SOURCE, index: 2 },
          { type: 'custom', name: 'badge', props: { tone: 'up' } },
          { type: 'text', text: ' now ' },
        ],
      },
      slots: {
        caret: ({ state }: { state: StreamState }) => h('i', { class: 'my-caret' }, state),
        citation: ({ index }: { index?: number }) => h('sup', { class: 'my-cite' }, `[${index}]`),
        inline: ({ name, props }: { name: string, props?: Record<string, unknown> }) => h('b', { class: 'my-inline' }, `${name}:${props?.tone}`),
      },
    })
    expect(wrapper.find('.my-caret').text()).toBe('streaming')
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)
    expect(wrapper.find('.my-cite').text()).toBe('[2]')
    expect(wrapper.find('.my-inline').text()).toBe('badge:up')
  })

  it('holds the final layout in a hidden copy while a complete content replays', async () => {
    const wrapper = mount(TxStreamText, { props: { content: 'one two three four', reserve: true } })
    ;(wrapper.vm as unknown as { replay: () => void }).replay()
    await nextTick()
    const reserve = wrapper.find('.tx-stream-text__reserve')
    expect(reserve.exists()).toBe(true)
    expect(reserve.attributes('aria-hidden')).toBe('true')
    expect(reserve.attributes('inert')).toBeDefined()
    expect(reserve.text()).toBe('one two three four')
    expect(wrapper.classes()).toContain('is-reserving')
    await advance(400)
    expect(wrapper.find('.tx-stream-text__reserve').exists()).toBe(false)
    expect(shown(wrapper)).toBe('one two three four')
  })

  it('links only safe URLs', () => {
    const wrapper = mount(TxStreamText, {
      props: {
        content: [
          { type: 'text', text: 'safe', href: 'https://example.com' },
          { type: 'text', text: ' bad', href: 'javascript:alert(1)' },
        ],
      },
    })
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.attributes('href')).toBe('https://example.com')
    expect(links[0]!.attributes('rel')).toBe('noopener noreferrer')
    expect(links[0]!.attributes('target')).toBeUndefined()
    expect(shown(wrapper)).toBe('safe bad')
  })

  it('treats a scheme-relative URL as foreign, however it is spelled', () => {
    const hrefs = ['//evil.example/x', '/\\evil.example/x', '/\t/evil.example/x', ' //evil.example/x']
    const wrapper = mount(TxStreamText, {
      props: { content: hrefs.map((href, index) => ({ type: 'text' as const, text: `f${index} `, href })) },
    })
    expect(wrapper.findAll('a')).toHaveLength(0)

    const relative = ['/docs', './page', '#part', '?q=1']
    const local = mount(TxStreamText, {
      props: { content: relative.map((href, index) => ({ type: 'text' as const, text: `r${index} `, href })) },
    })
    expect(local.findAll('a').map(link => link.attributes('href'))).toEqual(relative)
  })

  it('under reduced motion shows words as they arrive, without entrances', async () => {
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
    const wrapper = mount(TxStreamText, { props: { content: '', streaming: true } })
    await nextTick()
    expect(wrapper.classes()).toContain('is-reveal-none')
    await wrapper.setProps({ content: 'plain words here ' })
    await nextTick()
    expect(shown(wrapper)).toBe('plain words here ')
    expect(freshWords(wrapper)).toEqual([])
  })

  it('renders on the server as plain text, with no animated elements', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(TxStreamText, { content: 'Hello server world ', streaming: true }),
    }))
    expect(html).toContain('Hello server world')
    expect(html).not.toContain('tx-stream-text__word')
  })
})
