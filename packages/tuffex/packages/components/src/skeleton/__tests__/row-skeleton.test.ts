import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { RowSkeleton, TxRowSkeleton } from '../index'

const here = dirname(fileURLToPath(import.meta.url))

describe('txRowSkeleton', () => {
  it('draws the requested number of rows and stays out of the a11y tree', () => {
    const wrapper = mount(TxRowSkeleton, { props: { rows: 4 } })

    expect(wrapper.findAll('.tx-row-skeleton__row')).toHaveLength(4)
    expect(wrapper.find('.tx-row-skeleton').attributes('aria-hidden')).toBe('true')
  })

  it('clamps the row count to at least one', () => {
    const wrapper = mount(TxRowSkeleton, { props: { rows: 0 } })

    expect(wrapper.findAll('.tx-row-skeleton__row')).toHaveLength(1)
  })

  it('omits the optional parts unless asked for them', () => {
    const bare = mount(TxRowSkeleton)

    expect(bare.find('.tx-row-skeleton__leading').exists()).toBe(false)
    expect(bare.find('.tx-row-skeleton__desc').exists()).toBe(false)
    expect(bare.find('.tx-row-skeleton__trailing').exists()).toBe(false)

    const full = mount(TxRowSkeleton, {
      props: { rows: 2, leading: true, description: true, trailing: true },
    })

    expect(full.findAll('.tx-row-skeleton__leading')).toHaveLength(2)
    expect(full.findAll('.tx-row-skeleton__desc')).toHaveLength(2)
    expect(full.findAll('.tx-row-skeleton__trailing')).toHaveLength(2)
  })

  it('varies the title width deterministically across rows', () => {
    const first = mount(TxRowSkeleton, { props: { rows: 5, titleWidth: '40%' } })
    const second = mount(TxRowSkeleton, { props: { rows: 5, titleWidth: '40%' } })

    const widths = first.findAll('.tx-row-skeleton__title').map(bar => bar.attributes('style'))

    // Equal-width bars read as a table; the variation is what makes it read as text.
    expect(new Set(widths).size).toBeGreaterThan(1)
    // Two renders of the same props must agree, or snapshots would never settle.
    expect(second.findAll('.tx-row-skeleton__title').map(bar => bar.attributes('style'))).toEqual(widths)
    // The cycle repeats, so row 4 matches row 0.
    expect(widths[4]).toBe(widths[0])
  })

  it('puts a hairline between rows only when separated', () => {
    expect(mount(TxRowSkeleton, { props: { rows: 3 } }).findAll('.tx-row-skeleton__separator'))
      .toHaveLength(0)

    // n rows means n-1 gaps, and the hairline is a real box so it occupies the
    // same pixel the loaded list's own separator will.
    const separated = mount(TxRowSkeleton, { props: { rows: 3, separated: true } })
    expect(separated.findAll('.tx-row-skeleton__separator')).toHaveLength(2)

    const single = mount(TxRowSkeleton, { props: { rows: 1, separated: true } })
    expect(single.findAll('.tx-row-skeleton__separator')).toHaveLength(0)
  })

  it('honours explicit widths', () => {
    const wrapper = mount(TxRowSkeleton, {
      props: { rows: 1, description: true, titleWidth: 120, descWidth: '80%' },
    })

    expect(wrapper.find('.tx-row-skeleton__title').attributes('style')).toContain('120px')
    expect(wrapper.find('.tx-row-skeleton__desc').attributes('style')).toContain('80%')
  })

  it('draws no card chrome of its own', () => {
    // The consumer's card supplies the surface. If this component drew one too,
    // it would nest a second card inside the first.
    const source = readFileSync(resolve(here, '../src/TxRowSkeleton.vue'), 'utf8')
    const root = source.match(/\.tx-row-skeleton \{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(root).not.toMatch(/^\s*border:/m)
    expect(root).not.toMatch(/^\s*background:/m)
  })

  it('registers through install', () => {
    const app = { component: vi.fn() }

    RowSkeleton.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxRowSkeleton', RowSkeleton)
  })
})
