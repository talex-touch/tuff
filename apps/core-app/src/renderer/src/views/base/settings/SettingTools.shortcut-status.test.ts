// @vitest-environment jsdom
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { BETA_FEATURE_SHORTCUTS } from '../../../../../shared/beta-features'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingTools from './SettingTools.vue'

enableAutoUnmount(afterEach)

const state = vi.hoisted(() => {
  const { reactive, ref } = require('vue') as typeof import('vue')
  return {
    shortcuts: [] as ShortcutWithStatus[],
    listeners: new Set<() => void>(),
    getAll: vi.fn<() => Promise<ShortcutWithStatus[]>>(),
    update: vi.fn<(id: string, accelerator?: string, enabled?: boolean) => Promise<boolean>>(),
    platform: ref('darwin'),
    appSetting: reactive({
      coreBox: { customPlaceholder: '' },
      beginner: { init: true },
      dev: { advancedSettings: false },
      betaFeatures: {} as Record<string, boolean> | undefined,
      localAiCli: { enabled: true },
      tools: {
        autoPaste: { enable: true, time: 5 },
        autoHide: true,
        autoClear: 300,
        clipboardPolling: { interval: 3, lowBatteryPolicy: { enable: true, interval: 10 } }
      },
      omniPanel: {
        enableShortcut: false,
        enableMouseLongPress: true,
        mouseLongPressDurationMs: 600,
        autoMountFirstFeatureOnPluginInstall: false,
        featureHub: { items: [] }
      },
      recommendation: {
        enabled: true,
        maxItems: 10,
        showReason: true,
        semantic: { localVectorEnabled: true, aiRerankEnabled: false, aiEmbeddingEnabled: false },
        contextSources: {
          time: true,
          foregroundApp: true,
          clipboard: true,
          selection: true,
          network: true,
          focus: true,
          power: true,
          location: true
        }
      }
    })
  }
})

vi.mock('vue-i18n', () => ({
  // Key plus params, so a test reads which copy was chosen and what was put into it.
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn(async () => ({ status: 'granted', canRequest: false })) })
}))
vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  defineEvent: () => ({
    module: () => ({ event: () => ({ define: () => 'system:permission:check' }) })
  })
}))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('~/modules/platform/renderer-platform', async () => {
  const { computed } = await import('vue')
  return {
    useRendererPlatform: () => ({
      platform: state.platform,
      isMac: computed(() => state.platform.value === 'darwin')
    })
  }
})
vi.mock('~/utils/renderer-log', () => ({ createRendererLogger: () => ({ warn: vi.fn() }) }))
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
vi.mock('~/modules/storage/app-storage', () => ({ appSetting: state.appSetting }))

/** Renders what the dialog is handed, one line per row: the status text is the contract here. */
const stubs = {
  TuffGroupBlock: { template: '<section><slot /></section>' },
  TuffBlockInput: { template: '<div><slot name="control" /></div>' },
  TuffBlockSlot: { template: '<div><slot /></div>' },
  TuffBlockSwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><button type="button" :aria-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" /></label>'
  },
  TuffBlockSelect: { template: '<div><slot /></div>' },
  TxSelectItem: { template: '<span />' },
  TxInput: { template: '<input />' },
  TxButton: { template: '<button><slot /></button>' },
  ShortcutDialog: {
    props: ['rows'],
    template:
      '<ul><li v-for="row in rows" :key="row.shortcut.id" :data-id="row.shortcut.id">{{ row.statusText }}</li></ul>'
  }
}

function mainShortcut(
  id: string,
  accelerator: string,
  status: ShortcutWithStatus['status']
): ShortcutWithStatus {
  return {
    id,
    accelerator,
    type: ShortcutType.MAIN,
    meta: { creationTime: 0, modificationTime: 0, author: 'system', enabled: true },
    status
  }
}

async function statusTexts(): Promise<Record<string, string>> {
  const wrapper = mount(SettingTools, { global: { stubs } })
  await flushPromises()
  return Object.fromEntries(
    wrapper.findAll('li').map((row) => [row.attributes('data-id'), row.text()])
  )
}

