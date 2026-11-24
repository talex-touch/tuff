// @vitest-environment jsdom
import type { StoreProviderDefinition } from '@talex-touch/utils/store'
import { createDefaultStoreProviders } from '@talex-touch/utils/store'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

const storageMock = vi.hoisted(() => ({
  sources: [] as StoreProviderDefinition[]
}))

vi.mock('~/modules/storage/store-sources', () => ({
  storeSourcesStorage: {
    get: () => storageMock,
    save: vi.fn()
  }
}))

import StoreSourceEditor from './StoreSourceEditor.vue'

function mountEditor(
  sources: StoreProviderDefinition[],
  propsOverride: Record<string, unknown> = {}
) {
  const reactiveSources = reactive(sources.map((item) => ({ ...item })))
  storageMock.sources = reactiveSources

  return mount(StoreSourceEditor, {
    props: {
      modelValue: true,
      ...propsOverride
    },
    global: {
      stubs: {
        TuffSwitch: {
          props: ['modelValue', 'ariaLabel'],
          emits: ['update:modelValue'],
          template:
            '<button type="button" class="stub-switch" :aria-label="ariaLabel" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue }}</button>'
        },
        TxScroll: { template: '<div><slot /></div>' },
        TxButton: {
          emits: ['click'],
          template:
            '<button type="button" class="stub-tx-btn" @click="$emit(\'click\', $event)"><slot /></button>'
        },
        TxInput: {
          props: ['modelValue', 'placeholder'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        TxSelect: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<div><slot /></div>'
        },
        TxSelectItem: { template: '<div><slot /></div>' },
        FlipDialog: {
          props: ['modelValue', 'headerTitle'],
          template:
            '<div v-if="modelValue" class="stub-dialog"><slot name="header-actions" /><slot /></div>'
        }
      },
      directives: { draggable: {}, sharedElement: {} }
    }
  })
}

describe('StoreSourceEditor default channels & interactions', () => {
  it('renders Tuff Nexus, GitHub, and NPM Registry with URLs and lock icon on read-only official source', () => {
    const defaults = createDefaultStoreProviders('https://tuff.tagzxia.com')
    const wrapper = mountEditor(defaults)

    const names = wrapper.findAll('.Item-Name').map((node) => node.text())
    expect(names).toEqual(['Tuff Nexus', 'GitHub', 'NPM Registry'])

    const urls = wrapper.findAll('.Item-Url').map((node) => node.text())
    expect(urls).toEqual([
      'https://tuff.tagzxia.com',
      'https://github.com/topics/tuff-plugin',
      'https://registry.npmjs.org'
    ])

    // Official read-only row uses lock icon and has no edit button; community channels can be edited
    expect(wrapper.find('.i-carbon-locked').exists()).toBe(true)
    expect(wrapper.find('.i-carbon-carbon-for-salesforce').exists()).toBe(false)
    expect(wrapper.findAll('button.edit-btn')).toHaveLength(2)
  })

  it('toggles GitHub channel enabled state via TuffSwitch', async () => {
    const defaults = createDefaultStoreProviders('https://tuff.tagzxia.com')
    const wrapper = mountEditor(defaults)

    const switches = wrapper.findAll('button.stub-switch')
    expect(storageMock.sources[1]?.enabled).toBe(false)
    await switches[1]!.trigger('click')
    expect(storageMock.sources[1]?.enabled).toBe(true)
  })

  it('shows Restore defaults button when a built-in channel is removed and restores it', async () => {
    const defaults = createDefaultStoreProviders('https://tuff.tagzxia.com').slice(0, 1)
    const wrapper = mountEditor(defaults)

    const restoreBtn = wrapper
      .findAll('button.stub-tx-btn')
      .find((btn) => btn.text().includes('store.sourceEditor.restoreDefaults'))
    expect(restoreBtn).toBeDefined()

    await restoreBtn!.trigger('click')
    expect(storageMock.sources.map((s) => s.id)).toEqual([
      'tuff-nexus',
      'github-releases',
      'npm-scope'
    ])
  })

  it('reveals outdated sources only when advancedMode is true', () => {
    const sources: StoreProviderDefinition[] = [
      ...createDefaultStoreProviders('https://tuff.tagzxia.com'),
      {
        id: 'legacy-one',
        name: 'Legacy Feed',
        type: 'nexusStore',
        url: 'https://legacy.example.com',
        enabled: false,
        priority: 10,
        outdated: true
      }
    ]

    const hiddenWrapper = mountEditor(sources, { advancedMode: false })
    expect(hiddenWrapper.find('.StoreSourceEditor-OutdatedSection').exists()).toBe(false)
    expect(hiddenWrapper.find('.StoreSourceEditor-Hint').exists()).toBe(true)

    const shownWrapper = mountEditor(sources, { advancedMode: true })
    expect(shownWrapper.find('.StoreSourceEditor-OutdatedSection').exists()).toBe(true)
    expect(shownWrapper.find('.StoreSourceEditor-Hint').exists()).toBe(false)
  })

  it('applies NPM Mirror preset and adds a configured npmPackage source', async () => {
    const defaults = createDefaultStoreProviders('https://tuff.tagzxia.com')
    const wrapper = mountEditor(defaults)

    const addBtn = wrapper
      .findAll('button.stub-tx-btn')
      .find((btn) => btn.text().includes('store.sourceEditor.addSource'))
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')

    const npmMirrorPreset = wrapper
      .findAll('button.preset-chip')
      .find((btn) => btn.text().includes('store.sourceEditor.presets.npmMirror'))
    expect(npmMirrorPreset).toBeDefined()
    await npmMirrorPreset!.trigger('click')

    const submitBtn = wrapper
      .findAll('button.stub-tx-btn')
      .find((btn) => btn.text().trim() === 'store.sourceEditor.add')
    expect(submitBtn).toBeDefined()
    await submitBtn!.trigger('click')

    const added = storageMock.sources.find((s) => s.url === 'https://registry.npmmirror.com')
    expect(added).toMatchObject({
      name: 'NPM Mirror',
      type: 'npmPackage',
      url: 'https://registry.npmmirror.com',
      enabled: true,
      config: {
        registryUrl: 'https://registry.npmmirror.com',
        keyword: 'tuff-plugin',
        keywords: ['tuff-plugin', 'talex-touch-plugin']
      }
    })
  })
})
