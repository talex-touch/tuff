// @vitest-environment jsdom
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PluginFeatureDetailCard from './PluginFeatureDetailCard.vue'

enableAutoUnmount(afterEach)

const state = vi.hoisted(() => ({
  bindings: {} as Record<string, ShortcutWithStatus>
}))

vi.mock('vue-i18n', () => ({
  // Key plus params, so a test reads which copy was chosen and what was put into it.
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() })
}))
vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: {
    getFeatureShortcuts: vi.fn(async () => state.bindings),
    setFeatureShortcut: vi.fn(async () => true)
  }
}))

const slot = { template: '<div><slot /></div>' }
const stubs = {
  TxTabs: slot,
  TxTabItem: slot,
  TxScroll: slot,
  TuffGroupBlock: slot,
  TxButton: { template: '<button><slot /></button>' },
  TxIcon: { template: '<i />' },
  TuffInput: { template: '<input />' },
  TxInput: { template: '<input />' },
  TuffSelect: slot,
  TxSelect: slot,
  TuffSelectItem: { template: '<span />' },
  TxSelectItem: { template: '<span />' },
  TuffSwitch: { template: '<span />' },
  TxSwitch: { template: '<span />' },
  WidgetFrame: { template: '<div />' },
  FlatKeyInput: { template: '<input />' }
}

function binding(status: ShortcutWithStatus['status']): ShortcutWithStatus {
  return {
    id: 'feature.demo.translate',
    accelerator: 'CommandOrControl+Alt+Shift+F17',
    type: ShortcutType.FEATURE,
    meta: { creationTime: 0, modificationTime: 0, author: 'demo', enabled: true },
    status
  }
}

async function shortcutHints(status: ShortcutWithStatus['status']): Promise<string[]> {
  state.bindings = { translate: binding(status) }
  const wrapper = mount(PluginFeatureDetailCard, {
    props: {
      feature: { id: 'translate', name: 'Translate', desc: '', commands: [] },
      pluginName: 'demo',
      detailTab: 'overview',
      widgetTabEnabled: false,
      widgetStatus: '',
      widgetSourceDisplayPath: '',
      widgetSourceFilePath: null,
      widgetSourceUrl: null,
      widgetCompiledDisplayPath: null,
      widgetCompiledPath: null,
      widgetPathAliasNote: null,
      widgetPreviewOptions: [],
      previewWidgetId: null,
      previewWidgetReady: false,
      previewWidgetRegistering: false,
      previewWidgetRenderError: '',
      previewWidgetIssues: [],
      previewWidgetStatus: '',
      previewWidgetHint: '',
      previewWidgetItem: null,
      previewFrameStyle: {},
      previewFrameResizing: false,
      previewFrameSizeLabel: '',
      previewSizeOptions: [],
      previewSizePresetValue: '',
      mockPayloadEnabled: false,
      mockPayloadRaw: '',
      mockPayloadError: '',
      mockPayloadValue: null,
      isOperationDisabled: false,
      isDevDisconnected: false,
      devDisconnectMessage: '',
      devDisconnectReason: '',
      devDisconnectSuggestion: '',
      canReconnect: false
    } as never,
    global: { stubs }
  })
  await flushPromises()
  return wrapper
    .find('.PluginFeature-Shortcut')
    .findAll('p')
    .map((hint) => hint.text())
}

/**
 * The feature card is where a user binds a key to a plugin feature, and the only place that
 * binding is shown: the settings shortcut dialog lists system shortcuts alone. While the plugin is
 * not running, main releases the key and reports it runtime-missing, so the card says why.
 */
describe('PluginFeatureDetailCard shortcut status', () => {
  it('says the plugin is not running when main reports the binding runtime-missing', async () => {
    expect(await shortcutHints({ state: 'unavailable', reason: 'runtime-missing' })).toEqual([
      'plugin.features.shortcut.runtimeMissing'
    ])
  })

  it('keeps the conflict hint for a key another binding holds, and says nothing more', async () => {
    expect(await shortcutHints({ state: 'conflict', conflictWith: ['core.box.toggle'] })).toEqual([
      'plugin.features.shortcut.conflict {"with":"core.box.toggle"}'
    ])
  })

  it('says nothing about a binding that is live', async () => {
    expect(await shortcutHints({ state: 'active' })).toEqual([])
  })
})
