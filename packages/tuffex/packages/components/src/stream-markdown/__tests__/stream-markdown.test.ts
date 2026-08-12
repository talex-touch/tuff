import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxStreamMarkdown from '../src/TxStreamMarkdown.vue'

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
  },
}))

// Keeps the built-in TxCodeBlock fallback deterministic and offline.
vi.mock('../src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

async function flushSanitizer() {
  await flushPromises()
  await nextTick()
}

const FakeFence = defineComponent({
  name: 'FakeFence',
  props: {
    lang: { type: String, default: '' },
    code: { type: String, default: '' },
    closed: { type: Boolean, default: false },
    streaming: { type: Boolean, default: false },
    theme: { type: String, default: 'light' },
  },
  setup(props) {
    return () =>
      h('div', {
        'class': 'fake-fence',
        'data-lang': props.lang,
        'data-closed': String(props.closed),
        'data-theme': props.theme,
      }, props.code)
  },
})

describe('txStreamMarkdown', () => {
  it('renders nothing before the sanitizer resolves', () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '# Title' },
    })

    expect(wrapper.find('.markdown-body').text()).toBe('')
  })

  it('renders sanitized markup blocks once the sanitizer is ready', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '# Title\n\n<script>alert(1)</script>ok' },
    })

    await flushSanitizer()

    const body = wrapper.find('.markdown-body')
    expect(body.find('h1').text()).toBe('Title')
    expect(body.html()).not.toContain('<script>')
  })

  it('renders unsanitized content only when sanitize is disabled', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '**bold**', sanitize: false },
    })

    await nextTick()
    expect(wrapper.find('strong').text()).toBe('bold')
  })

  it('re-renders when sanitize flips off on settled content', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '<script>alert(1)</script>ok', sanitize: true },
    })
    await flushSanitizer()

    // The mocked sanitizer strips <script>, so its presence is the discriminator
    // between HTML produced under sanitize=true and sanitize=false.
    expect(wrapper.find('.markdown-body').html()).not.toContain('<script>')

    await wrapper.setProps({ sanitize: false })
    await flushSanitizer()

    // Content and canRender are both unchanged by the flip, so sanitize itself
    // has to drive the re-render or the stale sanitized HTML stays on screen.
    expect(wrapper.find('.markdown-body').html()).toContain('<script>')
  })

  it('keeps settled block DOM nodes across streaming updates', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'First paragraph\n\nTail', streaming: true },
    })

    await flushSanitizer()

    const before = wrapper.findAll('.tx-stream-md__markup')
    expect(before).toHaveLength(2)
    const settledNode = before[0]!.element
    const tailNode = before[1]!.element

    await wrapper.setProps({ content: 'First paragraph\n\nTail grows longer' })

    const after = wrapper.findAll('.tx-stream-md__markup')
    expect(after[0]!.element).toBe(settledNode)
    // The tail keeps its element too — it patches in place.
    expect(after[1]!.element).toBe(tailNode)
    expect(after[1]!.text()).toContain('Tail grows longer')
  })

  it('marks a paragraph tail for the inline cursor while streaming', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'Streaming paragraph', streaming: true },
    })

    await flushSanitizer()

    expect(wrapper.classes()).toContain('is-streaming')
    expect(wrapper.find('.tx-stream-md__markup--tail').exists()).toBe(true)
    expect(wrapper.find('.tx-stream-md__cursor').exists()).toBe(false)
  })

  it('falls back to the block cursor when the tail is a fence', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'Intro\n\n```js\nconst a = 1', streaming: true },
    })

    await flushSanitizer()

    expect(wrapper.find('.tx-stream-md__markup--tail').exists()).toBe(false)
    expect(wrapper.find('.tx-stream-md__cursor').exists()).toBe(true)
  })

  it('shows no cursor when the stream has settled', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'Done paragraph', streaming: false },
    })

    await flushSanitizer()

    expect(wrapper.classes()).not.toContain('is-streaming')
    expect(wrapper.find('.tx-stream-md__markup--tail').exists()).toBe(false)
    expect(wrapper.find('.tx-stream-md__cursor').exists()).toBe(false)
  })

  it('dispatches fenced blocks to a registered renderer with closure state', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: {
        content: '```js\nconst a = 1',
        streaming: true,
        renderers: { js: FakeFence },
      },
    })

    await flushSanitizer()

    const fence = wrapper.find('.fake-fence')
    expect(fence.exists()).toBe(true)
    expect(fence.attributes('data-lang')).toBe('js')
    // Still-growing tail fence of a live stream stays provisional.
    expect(fence.attributes('data-closed')).toBe('false')

    await wrapper.setProps({ content: '```js\nconst a = 1\n```\n\nAfter' })
    expect(wrapper.find('.fake-fence').attributes('data-closed')).toBe('true')
  })

  it('renders unregistered fences through TxCodeBlock with escaped code', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '```html\n<b>raw</b>\n```' },
    })

    await flushSanitizer()

    const codeBlock = wrapper.findComponent({ name: 'TxCodeBlock' })
    expect(codeBlock.exists()).toBe(true)
    expect(codeBlock.props('code')).toContain('<b>raw</b>')

    const pre = wrapper.find('pre.tx-code-block__plain')
    expect(pre.text()).toContain('<b>raw</b>')
    expect(pre.find('b').exists()).toBe(false)
  })

  it('keeps every settled block node across a 5000+ character streamed document', async () => {
    // PRD acceptance: 10+ blocks, 5000+ chars, settled DOM nodes keep identity.
    const sections = Array.from({ length: 12 }, (_, index) =>
      `## Section ${index}\n\n${`Paragraph ${index} `.repeat(40)}`)
    const full = sections.join('\n\n')
    expect(full.length).toBeGreaterThan(5000)

    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '', streaming: true },
    })
    await flushSanitizer()

    const seen = new Map<number, Element>()
    // Stream in ~400-char slices, checking settled identity at every step.
    for (let cut = 400; cut <= full.length + 400; cut += 400) {
      await wrapper.setProps({ content: full.slice(0, cut) })
      const nodes = wrapper.findAll('.tx-stream-md__block')
      // All blocks except the still-growing tail must keep their exact node.
      for (let i = 0; i < nodes.length - 1; i++) {
        const previous = seen.get(i)
        if (previous)
          expect(nodes[i]!.element).toBe(previous)
        seen.set(i, nodes[i]!.element)
      }
    }

    expect(wrapper.findAll('.tx-stream-md__block').length).toBeGreaterThanOrEqual(24)
  })

  it('suppresses bare empty fences but keeps labelled or filled ones', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'Intro\n\n```\n```\n\n```js\nconst a = 1\n```' },
    })

    await flushSanitizer()

    // The empty bare fence renders nothing; the js fence still shows.
    const fences = wrapper.findAll('.tx-stream-md__fence')
    expect(fences).toHaveLength(1)
    expect(fences[0]!.text()).toContain('const a = 1')
  })

  it('marks the last rendered block for the streaming reveal mask', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'First\n\nSecond grows', streaming: true },
    })

    await flushSanitizer()

    const marked = wrapper.findAll('.tx-stream-md__block--last')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.text()).toContain('Second grows')
  })

  it('dispatches mermaid fences to the built-in TxMermaidBlock', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: '```mermaid\ngraph TD', streaming: true },
    })

    await flushSanitizer()

    const mermaidBlock = wrapper.findComponent({ name: 'TxMermaidBlock' })
    expect(mermaidBlock.exists()).toBe(true)
    // Open fence: the skeleton is up and mermaid itself was never imported.
    expect(mermaidBlock.find('.tx-mermaid-block__skeleton').exists()).toBe(true)
  })

  it('tracks auto theme when dark mode is toggled on <body>', async () => {
    const wrapper = mount(TxStreamMarkdown, {
      props: { content: 'hello', theme: 'auto' },
    })
    await flushSanitizer()

    expect(wrapper.attributes('data-theme')).toBe('light')

    // detect() reads <body> too, so the observer has to watch it as well.
    document.body.classList.add('dark')
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(wrapper.attributes('data-theme')).toBe('dark')

    document.body.classList.remove('dark')
  })
})
