import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxGrid, TxGridItem } from '../index'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('txGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders fixed columns, rows, gaps, alignment, and slot content', () => {
    const wrapper = mount(TxGrid, {
      props: {
        cols: 3,
        rows: 2,
        gap: { row: 12, col: '1rem' },
        justify: 'center',
        align: 'end',
      },
      slots: {
        default: '<span class="grid-content">Item</span>',
      },
    })

    const style = wrapper.find('.tx-grid').attributes('style')
    expect(style).toContain('display: grid;')
    expect(style).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(style).toContain('grid-template-rows: repeat(2, minmax(0, 1fr));')
    expect(style).toContain('row-gap: 12px;')
    expect(style).toContain('column-gap: 1rem;')
    expect(style).toContain('justify-items: center;')
    expect(style).toContain('align-items: end;')
    expect(wrapper.find('.grid-content').text()).toBe('Item')
  })

  it('uses min item width before explicit columns', () => {
    const wrapper = mount(TxGrid, {
      props: {
        cols: 4,
        minItemWidth: '180px',
      },
    })

    expect(wrapper.find('.tx-grid').attributes('style')).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));',
    )
  })

  it('resolves responsive columns and gaps from window width', async () => {
    setWindowWidth(700)
    const wrapper = mount(TxGrid, {
      props: {
        cols: { xs: 1, sm: 2, md: 3, lg: 4 },
        gap: { xs: 8, sm: 12, md: 16, lg: 20 },
      },
    })

    expect(wrapper.find('.tx-grid').attributes('style')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(wrapper.find('.tx-grid').attributes('style')).toContain('row-gap: 12px;')

    setWindowWidth(1100)
    await nextTick()

    expect(wrapper.find('.tx-grid').attributes('style')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));')
    expect(wrapper.find('.tx-grid').attributes('style')).toContain('row-gap: 20px;')
  })

  it('removes the resize listener on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(TxGrid)

    wrapper.unmount()

    expect(add).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true })
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('renders grid item spans with clamped minimums and self alignment', () => {
    const wrapper = mount(TxGridItem, {
      props: {
        colSpan: 0,
        rowSpan: -2,
        justifySelf: 'start',
        alignSelf: 'center',
      },
      slots: {
        default: 'Cell',
      },
    })

    const style = wrapper.find('.tx-grid-item').attributes('style')
    expect(style).toContain('grid-column: span 1 / span 1;')
    expect(style).toContain('grid-row: span 1 / span 1;')
    expect(style).toContain('justify-self: start;')
    expect(style).toContain('align-self: center;')
    expect(wrapper.text()).toBe('Cell')
  })

  it('registers grid components through install', () => {
    const app = { component: vi.fn() }

    TxGrid.install?.(app as any)
    TxGridItem.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxGrid', TxGrid)
    expect(app.component).toHaveBeenCalledWith('TxGridItem', TxGridItem)
  })
})
