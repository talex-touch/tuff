import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxIconChip from '../src/TxIconChip.vue'

describe('txIconChip', () => {
  it('renders the label with the default neutral solid square', () => {
    const wrapper = mount(TxIconChip, { props: { label: 'PDF' } })
    const chip = wrapper.find('.tx-bui-icon-chip')

    expect(chip.text()).toBe('PDF')
    expect(chip.classes()).toContain('is-neutral')
    expect(chip.classes()).toContain('is-solid')
    expect(chip.classes()).not.toContain('is-circle')
  })

  it('derives radius and font size from size along the upstream ladder', () => {
    const cases: Array<[number, string, string]> = [
      [14, '4px', '7px'],
      [18, '5px', '7px'],
      [32, '8px', '13px'],
    ]

    for (const [size, radius, fontSize] of cases) {
      const style = mount(TxIconChip, { props: { size } }).find('.tx-bui-icon-chip').attributes('style')
      expect(style).toContain(`--tx-bui-icon-chip-size: ${size}px`)
      expect(style).toContain(`--tx-bui-icon-chip-radius: ${radius}`)
      expect(style).toContain(`--tx-bui-icon-chip-font-size: ${fontSize}`)
    }
  })

  it('lets explicit radius and font size win, and pills the circle shape', () => {
    const explicit = mount(TxIconChip, { props: { size: 20, radius: 2, fontSize: 11 } })
    expect(explicit.find('.tx-bui-icon-chip').attributes('style')).toContain('--tx-bui-icon-chip-radius: 2px')
    expect(explicit.find('.tx-bui-icon-chip').attributes('style')).toContain('--tx-bui-icon-chip-font-size: 11px')

    // A circle ignores radius entirely rather than fighting it.
    const circle = mount(TxIconChip, { props: { size: 20, radius: 2, shape: 'circle' } })
    expect(circle.find('.tx-bui-icon-chip').classes()).toContain('is-circle')
    expect(circle.find('.tx-bui-icon-chip').attributes('style')).toContain('--tx-bui-icon-chip-radius: 999px')
  })

  it('is hidden from assistive tech unless it is named', () => {
    const silent = mount(TxIconChip, { props: { label: 'CSV' } })
    expect(silent.find('.tx-bui-icon-chip').attributes('aria-hidden')).toBe('true')
    expect(silent.find('.tx-bui-icon-chip').attributes('role')).toBeUndefined()

    const named = mount(TxIconChip, { props: { label: 'CSV', ariaLabel: 'CSV file' } })
    expect(named.find('.tx-bui-icon-chip').attributes('role')).toBe('img')
    expect(named.find('.tx-bui-icon-chip').attributes('aria-label')).toBe('CSV file')
    expect(named.find('.tx-bui-icon-chip').attributes('aria-hidden')).toBeUndefined()
  })

  it('applies tone and variant modifiers and prefers slot content over label', () => {
    const wrapper = mount(TxIconChip, {
      props: { tone: 'accent', variant: 'soft', label: 'ignored' },
      slots: { default: '<svg data-test="glyph" />' },
    })
    const chip = wrapper.find('.tx-bui-icon-chip')

    expect(chip.classes()).toContain('is-accent')
    expect(chip.classes()).toContain('is-soft')
    expect(chip.find('[data-test="glyph"]').exists()).toBe(true)
    expect(chip.text()).not.toContain('ignored')
  })
})
