import type { AiToolCallPart } from '../../ai-elements/src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxToolCallCard from '../src/TxToolCallCard.vue'

enableAutoUnmount(afterEach)

function toolCall(overrides: Partial<AiToolCallPart> = {}): AiToolCallPart {
  return {
    type: 'tool-call',
    id: 't1',
    name: 'search-files',
    status: 'pending',
    ...overrides,
  }
}

describe('txToolCallCard', () => {
  it('walks the four states with matching labels', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall() },
    })

    expect(wrapper.attributes('data-status')).toBe('pending')
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Queued')

    await wrapper.setProps({ toolCall: toolCall({ status: 'running', logs: 'scanning…' }) })
    expect(wrapper.attributes('data-status')).toBe('running')
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Running')
    expect(wrapper.find('.tx-tool-call-card__logs').text()).toContain('scanning…')

    await wrapper.setProps({ toolCall: toolCall({ status: 'done', output: '3 files' }) })
    expect(wrapper.find('.tx-tool-call-card__status').text()).toBe('Done')
    expect(wrapper.find('.tx-tool-call-card__result').text()).toContain('3 files')
    expect(wrapper.find('.tx-tool-call-card__logs').exists()).toBe(false)

    await wrapper.setProps({ toolCall: toolCall({ status: 'error', error: 'timed out' }) })
    expect(wrapper.find('[role="alert"]').text()).toContain('timed out')
  })

  it('toggles expansion through an accessible header', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', input: '{ "q": "x" }' }) },
    })

    const header = wrapper.find('.tx-tool-call-card__header')
    const collapse = wrapper.find('.tx-tool-call-card__collapse')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect(header.attributes('aria-controls')).toBe(collapse.attributes('id'))
    expect(collapse.classes()).not.toContain('is-open')
    // Closed, the 0fr grid still holds the retry button and scrollable logs —
    // inert keeps them out of the tab order.
    expect(collapse.attributes('inert')).toBe('true')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(collapse.classes()).toContain('is-open')
    expect(collapse.attributes('inert')).toBeUndefined()
    expect(wrapper.emitted('toggle')).toEqual([[true]])
  })
  it('respects userOpen controlled prop', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ input: '{ "q": "x" }' }), userOpen: true },
    })
    expect(wrapper.find('.tx-tool-call-card__header').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')

    await wrapper.setProps({ userOpen: false })
    expect(wrapper.find('.tx-tool-call-card__header').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
  })
  it('keeps ultra-short in-flight calls compact without flashing open or showing peek', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxToolCallCard, {
        props: { toolCall: toolCall({ status: 'pending' }) },
      })
      // Still within the default 500ms quiet window: stays collapsed.
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')

      await vi.advanceTimersByTimeAsync(100)
      await wrapper.setProps({ toolCall: toolCall({ status: 'running', logs: 'fast stdout' }) })
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
      expect(wrapper.find('.tx-tool-call-card__peek').exists()).toBe(false)

      // Settles at 220ms (< 500ms): never expands or bounces.
      await vi.advanceTimersByTimeAsync(120)
      await wrapper.setProps({
        toolCall: toolCall({ status: 'done', output: 'ok', durationMs: 120 }),
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
      expect(wrapper.find('.tx-tool-call-card__peek').exists()).toBe(false)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('auto-expands long-running calls after autoExpandDelayMs, holds briefly before folding, and opens immediately on error', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxToolCallCard, {
        props: { toolCall: toolCall({ status: 'pending' }) },
      })
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')

      // pending -> running continues the same quiet window without resetting it.
      await vi.advanceTimersByTimeAsync(200)
      await wrapper.setProps({ toolCall: toolCall({ status: 'running', logs: 'working...' }) })
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')

      // Reaching 500ms total in-flight auto-expands cleanly.
      await vi.advanceTimersByTimeAsync(300)
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')

      // Finishing right after opening (50ms later) holds briefly so the open transition finishes cleanly.
      await vi.advanceTimersByTimeAsync(50)
      await wrapper.setProps({ toolCall: toolCall({ status: 'done', output: 'result', durationMs: 550 }) })
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')

      await vi.advanceTimersByTimeAsync(360)
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
      expect(wrapper.find('.tx-tool-call-card__peek').exists()).toBe(false)

      // Errors always open immediately with zero delay.
      await wrapper.setProps({ toolCall: toolCall({ status: 'error', error: 'failed' }) })
      expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('supports autoExpandDelayMs=0 for immediate open/close and shows peek only when user collapses a running call', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'running', logs: 'line 1\nline 2\nline 3' }), autoExpandDelayMs: 0 },
    })
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')

    // User manually collapses while running -> peek shows last two lines.
    await wrapper.find('.tx-tool-call-card__header').trigger('click')
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
    expect(wrapper.find('.tx-tool-call-card__peek').text()).toBe('line 2\nline 3')

    // Settles to done -> peek disappears.
    await wrapper.setProps({ toolCall: toolCall({ status: 'done', output: 'done' }) })
    expect(wrapper.find('.tx-tool-call-card__peek').exists()).toBe(false)
  })

  it('allows user manual click to override autoOpen state', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', output: 'done-output' }) },
    })
    // Initially closed because status is done, and does not leak output peek
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
    expect(wrapper.find('.tx-tool-call-card__peek').exists()).toBe(false)
    // Click header to open
    await wrapper.find('.tx-tool-call-card__header').trigger('click')
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).toContain('is-open')
    expect(wrapper.emitted('toggle')).toEqual([[true]])

    // Click again to close
    await wrapper.find('.tx-tool-call-card__header').trigger('click')
    expect(wrapper.find('.tx-tool-call-card__collapse').classes()).not.toContain('is-open')
    expect(wrapper.emitted('toggle')).toEqual([[true], [false]])
  })

  it('renders empty result placeholder when done with no output or input', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done' }), emptyResultLabel: '空输出' },
    })
    await wrapper.find('.tx-tool-call-card__header').trigger('click')
    expect(wrapper.find('.tx-tool-call-card__empty-result').text()).toBe('空输出')
  })


  it('hides retry button by default when onRetry is not attached', () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'error', error: 'boom' }) },
    })
    expect(wrapper.find('.tx-tool-call-card__retry').exists()).toBe(false)
  })

  it('emits retry with the tool id from the error state when showRetry or @retry is present', async () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ id: 't42', status: 'error', error: 'boom' }), showRetry: true },
    })

    await wrapper.find('.tx-tool-call-card__retry').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['t42']])
  })

  it('prefers the result slot over the output fallback', () => {
    const withSlot = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', output: 'fallback text' }) },
      slots: {
        result: `
          <template #result="{ toolCall }">
            <div class="widget-mount">{{ toolCall.id }}</div>
          </template>
        `,
      },
    })

    expect(withSlot.find('.widget-mount').text()).toBe('t1')
    expect(withSlot.find('.tx-tool-call-card__result').text()).not.toContain('fallback text')

    const withoutSlot = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ status: 'done', output: 'fallback text' }) },
    })
    expect(withoutSlot.find('.tx-tool-call-card__result').text()).toContain('fallback text')
  })

  it('shows the collapsed summary line', () => {
    const wrapper = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ summary: 'query "config" under src/' }) },
    })

    expect(wrapper.find('.tx-tool-call-card__summary').text()).toContain('query "config" under src/')
  })

  it('names a plain input in the header but never previews structured input', () => {
    const plain = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ input: 'sleep 10\nsecond line' }) },
    })
    expect(plain.find('.tx-tool-call-card__summary').text()).toBe('sleep 10')

    // Pretty-printed JSON cut to its first line is only `{`: no information, so no header text.
    const structured = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ input: '{\n  "command": "sleep 10"\n}' }) },
    })
    expect(structured.find('.tx-tool-call-card__summary').text()).toBe('')

    // A summary the host wrote always wins, whatever the input looks like.
    const summarised = mount(TxToolCallCard, {
      props: { toolCall: toolCall({ summary: 'sleep 10', input: '{\n  "command": "sleep 10"\n}' }) },
    })
    expect(summarised.find('.tx-tool-call-card__summary').text()).toBe('sleep 10')
  })
})
