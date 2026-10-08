// @vitest-environment jsdom
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PluginDetails from './PluginDetails.vue'

enableAutoUnmount(afterEach)

const state = vi.hoisted(() => ({
  shortcuts: [] as ShortcutWithStatus[],
  listeners: new Set<() => void>(),
  getAll: vi.fn<() => Promise<ShortcutWithStatus[]>>(),
  update: vi.fn<(id: string, accelerator?: string, enabled?: boolean) => Promise<boolean>>()
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@talex-touch/utils/renderer', () => ({ useAppSdk: () => ({ openExternal: vi.fn() }) }))
vi.mock('~/modules/hooks/useStartupInfo', () => ({
  useStartupInfo: () => ({ startupInfo: { value: { isDev: false } } })
}))
vi.mock('~/composables/plugin/usePluginExternalLinks', () => ({
  usePluginExternalLinks: () => ({ githubRepositoryUrl: null })
}))
vi.mock('~/modules/sdk/plugin-sdk', () => ({
  pluginSDK: {
    getManifest: vi.fn(async (name: string) => ({ name, description: `${name} plugin` }))
  }
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() })
}))
vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: {
    getAll: state.getAll,
    update: state.update,
    onChanged: (listener: () => void) => {
      state.listeners.add(listener)
      return () => state.listeners.delete(listener)
    }
  }
}))

const slot = { template: '<section><slot /><slot name="description" /></section>' }
const stubs = {
  TuffGroupBlock: slot,
  TuffBlockLine: slot,
  TuffBlockSlot: slot,
  TuffBlockInput: { template: '<input />' },
  TuffBlockSwitch: { template: '<input type="checkbox" />' },
  TxButton: { template: '<button><slot /></button>' },
  TxTag: { template: '<span><slot /></span>' },
  TxEmpty: { props: ['title'], template: '<p>{{ title }}</p>' },
  TxCodeEditor: { template: '<div />' },
  FlipDialog: { template: '<div />' },
  FlatKeyInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input class="shortcut-key" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}

function plugin(name: string): ITouchPlugin {
  // This renderer fixture implements the display fields; no plugin lifecycle methods are invoked.
  const fixture = {
    name,
    version: '1.0.0',
    desc: `${name} plugin`,
    readme: '',
    icon: { type: 'class', value: 'i-ri-apps-line' },
    dev: { enable: false },
    pluginPath: `/plugins/${name}`,
    logger: {},
    features: [],
    issues: [],
    status: PluginStatus.ENABLED
  } as unknown as ITouchPlugin
  return fixture
}

function shortcut(
  owner = 'demo',
  accelerator = 'Alt+D',
  status: ShortcutWithStatus['status'] = { state: 'active' }
): ShortcutWithStatus {
  return {
    id: `plugin.${owner}.toggle`,
    accelerator,
    type: ShortcutType.RENDERER,
    meta: { creationTime: 1, modificationTime: 1, author: owner, enabled: true },
    status
  }
}

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

