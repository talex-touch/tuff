import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxGridLayout from '../src/TxGridLayout.vue'

function mountGrid(props: Record<string, unknown> = {}) {
  return mount(TxGridLayout, {
    props,
    slots: {
      default: '<div class="tx-grid-layout__item">Card</div>',
    },
  })
}

describe('txGridLayout', () => {
  function dispatchMouseMove(target: Element, pageX: number, pageY: number) {
    const event = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(event, 'pageX', { value: pageX })
    Object.defineProperty(event, 'pageY', { value: pageY })
    target.dispatchEvent(event)
  }

  it('renders default grid variables and slot content', () => {
    const wrapper = mountGrid()
    const grid = wrapper.find('.tx-grid-layout')
    const style = grid.attributes('style')

    expect(grid.text()).toContain('Card')
    expect(style).toContain('--tx-grid-gap: 1.5rem')
    expect(style).toContain('--tx-grid-min-width: 300px')
    expect(style).toContain('--tx-grid-max-columns: 4')
  })

  it('updates grid variables when props change', async () => {
    const wrapper = mountGrid({
      gap: '12px',
      minItemWidth: '220px',
      maxColumns: 3,
    })

    await wrapper.setProps({
      gap: '20px',
      minItemWidth: '260px',
      maxColumns: 5,
    })

    const style = wrapper.find('.tx-grid-layout').attributes('style')
    expect(style).toContain('--tx-grid-gap: 20px')
    expect(style).toContain('--tx-grid-min-width: 260px')
    expect(style).toContain('--tx-grid-max-columns: 5')
  })

  it('updates spotlight variables only when interactive', async () => {
    const wrapper = mountGrid()
    const item = wrapper.find('.tx-grid-layout__item')

    Object.defineProperty(item.element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 10, top: 20, right: 110, bottom: 120, width: 100, height: 100 }),
    })

    dispatchMouseMove(wrapper.find('.tx-grid-layout').element, 40, 65)
    await wrapper.vm.$nextTick()

    expect((item.element as HTMLElement).style.getPropertyValue('--tx-grid-op')).toBe('0.2')
    expect((item.element as HTMLElement).style.getPropertyValue('--tx-grid-x')).toBe('30px')
    expect((item.element as HTMLElement).style.getPropertyValue('--tx-grid-y')).toBe('45px')

    await wrapper.find('.tx-grid-layout').trigger('mouseleave')
    expect((item.element as HTMLElement).style.getPropertyValue('--tx-grid-op')).toBe('0')

    await wrapper.setProps({ interactive: false })
    ;(item.element as HTMLElement).style.removeProperty('--tx-grid-op')

    dispatchMouseMove(wrapper.find('.tx-grid-layout').element, 80, 90)
    await wrapper.vm.$nextTick()

    expect((item.element as HTMLElement).style.getPropertyValue('--tx-grid-op')).toBe('')
  })
})