beforeEach(() => {
  state.appSetting.dev.advancedSettings = false
  state.appSetting.betaFeatures = {}
  state.appSetting.localAiCli.enabled = true
  state.appSetting.omniPanel.enableShortcut = false
  state.getAll.mockReset()
  state.getAll.mockImplementation(async () => structuredClone(state.shortcuts))
  state.update.mockReset()
  state.update.mockResolvedValue(true)
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

async function openLiveDialog() {
  const wrapper = mount(SettingTools, {
    global: {
      stubs: {
        ...stubs,
        ShortcutDialog: false,
        FlipDialog: {
          props: ['modelValue'],
          setup: () => ({ close: () => {} }),
          template: '<section v-if="modelValue"><slot :close="close" /></section>'
        },
        FlatKeyInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input class="shortcut-key" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        TxTooltip: { template: '<div><slot /></div>' },
        TxSpinner: { template: '<span />' },
        TxSkeleton: { template: '<span />' },
        TxSearchInput: { template: '<input />' }
      }
    }
  })
  await flushPromises()
  await wrapper.get('.ShortcutEntry button').trigger('click')
  await flushPromises()
  return wrapper
}

/**
 * No key stands in for CoreBox's default when the OS refuses it or it loses an in-app conflict, so
 * its settings row says just that. It once read "注册失败，本次暂用 ⌘E" while a stand-in ran; that
 * state is gone, and no status line names a key other than the one in the recorder.
 */
describe('SettingTools shortcut status', () => {
  beforeEach(() => {
    state.platform.value = 'darwin'
    state.shortcuts = [
      mainShortcut('core.box.toggle', 'Alt+Space', {
        state: 'unavailable',
        reason: 'register-failed'
      })
    ]
  })

  it('says a refused CoreBox default is not registered', async () => {
    const texts = await statusTexts()

    expect(texts['core.box.toggle']).toBe('settingTools.shortcutStatus.unavailable')
  })

  it('says a CoreBox default that lost an in-app conflict is in conflict', async () => {
    state.appSetting.betaFeatures = { screenshot: true }
    state.shortcuts = [
      mainShortcut('screenshot.tool.start', 'Option+Space', { state: 'active' }),
      mainShortcut('core.box.toggle', 'Alt+Space', {
        state: 'conflict',
        reason: 'conflict-system',
        conflictWith: ['screenshot.tool.start']
      })
    ]

    const texts = await statusTexts()

    expect(texts['core.box.toggle']).toBe('settingTools.shortcutStatus.conflictSystem')
    expect(texts['screenshot.tool.start']).toBe('')
  })

  it('says a shortcut whose owner is not running waits for it, rather than blaming the system', async () => {
    // The record stays when its callback goes: ⌘⇧L while local agents are off, or a shortcut
    // whose plugin is not running. Nothing was refused, so neither reads "registration failed".
    const runtimeMissing = { state: 'unavailable', reason: 'runtime-missing' } as const
    state.shortcuts = [
      mainShortcut('local-ai-cli.quick-open', 'CommandOrControl+Shift+L', runtimeMissing),
      {
        ...mainShortcut('plugin.translate.toggle', 'Alt+T', runtimeMissing),
        meta: { creationTime: 0, modificationTime: 0, author: 'translate', enabled: true }
      }
    ]

    const texts = await statusTexts()

    expect(texts['local-ai-cli.quick-open']).toBe('settingTools.shortcutStatus.localAiCliOff')
    expect(texts['plugin.translate.toggle']).toBe('settingTools.shortcutStatus.runtimeMissing')
  })
})

describe('SettingTools Beta feature access', () => {
  beforeEach(() => {
    state.shortcuts = [
      mainShortcut('core.box.toggle', 'Alt+Space', { state: 'active' }),
      ...Object.values(BETA_FEATURE_SHORTCUTS).map((id, index) =>
        mainShortcut(id, `Alt+${index + 1}`, { state: 'active' })
      )
    ]
  })

  it.each([
    undefined,
    {},
    { screenshot: 'true', voiceDictation: 1, voiceQuickEdit: null, omniPanel: [] }
  ])('hides legacy enabled shortcut records without valid Beta opt-ins (%j)', async (flags) => {
    state.appSetting.betaFeatures = flags as typeof state.appSetting.betaFeatures
    expect(await statusTexts()).toEqual({ 'core.box.toggle': '' })
  })

  it.each([
    { advanced: false, advancedOnly: false },
    { advanced: true, advancedOnly: true }
  ])('does not expose Beta controls for %j', async ({ advanced, advancedOnly }) => {
    state.appSetting.dev.advancedSettings = advanced
    const wrapper = mount(SettingTools, { props: { advancedOnly }, global: { stubs } })
    await flushPromises()
    expect(wrapper.findAll('[data-beta-feature]')).toHaveLength(0)
  })

  it.each(Object.entries(BETA_FEATURE_SHORTCUTS))(
    'shows and hides %s shortcuts only after the explicit opt-in succeeds',
    async (feature, id) => {
      state.appSetting.dev.advancedSettings = true
      state.appSetting.betaFeatures = { [feature]: false }
      const shortcut = state.shortcuts.find((record) => record.id === id)!
      shortcut.meta.enabled = false
      shortcut.status = { state: 'disabled' }
      const wrapper = mount(SettingTools, { global: { stubs } })
      await flushPromises()
      const control = wrapper.get(`[data-beta-feature="${feature}"] button`)
      const save = deferred<boolean>()
      state.update.mockImplementationOnce(async (savedId, _accelerator, enabled) => {
        const success = await save.promise
        if (success) {
          const saved = state.shortcuts.find((record) => record.id === savedId)!
          saved.meta.enabled = enabled === true
          saved.status = { state: enabled === true ? 'active' : 'disabled' }
        }
        return success
      })
      await control.trigger('click')
      expect(wrapper.find(`li[data-id="${id}"]`).exists()).toBe(false)
      expect(control.attributes('disabled')).toBeDefined()
      save.resolve(true)
      await flushPromises()
      expect(wrapper.get(`li[data-id="${id}"]`).text()).toBe('')
      expect(control.attributes('aria-checked')).toBe('true')
      const stored = structuredClone(state.shortcuts.find((shortcut) => shortcut.id === id))
      await control.trigger('click')
      await flushPromises()
      expect(wrapper.find(`li[data-id="${id}"]`).exists()).toBe(false)
      expect(state.shortcuts.find((shortcut) => shortcut.id === id)).toEqual(stored)
      expect(wrapper.get('li[data-id="core.box.toggle"]').text()).toBe('')
    }
  )

  it.each(['false', 'throw'] as const)(
    'a failed feature opt-in (%s) leaves the shortcut hidden and the switch off',
    async (failure) => {
      state.appSetting.dev.advancedSettings = true
      state.appSetting.betaFeatures = { screenshot: false }
      if (failure === 'false') state.update.mockResolvedValueOnce(false)
      else state.update.mockRejectedValueOnce(new Error('shortcut save failed'))
      const wrapper = mount(SettingTools, { global: { stubs } })
      await flushPromises()
      const control = wrapper.get('[data-beta-feature="screenshot"] button')
      await control.trigger('click')
      await flushPromises()
      expect(wrapper.find('li[data-id="screenshot.tool.start"]').exists()).toBe(false)
      expect(control.attributes('aria-checked')).toBe('false')
      expect(control.attributes('disabled')).toBeUndefined()
    }
  )

  it('keeps an opted-in disabled shortcut editable so the user can restore it', async () => {
    state.appSetting.betaFeatures = { screenshot: true }
    state.shortcuts = [
      {
        ...mainShortcut('screenshot.tool.start', 'Alt+S', { state: 'disabled' }),
        meta: { creationTime: 0, modificationTime: 0, author: 'system', enabled: false }
      }
    ]
    const wrapper = await openLiveDialog()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+S')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    state.update.mockImplementation(async (_id, _accelerator, enabled) => {
      state.shortcuts[0].meta.enabled = enabled!
      state.shortcuts[0].status = { state: 'active' }
      return true
    })
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+S')
    expect(wrapper.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutsDialog.saveSuccess'
    )
  })

  it('hides local AI shortcuts unless the local AI feature is enabled', async () => {
    state.appSetting.localAiCli.enabled = false
    state.shortcuts.push(mainShortcut('local-ai-cli.quick-open', 'Alt+L', { state: 'active' }))
    expect(await statusTexts()).toEqual({ 'core.box.toggle': '' })
  })
})