async function mountDetails() {
  const wrapper = mount(PluginDetails, { props: { plugin: plugin('demo') }, global: { stubs } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  state.shortcuts = [shortcut()]
  state.getAll.mockReset()
  state.getAll.mockImplementation(async () => structuredClone(state.shortcuts))
  state.update.mockReset()
  state.update.mockResolvedValue(true)
})

describe('PluginDetails live shortcut ownership', () => {
  it('updates the mounted plugin key, conflicts, warnings and recovered status from host notifications', async () => {
    state.shortcuts.push(shortcut('other', 'Alt+O'))
    const wrapper = await mountDetails()
    expect(wrapper.findAll('.PluginShortcuts-Item')).toHaveLength(1)
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+D')
    state.shortcuts = [
      shortcut('demo', 'Alt+D', { state: 'unavailable', reason: 'runtime-missing' })
    ]
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.get('.PluginShortcuts-Status').text()).toBe(
      'plugin.permissions.shortcuts.status.unavailable'
    )
    state.shortcuts = [
      shortcut('demo', 'Alt+N', {
        state: 'conflict',
        reason: 'conflict-system',
        warnings: ['permission-missing']
      })
    ]
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.PluginShortcuts-Status').text()).toBe(
      'plugin.permissions.shortcuts.status.conflictSystem'
    )
    expect(wrapper.get('.PluginShortcuts-Warnings').text()).toBe(
      'plugin.permissions.shortcuts.warning.permissionMissing'
    )
    state.shortcuts = [shortcut('demo', 'Alt+N', { state: 'active' })]
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.find('.PluginShortcuts-Status').exists()).toBe(false)
    expect(wrapper.find('.PluginShortcuts-Warnings').exists()).toBe(false)
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
  })

  it('does not let an older read overwrite the newer host key or leave the table loading', async () => {
    const wrapper = await mountDetails()
    const older = deferred<ShortcutWithStatus[]>()
    const newer = deferred<ShortcutWithStatus[]>()
    state.getAll.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    notifyShortcutChange()
    notifyShortcutChange()
    newer.resolve([shortcut('demo', 'Alt+N', { state: 'conflict', reason: 'conflict-plugin' })])
    await flushPromises()
    older.resolve([shortcut('demo', 'Alt+O', { state: 'unavailable', reason: 'runtime-missing' })])
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.PluginShortcuts-Status').text()).toBe(
      'plugin.permissions.shortcuts.status.conflictPlugin'
    )
    expect(wrapper.find('.PluginShortcuts-Loading').exists()).toBe(false)
  })

  it('keeps the pending key through event refreshes and invalidates a read that finishes after saving', async () => {
    const wrapper = await mountDetails()
    const oldRead = deferred<ShortcutWithStatus[]>()
    const spanningRead = deferred<ShortcutWithStatus[]>()
    const save = deferred<boolean>()
    const editor = wrapper.get('.shortcut-key')
    state.getAll.mockReturnValueOnce(oldRead.promise)
    notifyShortcutChange()
    state.update.mockReturnValueOnce(save.promise)
    await editor.setValue('Alt+N')
    oldRead.resolve([shortcut('demo', 'Alt+O')])
    await flushPromises()
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    state.getAll.mockReturnValueOnce(spanningRead.promise)
    notifyShortcutChange()
    state.shortcuts = [shortcut('demo', 'Alt+N', { state: 'conflict', reason: 'conflict-system' })]
    save.resolve(true)
    await flushPromises()
    spanningRead.resolve([shortcut('demo', 'Alt+O')])
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.PluginShortcuts-Status').text()).toBe(
      'plugin.permissions.shortcuts.status.conflictSystem'
    )
  })

  it('an older rejected save cannot roll back a newer successful recorded key', async () => {
    const wrapper = await mountDetails()
    const older = deferred<boolean>()
    const newer = deferred<boolean>()
    state.update.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    await wrapper.get('.shortcut-key').setValue('Alt+O')
    await wrapper.get('.shortcut-key').setValue('Alt+N')
    older.resolve(false)
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    notifyShortcutChange()
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    state.shortcuts = [shortcut('demo', 'Alt+N')]
    newer.resolve(true)
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.find('.PluginShortcuts-Loading').exists()).toBe(false)
  })

  it.each(['false', 'throw'] as const)(
    'a current save %s restores the prior working key',
    async (outcome) => {
      const wrapper = await mountDetails()
      if (outcome === 'false') state.update.mockResolvedValueOnce(false)
      else state.update.mockRejectedValueOnce(new Error('save failed'))
      await wrapper.get('.shortcut-key').setValue('Alt+X')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+D')
    }
  )

  it('drops an old plugin read after the owner switches', async () => {
    const wrapper = await mountDetails()
    const read = deferred<ShortcutWithStatus[]>()
    state.getAll.mockReturnValueOnce(read.promise)
    notifyShortcutChange()
    state.shortcuts = [shortcut('second', 'Alt+S')]
    await wrapper.setProps({ plugin: plugin('second') })
    await flushPromises()
    read.resolve([shortcut('demo', 'Alt+D'), shortcut('second', 'Alt+O')])
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+S')
    expect(wrapper.get('.PluginShortcuts-Title').text()).toBe('plugin.second.toggle')
  })

  it.each(['success', 'false', 'throw'] as const)(
    'an old owner save %s cannot disturb the new owner pending save',
    async (outcome) => {
      const wrapper = await mountDetails()
      const oldSave = deferred<boolean>()
      const newSave = deferred<boolean>()
      state.update.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise)
      await wrapper.get('.shortcut-key').setValue('Alt+O')
      state.shortcuts = [shortcut('second', 'Alt+S')]
      await wrapper.setProps({ plugin: plugin('second') })
      await flushPromises()
      await wrapper.get('.shortcut-key').setValue('Alt+N')
      if (outcome === 'throw') oldSave.reject(new Error('old save failed'))
      else oldSave.resolve(outcome === 'success')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      notifyShortcutChange()
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      state.shortcuts = [
        shortcut('second', 'Alt+N', { state: 'conflict', reason: 'conflict-plugin' })
      ]
      newSave.resolve(true)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
      expect(wrapper.get('.PluginShortcuts-Status').text()).toBe(
        'plugin.permissions.shortcuts.status.conflictPlugin'
      )
    }
  )

  it('releases the listener on unmount and does not let old requests affect the replacement table', async () => {
    const old = await mountDetails()
    const read = deferred<ShortcutWithStatus[]>()
    const save = deferred<boolean>()
    state.update.mockReturnValueOnce(save.promise)
    await old.get('.shortcut-key').setValue('Alt+O')
    state.getAll.mockReturnValueOnce(read.promise)
    notifyShortcutChange()
    expect(state.listeners.size).toBe(1)
    old.unmount()
    expect(state.listeners.size).toBe(0)
    state.shortcuts = [shortcut('demo', 'Alt+N', { state: 'conflict', reason: 'conflict-system' })]
    const current = await mountDetails()
    read.resolve([shortcut('demo', 'Alt+O')])
    save.reject(new Error('unmounted save failed'))
    await flushPromises()
    notifyShortcutChange()
    await flushPromises()
    expect(current.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(current.get('.PluginShortcuts-Status').text()).toBe(
      'plugin.permissions.shortcuts.status.conflictSystem'
    )
    current.unmount()
    expect(state.listeners.size).toBe(0)
  })
})
