import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TxCol from '../src/TxCol.vue'
import TxContainer from '../src/TxContainer.vue'
import TxRow from '../src/TxRow.vue'

const originalInnerWidth = window.innerWidth

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  setViewportWidth(originalInnerWidth)
})

describe('container layout primitives', () => {
  it('maps container spacing and width props to CSS variables', () => {
    const wrapper = mount(TxContainer, {
      props: {
        maxWidth: '960px',
        padding: 'large',
      },
      slots: {
        default: '<span>Content</span>',
      },
    })
    const container = wrapper.find('.tx-container')
    const style = container.attributes('style')

    expect(container.text()).toContain('Content')
    expect(style).toContain('--tx-container-padding: 24px')
    expect(style).toContain('--tx-container-max-width: 960px')
    expect(style).toContain('margin: 0px auto')
  })

  it('clamps numeric container padding and supports custom margin', () => {
    const wrapper = mount(TxContainer, {
      props: {
        padding: -4,
        margin: 20,
        fluid: true,
        responsive: true,
      },
    })
    const container = wrapper.find('.tx-container')
    const style = container.attributes('style')

    expect(container.classes()).toContain('is-fluid')
    expect(container.classes()).toContain('is-responsive')
    expect(style).toContain('--tx-container-padding: 0px')
    expect(style).toContain('--tx-container-max-width: none')
    expect(style).toContain('margin: 0px 20px')
  })

  it('maps row gutter, alignment, justification, and wrapping styles', () => {
    const wrapper = mount(TxRow, {
      props: {
        gutter: 18,
        align: 'middle',
        justify: 'space-evenly',
        wrap: false,
      },
      slots: {
        default: '<span>Cell</span>',
      },
    })
    const style = wrapper.find('.tx-row').attributes('style')

    expect(wrapper.text()).toContain('Cell')
    expect(style).toContain('--tx-row-gutter: 18px')
    expect(style).toContain('align-items: center')
    expect(style).toContain('justify-content: space-evenly')
    expect(style).toContain('flex-wrap: nowrap')
  })

  it('resolves responsive row gutter from the active breakpoint', async () => {
    setViewportWidth(700)
    const wrapper = mount(TxRow, {
      props: {
        gutter: { xs: 4, sm: 8, md: 12 },
      },
    })

    expect(wrapper.find('.tx-row').attributes('style')).toContain('--tx-row-gutter: 8px')

    setViewportWidth(800)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tx-row').attributes('style')).toContain('--tx-row-gutter: 12px')
  })

  it('maps col span, offset, gutter padding, and responsive span', async () => {
    setViewportWidth(700)
    const wrapper = mount(TxCol, {
      props: {
        span: 24,
        offset: 6,
        sm: 12,
      },
    })
    const col = wrapper.find('.tx-col')

    expect(col.attributes('style')).toContain('flex: 0 0 50%')
    expect(col.attributes('style')).toContain('max-width: 50%')
    expect(col.attributes('style')).toContain('margin-left: 25%')
    expect(col.attributes('style')).toContain('padding-left: calc(var(--tx-row-gutter, 0px) / 2)')

    setViewportWidth(1300)
    await wrapper.vm.$nextTick()

    expect(col.attributes('style')).toContain('flex: 0 0 100%')
  })
})
