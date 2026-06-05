// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppList, { type AppListItem } from './AppList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

function mountAppList(list: AppListItem[], index = -1) {
  return mount(AppList, {
    props: {
      list,
      index
    },
    global: {
      stubs: {
        TxScroll: { template: '<div><slot /></div>' },
        FlatInput: { template: '<input />' },
        PluginIcon: { template: '<span />' }
      }
    }
  })
}

describe('AppList semantics', () => {
  it('exposes order control as a named button', () => {
    const wrapper = mountAppList([{ name: 'Calculator' }])
    const orderButton = wrapper.get('button.order-way')

    expect(orderButton.attributes('type')).toBe('button')
    expect(orderButton.attributes('aria-label')).toBe('appList.order.change')
  })

  it('selects app items with keyboard activation', async () => {
    const list = [{ name: 'Calculator' }, { name: 'Terminal' }]
    const wrapper = mountAppList(list)
    const item = wrapper.get('li[data-index="0"]')

    expect(item.attributes('role')).toBe('button')
    expect(item.attributes('tabindex')).toBe('0')
    expect(item.attributes('aria-selected')).toBe('false')

    await item.trigger('keydown.enter')

    const events = wrapper.emitted('select') ?? []
    expect(events.at(-1)).toEqual([list[0], 0])
  })
})
