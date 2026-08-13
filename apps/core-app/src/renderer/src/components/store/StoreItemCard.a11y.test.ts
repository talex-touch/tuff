// @vitest-environment jsdom

/**
 * The plugin card carried the only affordance that opens plugin details and was a plain `<div>`
 * with `@click` — no role, no tabindex, no keydown handler. A keyboard user tabbing the grid never
 * focused a card, and a screen reader announced an unlabelled group rather than a control. The one
 * reachable action was installing a plugin whose details could not be read (#831).
 *
 * Not turned into a native `<button>`: the card *contains* one (StoreInstallButton), and nesting
 * interactive elements is invalid. `role="button"` plus tabindex and a keydown handler is the
 * pattern that fits — and the last test is the reason the handler checks the event target, since a
 * native button raises `click` from Enter/Space and StoreInstallButton stops only the click.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

import StoreItemCard from './StoreItemCard.vue'

function mountCard() {
  return mount(StoreItemCard, {
    props: {
      item: { id: 'p1', name: 'Demo Plugin', version: '1.0.0' } as never
    },
    global: {
      stubs: {
        TxPluginMetaHeader: { template: '<div><slot name="title-extra" /></div>' },
        TxPopover: true,
        TxTag: true,
        StoreIcon: true,
        StoreInstallButton: {
          template: '<button class="install-stub" @keydown="() => {}">Install</button>'
        }
      },
      directives: { sharedElement: {} }
    }
  })
}

describe('the store card is reachable without a mouse', () => {
  it('卡片本身是可聚焦的按钮语义,并带可读名称', () => {
    const card = mountCard().get('.store-item-card')

    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('aria-label')).toContain('Demo Plugin')
  })

  it.each(['Enter', ' '])('按 %s 打开详情', async (key) => {
    const wrapper = mountCard()

    await wrapper.get('.store-item-card').trigger('keydown', { key })

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('其它按键不触发打开', async () => {
    const wrapper = mountCard()

    await wrapper.get('.store-item-card').trigger('keydown', { key: 'a' })
    await wrapper.get('.store-item-card').trigger('keydown', { key: 'Tab' })

    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('鼠标点击仍然照常打开(否则上面几条会掩盖"只剩键盘可用")', async () => {
    const wrapper = mountCard()

    await wrapper.get('.store-item-card').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('从内部安装按钮冒泡上来的 Enter 不会顺带打开卡片', async () => {
    const wrapper = mountCard()

    // A native button raises click from Enter/Space; StoreInstallButton stops that click, but its
    // keydown still reaches the card.
    await wrapper.get('.install-stub').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('open')).toBeUndefined()
  })
})