describe('SettingTools live shortcut dialog races', () => {
  const id = 'local-ai-cli.quick-open'
  const originalKey = 'CommandOrControl+Shift+L'

  beforeEach(() => {
    state.platform.value = 'darwin'
    state.shortcuts = [
      mainShortcut(id, originalKey, { state: 'unavailable', reason: 'runtime-missing' })
    ]
  })

  it('updates the open dialog key, enablement and null-key status reasons without reopening', async () => {
    const wrapper = await openLiveDialog()
    const row = wrapper.get('.ShortcutDialog-Row')
    expect(row.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.localAiCliOff'
    )
    state.shortcuts = [
      mainShortcut(id, originalKey, { state: 'unavailable', reason: 'register-failed' })
    ]
    notifyShortcutChange()
    await flushPromises()
    expect(row.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.unavailable'
    )
    state.shortcuts = [
      {
        ...mainShortcut(id, 'Alt+J', { state: 'disabled' }),
        meta: { creationTime: 0, modificationTime: 0, author: 'system', enabled: false }
      }
    ]
    notifyShortcutChange()
    await flushPromises()
    expect(row.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+J')
    expect(row.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(row.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutsDialog.statusDisabled'
    )
    state.shortcuts = [
      mainShortcut(id, 'Alt+J', {
        state: 'conflict',
        reason: 'conflict-plugin',
        conflictWith: ['plugin.demo']
      })
    ]
    notifyShortcutChange()
    await flushPromises()
    expect(row.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    expect(row.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.conflictPlugin'
    )
  })

  it('discards an older event query after a newer query has rendered', async () => {
    const wrapper = await openLiveDialog()
    const older = deferred<ShortcutWithStatus[]>()
    const newer = deferred<ShortcutWithStatus[]>()
    state.getAll.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    notifyShortcutChange()
    notifyShortcutChange()
    newer.resolve([mainShortcut(id, 'Alt+N', { state: 'conflict', reason: 'conflict-system' })])
    await flushPromises()
    older.resolve([
      mainShortcut(id, originalKey, { state: 'unavailable', reason: 'runtime-missing' })
    ])
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(wrapper.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.conflictSystem'
    )
  })

  it('preserves a saving row while refreshing a different row and rejects queries spanning the save boundary', async () => {
    const otherId = 'core.test.other'
    state.shortcuts.push(mainShortcut(otherId, 'Alt+O', { state: 'active' }))
    const wrapper = await openLiveDialog()
    const oldRead = deferred<ShortcutWithStatus[]>()
    const duringSaveRead = deferred<ShortcutWithStatus[]>()
    state.getAll.mockReturnValueOnce(oldRead.promise)
    notifyShortcutChange()
    const save = deferred<boolean>()
    state.update.mockReturnValueOnce(save.promise)
    const rows = wrapper.findAll('.ShortcutDialog-Row')
    const savingRow = rows.find((row) => row.text().includes(id))!
    const otherRow = rows.find((row) => row.text().includes(otherId))!
    await savingRow.get('[role="switch"]').trigger('click')
    oldRead.resolve([
      mainShortcut(id, originalKey, { state: 'active' }),
      mainShortcut(otherId, 'Alt+O', { state: 'active' })
    ])
    await flushPromises()
    state.shortcuts[1] = mainShortcut(otherId, 'Alt+P', {
      state: 'conflict',
      reason: 'conflict-system'
    })
    notifyShortcutChange()
    await flushPromises()
    expect(savingRow.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(savingRow.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutsDialog.saving'
    )
    expect(otherRow.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+P')
    expect(otherRow.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.conflictSystem'
    )

    state.getAll.mockReturnValueOnce(duringSaveRead.promise)
    notifyShortcutChange()
    state.shortcuts[0] = {
      ...mainShortcut(id, 'Alt+N', { state: 'disabled' }),
      meta: { creationTime: 0, modificationTime: 0, author: 'system', enabled: false }
    }
    save.resolve(true)
    await flushPromises()
    expect(savingRow.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    duringSaveRead.resolve([
      mainShortcut(id, originalKey, { state: 'active' }),
      mainShortcut(otherId, 'Alt+O', { state: 'active' })
    ])
    await flushPromises()
    expect(savingRow.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(savingRow.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(savingRow.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutsDialog.saveSuccess'
    )
  })

  it.each(['key', 'enabled'] as const)(
    'an older rejected %s save cannot overwrite a newer successful choice',
    async (field) => {
      const wrapper = await openLiveDialog()
      const older = deferred<boolean>()
      const newer = deferred<boolean>()
      state.update.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
      if (field === 'key') {
        await wrapper.get('.shortcut-key').setValue('Alt+O')
        await wrapper.get('.shortcut-key').setValue('Alt+N')
      } else {
        await wrapper.get('[role="switch"]').trigger('click')
        await wrapper.get('[role="switch"]').trigger('click')
      }
      older.resolve(false)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe(
        field === 'key' ? 'Alt+N' : originalKey
      )
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('.ShortcutDialog-StatusText').text()).toBe(
        'settingTools.shortcutsDialog.saving'
      )
      if (field === 'key') state.shortcuts[0].accelerator = 'Alt+N'
      state.shortcuts[0].meta.enabled = true
      newer.resolve(true)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe(
        field === 'key' ? 'Alt+N' : originalKey
      )
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('.ShortcutDialog-StatusText').text()).toBe(
        'settingTools.shortcutsDialog.saveSuccess'
      )
    }
  )

  it.each(['false', 'throw'] as const)(
    'a current save %s restores the selected key and shows failure rather than success',
    async (failure) => {
      const wrapper = await openLiveDialog()
      if (failure === 'false') state.update.mockResolvedValueOnce(false)
      else state.update.mockRejectedValueOnce(new Error('save failed'))
      await wrapper.get('.shortcut-key').setValue('Alt+X')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('.shortcut-key').element.value).toBe(originalKey)
      expect(wrapper.get('.ShortcutDialog-StatusText').text()).toBe(
        'settingTools.shortcutsDialog.saveFailed'
      )
    }
  )

  it('unsubscribes on unmount and does not send old query/save results into the next dialog', async () => {
    const old = await openLiveDialog()
    const read = deferred<ShortcutWithStatus[]>()
    const save = deferred<boolean>()
    state.getAll.mockReturnValueOnce(read.promise)
    notifyShortcutChange()
    state.update.mockReturnValueOnce(save.promise)
    await old.get('.shortcut-key').setValue('Alt+O')
    expect(state.listeners.size).toBe(1)
    old.unmount()
    expect(state.listeners.size).toBe(0)
    state.shortcuts = [mainShortcut(id, 'Alt+N', { state: 'conflict', reason: 'conflict-system' })]
    const current = await openLiveDialog()
    read.resolve([mainShortcut(id, originalKey, { state: 'active' })])
    save.reject(new Error('unmounted save failed'))
    await flushPromises()
    notifyShortcutChange()
    await flushPromises()
    expect(current.get<HTMLInputElement>('.shortcut-key').element.value).toBe('Alt+N')
    expect(current.get('.ShortcutDialog-StatusText').text()).toBe(
      'settingTools.shortcutStatus.conflictSystem'
    )
    current.unmount()
    expect(state.listeners.size).toBe(0)
  })
})
