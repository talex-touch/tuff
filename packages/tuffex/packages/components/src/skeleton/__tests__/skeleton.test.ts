import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Skeleton, {
  CardSkeleton,
  ListItemSkeleton,
  Skeleton as InstalledSkeleton,
  TxCardSkeleton,
  TxListItemSkeleton,
} from '../index'

describe('txSkeleton', () => {
  it('renders skeleton lines with CSS variables', () => {
    const wrapper = mount(Skeleton, {
      props: {
        lines: 3,
        width: 120,
        height: '1rem',
        radius: 4,
        gap: '6px',
      },
    })

    expect(wrapper.find('.tx-skeleton').attributes('style')).toContain('--tx-skeleton-gap: 6px;')
    expect(wrapper.findAll('.tx-skeleton__item')).toHaveLength(3)
    expect(wrapper.find('.tx-skeleton__item').attributes('style')).toContain('--tx-skeleton-width: 120px;')
    expect(wrapper.find('.tx-skeleton__item').attributes('style')).toContain('--tx-skeleton-height: 1rem;')
    expect(wrapper.find('.tx-skeleton__item').attributes('style')).toContain('--tx-skeleton-radius: 4px;')
  })

  it('uses circle radius and clamps lines to at least one item', () => {
    const wrapper = mount(Skeleton, {
      props: {
        variant: 'circle',
        lines: 0,
        width: 40,
        height: 40,
      },
    })

    const item = wrapper.find('.tx-skeleton__item')
    expect(wrapper.findAll('.tx-skeleton__item')).toHaveLength(1)
    expect(item.classes()).toContain('tx-skeleton__item--circle')
    expect(item.attributes('style')).toContain('--tx-skeleton-radius: 999px;')
  })

  it('renders the default slot when loading is false', () => {
    const wrapper = mount(Skeleton, {
      props: { loading: false },
      slots: {
        default: '<span class="loaded-content">Ready</span>',
      },
    })

    expect(wrapper.find('.tx-skeleton').exists()).toBe(false)
    expect(wrapper.find('.loaded-content').text()).toBe('Ready')
  })

  it('renders card and list item skeleton presets', () => {
    const card = mount(TxCardSkeleton)
    const listItem = mount(TxListItemSkeleton)

    expect(card.find('.tx-card-skeleton__icon').exists()).toBe(true)
    expect(card.find('.tx-card-skeleton__title').exists()).toBe(true)
    expect(listItem.find('.tx-list-item-skeleton__icon').exists()).toBe(true)
    expect(listItem.find('.tx-list-item-skeleton__badge').exists()).toBe(true)
  })

  it('registers skeleton components through install', () => {
    const app = { component: vi.fn() }

    InstalledSkeleton.install?.(app as any)
    CardSkeleton.install?.(app as any)
    ListItemSkeleton.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxSkeleton', InstalledSkeleton)
    expect(app.component).toHaveBeenCalledWith('TxCardSkeleton', CardSkeleton)
    expect(app.component).toHaveBeenCalledWith('TxListItemSkeleton', ListItemSkeleton)
  })
})
