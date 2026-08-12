import type { AiElementMessage, AiMessagePart } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAiConversation from '../src/TxAiConversation.vue'
import TxAiMessage from '../src/TxAiMessage.vue'

function partsMessage(parts: AiMessagePart[], status?: AiElementMessage['status']): AiElementMessage {
  return { id: 'm1', role: 'assistant', content: '', parts, status }
}

describe('txAiMessage parts rendering', () => {
  it('renders each part type in order', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: partsMessage([
          { type: 'reasoning', text: 'thinking', done: true, durationMs: 1200 },
          { type: 'tool-call', id: 't1', name: 'search-files', status: 'done', output: 'ok' },
          { type: 'text', text: 'Here is the answer' },
          { type: 'attachment', attachments: [{ kind: 'image', id: 'a1', url: 'blob:x' }] },
        ]),
      },
    })

    const parts = wrapper.findAll('.tx-ai-message__part')
    expect(parts).toHaveLength(4)
    expect(parts[0]!.classes()).toContain('tx-ai-message__part--reasoning')
    expect(parts[1]!.classes()).toContain('tx-ai-message__part--tool')
    expect(parts[1]!.attributes('data-status')).toBe('done')
    expect(parts[1]!.text()).toContain('search-files')
    expect(parts[2]!.classes()).toContain('tx-ai-message__part--text')
    expect(parts[2]!.text()).toContain('Here is the answer')
    expect(parts[3]!.classes()).toContain('tx-ai-message__part--attachments')
  })

  it('does not show the typing indicator when parts already exist', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: partsMessage([{ type: 'text', text: 'streaming already' }], 'streaming'),
      },
    })

    expect(wrapper.find('.tx-ai-message__typing').exists()).toBe(false)
    expect(wrapper.text()).toContain('streaming already')
  })

  it('marks only the last text part as streaming for injected renderers', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: partsMessage(
          [
            { type: 'text', text: 'settled intro' },
            { type: 'tool-call', id: 't1', name: 'lookup', status: 'done' },
            { type: 'text', text: 'live tail' },
          ],
          'streaming',
        ),
      },
      slots: {
        'markdown-renderer': `
          <template #markdown-renderer="{ part, streaming }">
            <span class="probe" :data-streaming="String(streaming)">{{ part.text }}</span>
          </template>
        `,
      },
    })

    const probes = wrapper.findAll('.probe')
    expect(probes).toHaveLength(2)
    expect(probes[0]!.attributes('data-streaming')).toBe('false')
    expect(probes[1]!.attributes('data-streaming')).toBe('true')
  })

  it('passes the tool part through the tool-result slot', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: partsMessage([
          { type: 'tool-call', id: 't9', name: 'render-widget', status: 'done' },
        ]),
      },
      slots: {
        'tool-result': `
          <template #tool-result="{ part }">
            <div class="widget-surface">{{ part.id }}</div>
          </template>
        `,
      },
    })

    expect(wrapper.find('.widget-surface').text()).toBe('t9')
  })

  it('dispatches a sources part to TxSources and re-emits open', async () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: partsMessage([
          { type: 'text', text: 'answer' },
          { type: 'sources', sources: [{ id: 'src1', url: 'https://example.com', title: 'Ref' }] },
        ]),
      },
    })

    const sourcesPart = wrapper.find('.tx-ai-message__part--sources')
    expect(sourcesPart.exists()).toBe(true)

    await sourcesPart.find('.tx-sources__header').trigger('click')
    await sourcesPart.find('.tx-sources__link').trigger('click')
    expect(wrapper.emitted('open-source')).toHaveLength(1)
  })

  it('keeps the legacy content path when parts are absent', () => {
    const wrapper = mount(TxAiMessage, {
      props: {
        markdown: false,
        message: { id: 'm1', role: 'assistant', content: 'plain body' },
      },
    })

    expect(wrapper.find('.tx-ai-message__parts').exists()).toBe(false)
    expect(wrapper.find('.tx-ai-message__response').text()).toContain('plain body')
  })
})

describe('txAiConversation parts compatibility', () => {
  it('keeps parts-only messages with an empty content summary', () => {
    const wrapper = mount(TxAiConversation, {
      props: {
        markdown: false,
        messages: [partsMessage([{ type: 'text', text: 'from parts' }], 'complete')],
      },
    })

    expect(wrapper.find('.tx-ai-conversation__empty').exists()).toBe(false)
    expect(wrapper.text()).toContain('from parts')
  })

  it('forwards markdown-renderer and tool-result slots down to messages', () => {
    const wrapper = mount(TxAiConversation, {
      props: {
        markdown: false,
        messages: [
          partsMessage([
            { type: 'text', text: 'body' },
            { type: 'tool-call', id: 't2', name: 'fetch', status: 'done' },
          ]),
        ],
      },
      slots: {
        'markdown-renderer': `
          <template #markdown-renderer="{ part }">
            <em class="md-probe">{{ part.text }}</em>
          </template>
        `,
        'tool-result': `
          <template #tool-result="{ part }">
            <div class="tool-probe">{{ part.name }}</div>
          </template>
        `,
      },
    })

    expect(wrapper.find('.md-probe').text()).toBe('body')
    expect(wrapper.find('.tool-probe').text()).toBe('fetch')
  })
})
