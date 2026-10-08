// @vitest-environment jsdom
import type { ShortcutStatus, ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import PluginFeatureDetailCard from './PluginFeatureDetailCard.vue'

enableAutoUnmount(afterEach)

const state = vi.hoisted(() => ({
  bindings: {} as Record<string, ShortcutWithStatus>,
  listeners: new Set<() => void>(),
  getFeatureShortcuts: vi.fn<() => Promise<Record<string, ShortcutWithStatus>>>(),
  setFeatureShortcut: vi.fn<(...args: string[]) => Promise<boolean>>()
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
    getFeatureShortcuts: state.getFeatureShortcuts,
    setFeatureShortcut: state.setFeatureShortcut,
    onChanged: (listener: () => void) => {
      state.listeners.add(listener)
      return () => state.listeners.delete(listener)
    }
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
  FlatKeyInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input class="shortcut-key" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
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

function mountFeature() {
  return mount(PluginFeatureDetailCard, {
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
}

async function shortcutHints(status: ShortcutWithStatus['status']): Promise<string[]> {
  state.bindings = { translate: binding(status) }
  const wrapper = mountFeature()
  await flushPromises()
  return wrapper
    .find('.PluginFeature-Shortcut')
    .findAll('p')
    .map((hint) => hint.text())
}

beforeEach(() => {
  state.bindings = {}
  state.getFeatureShortcuts.mockReset()
  state.getFeatureShortcuts.mockImplementation(async () => structuredClone(state.bindings))
  state.setFeatureShortcut.mockReset()
  state.setFeatureShortcut.mockResolvedValue(true)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function notifyShortcutChange() {
  for (const listener of [...state.listeners]) listener()
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

describe('PluginFeatureDetailCard follows its current shortcut owner', () => {
  it('refreshes a mounted card through stop, conflict, recovery, rebind and clear notifications', async () => {
    state.bindings = { translate: binding({ state: 'active' }) }
    const wrapper = mountFeature()
    await flushPromises()
    const key = wrapper.get<HTMLInputElement>('.shortcut-key')
    expect(key.element.value).toBe('CommandOrControl+Alt+Shift+F17')
    const statuses: ShortcutStatus[] = [
      { state: 'unavailable', reason: 'runtime-missing' },
      { state: 'conflict', conflictWith: ['core.box.toggle'] },
      { state: 'active' }
    ]
    for (const status of statuses) {
      state.bindings = { translate: binding(status) }
      notifyShortcutChange()
      await flushPromises()
      const hints = wrapper.get('.PluginFeature-Shortcut').text()
      if (status.state === 'unavailable')
        expect(hints).toContain('plugin.features.shortcut.runtimeMissing')
      else if (status.state === 'conflict') expect(hints).toContain('core.box.toggle')
      else {
        expect(hints).not.toContain('plugin.features.shortcut.runtimeMissing')
        expect(hints).not.toContain('plugin.features.shortcut.conflict')
      }
    }
    state.bindings.translate.accelerator = 'Alt+J'
    notifyShortcutChange()
    await flushPromises()
    expect(key.element.value).toBe('Alt+J')
    state.bindings = {}
    notifyShortcutChange()
    await flushPromises()
    expect(key.element.value).toBe('')
  })

  it('does not let an older notification read overwrite the newer host binding', async () => {
    state.bindings = { translate: binding({ state: 'active' }) }
    const wrapper = mountFeature()
    await flushPromises()
    const older = deferred<Record<string, ShortcutWithStatus>>()
    const newer = deferred<Record<string, ShortcutWithStatus>>()
    state.getFeatureShortcuts.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    notifyShortcutChange()
    notifyShortcutChange()
    newer.resolve({
      translate: {
        ...binding({ state: 'conflict', conflictWith: ['new-owner'] }),
        accelerator: 'Alt+N'
      }
    })
    await flushPromises()
    older.resolve({ translate: binding({ state: 'unavailable', reason: 'runtime-missing' }) })
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.PluginFeature-Shortcut').text()).toContain('new-owner')
    expect(wrapper.get('.PluginFeature-Shortcut').text()).not.toContain(
      'plugin.features.shortcut.runtimeMissing'
    )
  })

  it('keeps the saving selection against a pre-save read and rereads the authoritative result on completion', async () => {
    state.bindings = { translate: binding({ state: 'active' }) }
    const wrapper = mountFeature()
    await flushPromises()
    const oldRead = deferred<Record<string, ShortcutWithStatus>>()
    state.getFeatureShortcuts.mockReturnValueOnce(oldRead.promise)
    notifyShortcutChange()
    const save = deferred<boolean>()
    state.setFeatureShortcut.mockReturnValueOnce(save.promise)
    await wrapper.get('.shortcut-key').setValue('Alt+N')
    oldRead.resolve({ translate: binding({ state: 'unavailable', reason: 'runtime-missing' }) })
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    state.bindings = {
      translate: {
        ...binding({ state: 'conflict', conflictWith: ['host-winner'] }),
        accelerator: 'Alt+N'
      }
    }
    save.resolve(true)
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.PluginFeature-Shortcut').text()).toContain('host-winner')
  })

  it.each(['false', 'throw'] as const)(
    'shows a current save %s error and restores the host binding',
    async (failure) => {
      state.bindings = { translate: binding({ state: 'active' }) }
      const wrapper = mountFeature()
      await flushPromises()
      if (failure === 'false') state.setFeatureShortcut.mockResolvedValueOnce(false)
      else state.setFeatureShortcut.mockRejectedValueOnce(new Error('save rejected'))
      await wrapper.get('.shortcut-key').setValue('Alt+N')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe(
        'CommandOrControl+Alt+Shift+F17'
      )
      expect(wrapper.get('.PluginFeature-Shortcut').text()).toContain(
        failure === 'false'
          ? 'plugin.features.shortcut.invalid'
          : 'plugin.features.shortcut.saveFailed'
      )
    }
  )

  it.each(['plugin', 'feature'] as const)(
    'drops old identity reads when the %s changes',
    async (identity) => {
      const oldRead = deferred<Record<string, ShortcutWithStatus>>()
      state.getFeatureShortcuts.mockReturnValueOnce(oldRead.promise)
      const wrapper = mountFeature()
      const featureId = identity === 'feature' ? 'search' : 'translate'
      state.bindings = { [featureId]: { ...binding({ state: 'active' }), accelerator: 'Alt+S' } }
      await wrapper.setProps(
        identity === 'plugin'
          ? { pluginName: 'second' }
          : ({ feature: { id: 'search', name: 'Search', desc: '', commands: [] } } as never)
      )
      await flushPromises()
      oldRead.resolve({ translate: binding({ state: 'conflict', conflictWith: ['old-owner'] }) })
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+S')
      expect(wrapper.get('.PluginFeature-Shortcut').text()).not.toContain('old-owner')
    }
  )

  it.each(['success', 'false', 'throw'] as const)(
    'an old save %s cannot roll back, show errors, or unlock a new owner save',
    async (outcome) => {
      state.bindings = { translate: binding({ state: 'active' }) }
      const wrapper = mountFeature()
      await flushPromises()
      const oldSave = deferred<boolean>()
      const newSave = deferred<boolean>()
      state.setFeatureShortcut
        .mockReturnValueOnce(oldSave.promise)
        .mockReturnValueOnce(newSave.promise)
      wrapper.getComponent(FlatKeyInput).vm.$emit('update:modelValue', 'Alt+O')
      await flushPromises()
      state.bindings = { search: { ...binding({ state: 'active' }), accelerator: 'Alt+S' } }
      await wrapper.setProps({
        pluginName: 'second',
        feature: { id: 'search', name: 'Search', desc: '', commands: [] }
      } as never)
      await flushPromises()
      wrapper.getComponent(FlatKeyInput).vm.$emit('update:modelValue', 'Alt+N')
      await flushPromises()
      if (outcome === 'throw') oldSave.reject(new Error('old owner save failed'))
      else oldSave.resolve(outcome === 'success')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      expect(wrapper.get('.PluginFeature-Shortcut').text()).not.toContain(
        'plugin.features.shortcut.saveFailed'
      )
      expect(wrapper.get('.PluginFeature-Shortcut').text()).not.toContain(
        'plugin.features.shortcut.invalid'
      )
      // The old finally must not clear the new owner's pending-save guard.
      wrapper.getComponent(FlatKeyInput).vm.$emit('update:modelValue', 'Alt+X')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      expect(state.setFeatureShortcut).toHaveBeenCalledTimes(2)
      state.bindings = {
        search: {
          ...binding({ state: 'conflict', conflictWith: ['second-winner'] }),
          accelerator: 'Alt+N'
        }
      }
      newSave.resolve(true)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      expect(wrapper.get('.PluginFeature-Shortcut').text()).toContain('second-winner')
    }
  )

  it('releases its listener and leaves a replacement card unaffected by unmounted reads and saves', async () => {
    state.bindings = { translate: binding({ state: 'active' }) }
    const old = mountFeature()
    await flushPromises()
    const read = deferred<Record<string, ShortcutWithStatus>>()
    const save = deferred<boolean>()
    state.getFeatureShortcuts.mockReturnValueOnce(read.promise)
    notifyShortcutChange()
    state.setFeatureShortcut.mockReturnValueOnce(save.promise)
    await old.get('.shortcut-key').setValue('Alt+O')
    expect(state.listeners.size).toBe(1)
    old.unmount()
    expect(state.listeners.size).toBe(0)
    state.bindings = { translate: { ...binding({ state: 'active' }), accelerator: 'Alt+N' } }
    const current = mountFeature()
    await flushPromises()
    read.resolve({ translate: binding({ state: 'conflict', conflictWith: ['old-owner'] }) })
    save.reject(new Error('unmounted save failed'))
    await flushPromises()
    notifyShortcutChange()
    await flushPromises()
    expect(current.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(current.get('.PluginFeature-Shortcut').text()).not.toContain('old-owner')
    expect(current.get('.PluginFeature-Shortcut').text()).not.toContain(
      'plugin.features.shortcut.saveFailed'
    )
    current.unmount()
    expect(state.listeners.size).toBe(0)
  })
})
