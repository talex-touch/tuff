import type { ContextChunk } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxContextCards from '../src/TxContextCards.vue'
import TxContextChunk from '../src/TxContextChunk.vue'

const chunks: ContextChunk[] = [
  {
    id: 'c1',
    title: 'Vendor onboarding rule',
    chars: '290 characters',
    body: 'Cold-chain certification must be verified before a new dairy is added.',
    source: { name: 'Dairy Onboarding SOP.pdf', badge: 'PDF', tone: 'red', href: 'https://example.com/sop.pdf' },
  },
  {
    id: 'c2',
    title: 'Seasonal demand row',
    chars: '1,250 characters',
    body: 'Q4 velocity table: pistachio +18%, vanilla +6%.',
    source: { name: 'Sales Velocity Export.csv', badge: 'CSV', tone: 'green' },
  },
]

describe('txContextCards', () => {
  it('renders the header with a corpus total that is independent of the rendered chunks', () => {
    const wrapper = mount(TxContextCards, { props: { chunks, total: 32 } })

    expect(wrapper.find('.tx-bui-context-cards__title').text()).toBe('All chunks')
    // 32 is the size of the corpus; only two chunks are on screen.
    expect(wrapper.find('.tx-bui-context-cards__total').text()).toBe('32')
    expect(wrapper.findAllComponents(TxContextChunk)).toHaveLength(2)
  })

  it('drops the total capsule when no total is supplied', () => {
    const wrapper = mount(TxContextCards, { props: { chunks } })
    expect(wrapper.find('.tx-bui-context-cards__total').exists()).toBe(false)
  })

  it('staggers the initial batch and re-emits open from a chunk', async () => {
    const wrapper = mount(TxContextCards, { props: { chunks } })
    const cards = wrapper.findAll('.tx-bui-context-chunk')

    expect(cards[0]!.attributes('style')).toContain('--tx-bui-context-chunk-enter-delay: 0ms')
    expect(cards[1]!.attributes('style')).toContain('--tx-bui-context-chunk-enter-delay: 100ms')

    await wrapper.find('.tx-bui-context-chunk__source').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('open')![0]![0]).toMatchObject({ chunk: { id: 'c1' } })
  })

  it('does not stagger chunks that stream in after mount', async () => {
    const wrapper = mount(TxContextCards, { props: { chunks: [chunks[0]!] } })
    await wrapper.setProps({ chunks })

    const cards = wrapper.findAll('.tx-bui-context-chunk')
    expect(cards).toHaveLength(2)
    // A late arrival would otherwise inherit index 1's 100ms delay and sit blank.
    expect(cards[1]!.attributes('style')).toContain('--tx-bui-context-chunk-enter-delay: 0ms')
  })
})

describe('txContextChunk', () => {
  it('renders standalone with its title, char count, body and badged source', () => {
    const wrapper = mount(TxContextChunk, { props: { chunk: chunks[0]! } })

    expect(wrapper.find('.tx-bui-context-chunk__title').text()).toBe('Vendor onboarding rule')
    expect(wrapper.find('.tx-bui-context-chunk__chars').text()).toBe('290 characters')
    expect(wrapper.find('.tx-bui-context-chunk__body').text()).toContain('Cold-chain certification')
    expect(wrapper.find('.tx-bui-icon-chip').text()).toBe('PDF')
    expect(wrapper.find('.tx-bui-icon-chip').classes()).toContain('is-red')
  })

  it('emits open instead of navigating, and keeps the href for the host', async () => {
    const wrapper = mount(TxContextChunk, { props: { chunk: chunks[0]! } })
    const source = wrapper.find('.tx-bui-context-chunk__source')

    expect(source.element.tagName).toBe('A')
    expect(source.attributes('href')).toBe('https://example.com/sop.pdf')

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    source.element.dispatchEvent(event)

    expect(prevented).toHaveBeenCalled()
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('renders a non-interactive span when the source carries no href', () => {
    const wrapper = mount(TxContextChunk, { props: { chunk: chunks[1]! } })
    const source = wrapper.find('.tx-bui-context-chunk__source')

    expect(source.element.tagName).toBe('SPAN')
    expect(source.classes()).not.toContain('is-interactive')
    expect(wrapper.find('.tx-bui-context-chunk__external').exists()).toBe(false)
  })

  it('settles the source chip after the delay and skips the wait when appear is off', async () => {
    vi.useFakeTimers()
    try {
      const animated = mount(TxContextChunk, { props: { chunk: chunks[0]!, chipDelay: 700 } })
      expect(animated.find('.tx-bui-context-chunk__source').classes()).not.toContain('is-settled')

      vi.advanceTimersByTime(700)
      await animated.vm.$nextTick()
      expect(animated.find('.tx-bui-context-chunk__source').classes()).toContain('is-settled')

      const settled = mount(TxContextChunk, { props: { chunk: chunks[0]!, appear: false } })
      expect(settled.find('.tx-bui-context-chunk__source').classes()).toContain('is-settled')
      expect(settled.find('.tx-bui-context-chunk').classes()).not.toContain('is-appearing')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('accepts slot overrides for title, body and source', () => {
    const wrapper = mount(TxContextChunk, {
      props: { chunk: chunks[0]! },
      slots: {
        title: '<em data-test="t">custom</em>',
        body: '<span data-test="b">custom body</span>',
        source: '<span data-test="s">custom source</span>',
      },
    })

    expect(wrapper.find('[data-test="t"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="b"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="s"]').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-context-chunk__source').exists()).toBe(false)
  })
})
