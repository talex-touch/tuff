import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TxBlockLine from '../src/TxBlockLine.vue'
import TxBlockSlot from '../src/TxBlockSlot.vue'
import TxBlockSwitch from '../src/TxBlockSwitch.vue'
import TxGroupBlock from '../src/TxGroupBlock.vue'

vi.mock('gsap', () => ({
  default: {
    killTweensOf: vi.fn(),
    fromTo: vi.fn((_el: HTMLElement, _from: unknown, to: { onComplete?: () => void }) => {
      to.onComplete?.()
    }),
  },
}))

const storage = new Map<string, string>()

describe('group-block components', () => {
  beforeEach(() => {
    storage.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    })
  })

  it('renders group content, toggles expansion, and persists memory state', async () => {
    window.localStorage.setItem('tuff-block-storage-settings', JSON.stringify({ expand: false }))

    const wrapper = mount(TxGroupBlock, {
      props: {
        name: 'Settings',
        description: 'Workspace preferences',
        memoryName: 'settings',
      },
      slots: {
        default: '<div class="content-row">Notifications</div>',
        'header-extra': '<button class="header-action">Action</button>',
      },
    })

    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.text()).toContain('Workspace preferences')
    expect(wrapper.find('.content-row').exists()).toBe(true)
    expect(wrapper.classes()).not.toContain('tx-group-block--expanded')

    await wrapper.find('.tx-group-block__header').trigger('click')
    expect(wrapper.emitted('update:expanded')?.[0]).toEqual([true])
    expect(wrapper.emitted('toggle')?.[0]).toEqual([true])
    expect(JSON.parse(window.localStorage.getItem('tuff-block-storage-settings') || '{}')).toEqual({ expand: true })
  })

  it('does not toggle when the group is static', async () => {
    const wrapper = mount(TxGroupBlock, {
      props: {
        name: 'Static',
        collapsible: false,
      },
    })

    await wrapper.find('.tx-group-block__header').trigger('click')

    expect(wrapper.find('.tx-group-block__header').classes()).toContain('tx-group-block__header--static')
    expect(wrapper.emitted('update:expanded')).toBeUndefined()
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('emits BlockLine clicks only in link mode', async () => {
    const plain = mount(TxBlockLine, {
      props: {
        title: 'Version',
        description: '2.4.10',
      },
    })
    await plain.trigger('click')
    expect(plain.emitted('click')).toBeUndefined()
    expect(plain.find('.tx-block-line__description').text()).toBe('2.4.10')

    const link = mount(TxBlockLine, {
      props: {
        title: 'Documentation',
        link: true,
      },
      slots: {
        description: 'Open docs',
      },
    })
    await link.trigger('click')
    await link.trigger('keydown.enter')
    expect(link.classes()).toContain('tx-block-line--link')
    expect(link.emitted('click')).toHaveLength(2)
  })

  it('renders BlockSlot slots and blocks disabled clicks', async () => {
    const wrapper = mount(TxBlockSlot, {
      props: {
        title: 'Theme',
        description: 'Choose display mode',
        active: true,
      },
      slots: {
        tags: '<span class="tag">Beta</span>',
        default: '<button class="control">Select</button>',
      },
    })

    expect(wrapper.text()).toContain('Theme')
    expect(wrapper.text()).toContain('Choose display mode')
    expect(wrapper.find('.tag').exists()).toBe(true)
    expect(wrapper.find('.control').exists()).toBe(true)

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    await wrapper.trigger('click')
    expect(wrapper.classes()).toContain('tx-block-slot--disabled')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('emits BlockSwitch value changes and supports guidance/loading modes', async () => {
    const wrapper = mount(TxBlockSwitch, {
      props: {
        modelValue: false,
        title: 'Auto update',
        description: 'Keep packages fresh',
      },
    })

    await wrapper.find('.tuff-switch').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
    expect(wrapper.emitted('click')).toBeUndefined()

    const guidance = mount(TxBlockSwitch, {
      props: {
        modelValue: false,
        title: 'Security',
        description: 'Open security settings',
        guidance: true,
      },
    })
    expect(guidance.find('.tuff-switch').exists()).toBe(false)
    expect(guidance.find('.tx-block-switch__guidance').exists()).toBe(true)
    await guidance.trigger('click')
    expect(guidance.emitted('click')).toHaveLength(1)

    const loading = mount(TxBlockSwitch, {
      props: {
        modelValue: false,
        title: 'Sync',
        description: 'Updating state',
        loading: true,
      },
    })
    expect(loading.find('.tx-block-switch__loader').exists()).toBe(true)
    await loading.find('.tuff-switch').trigger('click')
    expect(loading.emitted('update:modelValue')).toBeUndefined()
    expect(loading.emitted('change')).toBeUndefined()
  })
})
