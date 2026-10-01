import type { StreamState } from '../../stream-text/src/types'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { highlightToHtml } from '../../stream-markdown/src/shiki-runtime'
import { TxCodeStream, TxStreamCode } from '../index'
import CodeStream from '../src/TxCodeStream.vue'

vi.mock('../../stream-markdown/src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

const highlight = vi.mocked(highlightToHtml)

enableAutoUnmount(afterEach)

beforeEach(() => {
  highlight.mockReset()
  highlight.mockResolvedValue(null)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const CODE = [
  'export async function churnBatch() {',
  '  const flavor = await getFlavor("pistachio");',
  '  return flavor.gallons;',
  '}',
].join('\n')

type Wrapper = ReturnType<typeof mount<typeof CodeStream>>

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Shiki's shape: one `.line` per source line, here one colour for the whole line. */
function shikiHtml(source: string): string {
  const body = source.split('\n').map(line => `<span class="line"><span style="color:#D73A49">${escape(line)}</span></span>`)
  return `<pre class="shiki"><code>${body.join('\n')}</code></pre>`
}

function lines(wrapper: Wrapper): string[] {
  return wrapper.findAll('.tx-bui-code-stream__code').map(node => node.element.textContent ?? '')
}

function shown(wrapper: Wrapper): string {
  return lines(wrapper).join('\n')
}

function fresh(wrapper: Wrapper): string[] {
  return wrapper.findAll('.tx-bui-code-stream__fresh').map(node => node.element.textContent ?? '')
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

function stubReducedMotion(): void {
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
}

describe('txCodeStream streaming mode', () => {
  it('stays a listing, or a host-driven reveal, unless streaming is set on its own', () => {
    const listing = mount(CodeStream, { props: { code: CODE } })
    expect(listing.classes()).not.toContain('is-live')
    expect(lines(listing)).toHaveLength(4)

    const hostDriven = mount(CodeStream, { props: { code: CODE, streaming: true, revealedLines: 2 } })
    expect(hostDriven.classes()).not.toContain('is-live')
    expect(lines(hostDriven)).toHaveLength(2)
  })

  it('shows code that was there at mount at once, with no entrance', () => {
    const wrapper = mount(CodeStream, { props: { code: CODE, streaming: false } })
    expect(wrapper.classes()).toContain('is-live')
    expect(shown(wrapper)).toBe(CODE)
    expect(fresh(wrapper)).toEqual([])
    expect(wrapper.find('.tx-bui-code-stream__stream-caret').exists()).toBe(false)
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
  })

  it('with appear, code present at mount enters too', () => {
    const wrapper = mount(CodeStream, { props: { code: 'const a = 1', streaming: false, paced: false, appear: true } })
    expect(shown(wrapper)).toBe('const a = 1')
    expect(fresh(wrapper).join('')).toBe('const a = 1')
  })

  it('streams word by word, and a new line arrives with its first word and indentation', async () => {
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true } })
    await nextTick()
    // Live with nothing shown yet: one empty line holds the caret.
    expect(lines(wrapper)).toEqual([''])
    expect(wrapper.find('.tx-bui-code-stream__stream-caret').exists()).toBe(true)

    await wrapper.setProps({ code: CODE })
    const seen: string[] = []
    for (let frame = 0; frame < 40; frame++) {
      await advance(16)
      const text = shown(wrapper)
      seen.push(text)
      expect(CODE.startsWith(text)).toBe(true)
      // Never a bare line break or a line of indentation waiting for its word.
      expect(lines(wrapper).at(-1)!.trim()).not.toBe('')
    }
    expect(seen[0]).toBe('export')
    expect(seen).toContain('export async function churnBatch() {\n  const')

    await wrapper.setProps({ streaming: false })
    await advance(400)
    expect(shown(wrapper)).toBe(CODE)
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
  })

  it('spreads a burst over time instead of dumping it', async () => {
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true } })
    await wrapper.setProps({ code: CODE })
    await advance(100)
    const partial = shown(wrapper).length
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(CODE.length)
    // 13 words at 24ms stay inside the 600ms lag bound.
    await advance(400)
    expect(shown(wrapper)).toBe(CODE)
  })

  it('wraps newly shown characters inside the highlighted markup, and only those', async () => {
    highlight.mockImplementation(async source => shikiHtml(source))
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true, lang: 'ts' } })
    await wrapper.setProps({ code: CODE })
    await advance(130)
    await flushPromises()
    await advance(16)

    const entering = wrapper.findAll('.tx-bui-code-stream__fresh')
    expect(entering.length).toBeGreaterThan(0)
    // Inside the token's own colour span, so syntax colour holds from the first frame.
    expect(entering.every(node => node.element.parentElement?.getAttribute('style')?.includes('#D73A49'))).toBe(true)

    await wrapper.setProps({ streaming: false })
    await advance(600)
    await flushPromises()
    expect(shown(wrapper)).toBe(CODE)
    expect((wrapper.vm as unknown as { state: StreamState }).state).toBe('done')
    // Once done and the last entrance has played, they fold back into plain markup.
    await advance(500)
    expect(fresh(wrapper)).toEqual([])
    expect(wrapper.find('.tx-bui-code-stream__code span[style]').exists()).toBe(true)
  })

  it('highlights on a trailing timer while streaming, and at once when it ends', async () => {
    highlight.mockImplementation(async source => shikiHtml(source))
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true, lang: 'ts' } })
    await advance(200)
    highlight.mockClear()

    await wrapper.setProps({ code: 'export' })
    await advance(40)
    await wrapper.setProps({ code: 'export async' })
    await advance(40)
    await wrapper.setProps({ code: 'export async function' })
    expect(highlight).not.toHaveBeenCalled()
    await advance(60)
    expect(highlight).toHaveBeenCalledTimes(1)

    highlight.mockClear()
    await wrapper.setProps({ streaming: false })
    expect(highlight).toHaveBeenCalledTimes(1)
  })

  it('writes into one persistent line, so the caret never remounts across new lines', async () => {
    const wrapper = mount(CodeStream, { props: { code: 'first', streaming: true } })
    await advance(16)
    const tail = wrapper.findAll('.tx-bui-code-stream__line').at(-1)!.element
    const caret = wrapper.find('.tx-bui-code-stream__stream-caret').element

    await wrapper.setProps({ code: 'first\nsecond\nthird' })
    await advance(200)
    expect(lines(wrapper)).toEqual(['first', 'second', 'third'])
    const rows = wrapper.findAll('.tx-bui-code-stream__line')
    expect(rows.at(-1)!.element).toBe(tail)
    expect(wrapper.find('.tx-bui-code-stream__stream-caret').element).toBe(caret)
    // The caret sits after the code of the line being written, never on a finished one.
    const code = rows.at(-1)!.find('.tx-bui-code-stream__code').element
    expect(code.compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rows.at(-1)!.element.contains(caret)).toBe(true)
    expect(rows.slice(0, -1).some(row => row.find('.tx-bui-code-stream__stream-caret').exists())).toBe(false)
    expect(wrapper.find('.tx-bui-code-stream__caret').exists()).toBe(false)
  })

  it('retracts the caret when done, and caret: false leaves it out', async () => {
    const wrapper = mount(CodeStream, { props: { code: 'a b ', streaming: true } })
    await advance(100)
    expect(wrapper.find('.tx-bui-code-stream__stream-caret').exists()).toBe(true)
    await wrapper.setProps({ streaming: false })
    await advance(400)
    expect(wrapper.find('.tx-bui-code-stream__stream-caret').exists()).toBe(false)

    const bare = mount(CodeStream, { props: { code: 'a b ', streaming: true, caret: false } })
    await advance(100)
    expect(bare.find('.tx-bui-code-stream__stream-caret').exists()).toBe(false)
  })

  it('removes a caret switched off at once, and retracts it when the stream ends', async () => {
    // Real transitions: the stub removes a leaving caret at once either way.
    const live = () => mount(CodeStream, { props: { code: 'a b ', streaming: true }, global: { stubs: { transition: false } } })
    const off = live()
    await advance(100)
    await off.setProps({ caret: false })
    expect(off.find('.tx-bui-code-stream__stream-caret').exists()).toBe(false)
    const ended = live()
    await advance(100)
    await ended.setProps({ streaming: false })
    expect(ended.find('.tx-bui-code-stream-caret-leave-active').exists()).toBe(true)
  })

  it('hands the caret slot its state and reports every state change', async () => {
    const states: StreamState[] = []
    let done = 0
    const wrapper = mount(CodeStream, {
      props: {
        'code': '',
        'streaming': true,
        'onState-change': (state: StreamState) => states.push(state),
        'onDone': () => { done++ },
      },
      slots: { caret: ({ state }: { state: StreamState }) => h('i', { class: 'my-caret' }, state) },
    })
    await nextTick()
    expect(wrapper.find('.my-caret').text()).toBe('streaming')
    expect(wrapper.find('.tx-stream-caret').exists()).toBe(false)

    await wrapper.setProps({ code: 'let a = 1;' })
    await advance(600)
    expect(wrapper.find('.my-caret').text()).toBe('paused')
    await wrapper.setProps({ code: 'let a = 1;\nlet b = 2;' })
    await advance(16)
    expect(wrapper.find('.my-caret').text()).toBe('streaming')
    // The source ends with words still to show: they drain, then done.
    await wrapper.setProps({ streaming: false })
    await advance(400)
    expect(states).toEqual(['paused', 'streaming', 'draining', 'done'])
    expect(done).toBe(1)
  })

  it('replays complete code from the first word, and skip shows it all without entrances', async () => {
    const wrapper = mount(CodeStream, { props: { code: CODE, streaming: false } })
    const vm = wrapper.vm as unknown as { replay: () => void, skip: () => void, state: StreamState }
    vm.replay()
    await nextTick()
    expect(shown(wrapper)).toBe('')
    await advance(48)
    expect(shown(wrapper).length).toBeGreaterThan(0)
    expect(shown(wrapper).length).toBeLessThan(CODE.length)
    expect(fresh(wrapper).length).toBeGreaterThan(0)

    vm.skip()
    await nextTick()
    await nextTick()
    expect(shown(wrapper)).toBe(CODE)
    expect(fresh(wrapper)).toEqual([])
    expect(vm.state).toBe('done')
  })

  it('re-releases from the first changed word after a rewrite', async () => {
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true } })
    await wrapper.setProps({ code: 'const a = 1;\nconst b = 2;' })
    await advance(300)
    expect(shown(wrapper)).toBe('const a = 1;\nconst b = 2;')

    await wrapper.setProps({ code: 'const a = 1;\nlet b = 2;' })
    await nextTick()
    expect(shown(wrapper)).toBe('const a = 1;')
    await advance(300)
    expect(shown(wrapper)).toBe('const a = 1;\nlet b = 2;')
  })

  it('holds the full height only while complete code plays back with reserve', async () => {
    const reserved = mount(CodeStream, { props: { code: CODE, streaming: false, reserve: true } })
    ;(reserved.vm as unknown as { replay: () => void }).replay()
    await advance(16)
    const body = () => reserved.find('.tx-bui-code-stream__body').attributes('style') ?? ''
    expect(body()).toContain('--tx-bui-code-stream-lines: 4')

    const natural = mount(CodeStream, { props: { code: CODE, streaming: false } })
    ;(natural.vm as unknown as { replay: () => void }).replay()
    await advance(16)
    expect(natural.find('.tx-bui-code-stream__body').attributes('style')).toContain('--tx-bui-code-stream-lines: 1')
  })

  it('under reduced motion shows code as it arrives, without entrances', async () => {
    stubReducedMotion()
    const wrapper = mount(CodeStream, { props: { code: '', streaming: true } })
    await nextTick()
    expect(wrapper.classes()).toContain('is-reveal-none')
    await wrapper.setProps({ code: CODE })
    await nextTick()
    expect(shown(wrapper)).toBe(CODE)
    expect(fresh(wrapper)).toEqual([])
  })

  it('renders on the server as plain code, with no entering characters', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(CodeStream, { code: 'const a = "<b>";', streaming: true }),
    }))
    expect(html).toContain('const a = &quot;&lt;b&gt;&quot;;')
    expect(html).not.toContain('tx-bui-code-stream__fresh')
  })

  it('is also exported as TxStreamCode, the same component', () => {
    expect(TxStreamCode).toBe(TxCodeStream)
  })
})
