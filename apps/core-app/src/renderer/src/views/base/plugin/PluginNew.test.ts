// @vitest-environment jsdom
import { PluginProviderType } from '@talex-touch/utils/plugin/providers/types'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PluginNew from './PluginNew.vue'

const mockState = vi.hoisted(() => ({
  transportSend: vi.fn(),
  forTouchTip: vi.fn(),
  popperMention: vi.fn(),
  getTaskBySource: vi.fn(),
  isActiveStage: vi.fn(),
  envInit: vi.fn(),
  envGetNode: vi.fn(),
  envGetDegit: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mockState.transportSend
  })
}))

vi.mock('@talex-touch/utils/renderer/touch-sdk/env', () => ({
  EnvDetector: {
    init: mockState.envInit,
    getNode: mockState.envGetNode,
    getDegit: mockState.envGetDegit
  }
}))

vi.mock('~/modules/install/install-manager', () => ({
  useInstallManager: () => ({
    getTaskBySource: mockState.getTaskBySource,
    isActiveStage: mockState.isActiveStage
  })
}))

vi.mock('~/modules/mention/dialog-mention', () => ({
  forTouchTip: mockState.forTouchTip,
  popperMention: mockState.popperMention
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

const stubs = {
  FormTemplate: { template: '<div><slot name="header" /><slot /></div>' },
  BlockTemplate: { props: ['title'], template: '<section><slot /></section>' },
  BrickTemplate: { template: '<div><slot /></div>' },
  LineTemplate: { template: '<div><slot /></div>' },
  ActionTemplate: { template: '<div><slot /></div>' },
  FlatMarkdown: { template: '<div />' },
  TerminalTemplate: { template: '<div />' },
  TxCheckbox: { template: '<input type="checkbox" />' },
  TxButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  TxInput: {
    props: ['modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template:
      '<textarea v-if="type === \'textarea\'" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" /><input v-else :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  TuffSelect: {
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="" /><slot /></select>'
  },
  TuffSelectItem: {
    props: ['label', 'value'],
    template: '<option :value="value">{{ label }}</option>'
  }
}

async function flushUi(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountPluginNew() {
  return mount(PluginNew, {
    global: {
      stubs,
      directives: {
        wave: {}
      }
    }
  })
}

describe('PluginNew manual NPM installation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.envGetNode.mockResolvedValue('22.0.0')
    mockState.envGetDegit.mockResolvedValue(true)
    mockState.getTaskBySource.mockReturnValue(undefined)
    mockState.isActiveStage.mockReturnValue(false)
    mockState.forTouchTip.mockResolvedValue(undefined)
    mockState.transportSend.mockResolvedValue({
      status: 'success',
      provider: PluginProviderType.NPM,
      official: false,
      manifest: {
        name: 'clipboard-history',
        version: '1.2.0',
        author: 'Talex Touch'
      }
    })
  })

  it('auto-detects bare @talex-touch/<id>-plugin and dispatches canonical npm source with PluginProviderType.NPM', async () => {
    const wrapper = mountPluginNew()
    await flushUi()

    const sourceInput = wrapper.find('input')
    await sourceInput.setValue('@talex-touch/clipboard-history-plugin@1.2.0')
    await flushUi()

    expect(wrapper.find('.InstallDetectedSource-Code').text()).toBe(
      'npm:@talex-touch/clipboard-history-plugin@1.2.0'
    )

    const installButton = wrapper.find('.InstallActions button')
    await installButton.trigger('click')
    await flushUi()

    expect(mockState.transportSend).toHaveBeenCalledWith(PluginEvents.install.source, {
      source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
      hintType: PluginProviderType.NPM,
      metadata: {
        packageName: '@talex-touch/clipboard-history-plugin',
        officialScope: true,
        requestedSpec: '1.2.0',
        version: '1.2.0'
      },
      clientMetadata: {
        pluginName: 'clipboard-history',
        packageName: '@talex-touch/clipboard-history-plugin',
        source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0'
      }
    })

    wrapper.unmount()
  })

  it('supports bare tuff-plugin-<slug>@beta with custom HTTPS registry in metadata JSON', async () => {
    const wrapper = mountPluginNew()
    await flushUi()

    await wrapper.find('input').setValue('tuff-plugin-weather@beta')
    await wrapper.find('textarea').setValue('{"registry": "https://npm.example.com/"}')
    await flushUi()

    expect(wrapper.find('.InstallDetectedSource-Code').text()).toBe('npm:tuff-plugin-weather@beta')

    await wrapper.find('.InstallActions button').trigger('click')
    await flushUi()

    expect(mockState.transportSend).toHaveBeenCalledWith(PluginEvents.install.source, {
      source: 'npm:tuff-plugin-weather@beta',
      hintType: PluginProviderType.NPM,
      metadata: {
        packageName: 'tuff-plugin-weather',
        officialScope: false,
        requestedSpec: 'beta',
        distTag: 'beta',
        registry: 'https://npm.example.com'
      },
      clientMetadata: {
        pluginName: 'weather',
        packageName: 'tuff-plugin-weather',
        source: 'npm:tuff-plugin-weather@beta'
      }
    })

    wrapper.unmount()
  })

  it('rejects disallowed non-HTTPS npm registry in metadata JSON without sending install request', async () => {
    const wrapper = mountPluginNew()
    await flushUi()

    await wrapper.find('input').setValue('npm:tuff-plugin-weather@1.0.0')
    await wrapper.find('textarea').setValue('{"registry": "http://untrusted.example.com"}')
    await flushUi()

    await wrapper.find('.InstallActions button').trigger('click')
    await flushUi()

    expect(mockState.transportSend).not.toHaveBeenCalled()
    expect(wrapper.find('.InstallStatus.error').text()).toContain(
      'plugin.new.install.invalidMetadata'
    )

    wrapper.unmount()
  })

  it('fails closed when NPM hintType is selected with a non-npm URL source', async () => {
    const wrapper = mountPluginNew()
    await flushUi()

    await wrapper.find('select').setValue(PluginProviderType.NPM)
    await wrapper.find('input').setValue('https://example.com/archive.tgz')
    await flushUi()

    expect(wrapper.find('.InstallDetectedSource').exists()).toBe(false)

    await wrapper.find('.InstallActions button').trigger('click')
    await flushUi()

    expect(mockState.transportSend).not.toHaveBeenCalled()
    expect(wrapper.find('.InstallStatus.error').text()).toContain(
      'store.installation.reasons.sourceInvalid'
    )

    wrapper.unmount()
  })

  it('leaves non-NPM sources untouched for auto-detection', async () => {
    const wrapper = mountPluginNew()
    await flushUi()

    await wrapper.find('input').setValue('talex-touch/example-plugin')
    await flushUi()

    expect(wrapper.find('.InstallDetectedSource').exists()).toBe(false)

    await wrapper.find('.InstallActions button').trigger('click')
    await flushUi()

    expect(mockState.transportSend).toHaveBeenCalledWith(PluginEvents.install.source, {
      source: 'talex-touch/example-plugin',
      clientMetadata: {
        pluginName: 'talex-touch/example-plugin',
        source: 'talex-touch/example-plugin'
      }
    })

    wrapper.unmount()
  })
})
