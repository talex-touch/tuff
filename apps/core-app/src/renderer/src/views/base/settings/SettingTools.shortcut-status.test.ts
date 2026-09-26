// @vitest-environment jsdom
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingTools from './SettingTools.vue'

enableAutoUnmount(afterEach)

const state = vi.hoisted(() => {
  const { reactive, ref } = require('vue') as typeof import('vue')
  return {
    shortcuts: [] as ShortcutWithStatus[],
    platform: ref('darwin'),
    appSetting: reactive({
      coreBox: { customPlaceholder: '' },
      beginner: { init: true },
      dev: { advancedSettings: false },
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
  shortconApi: { getAll: vi.fn(async () => state.shortcuts) }
}))
vi.mock('~/modules/storage/app-storage', () => ({ appSetting: state.appSetting }))

/** Renders what the dialog is handed, one line per row: the status text is the contract here. */
const stubs = {
  TuffGroupBlock: { template: '<section><slot /></section>' },
  TuffBlockInput: { template: '<div><slot name="control" /></div>' },
  TuffBlockSlot: { template: '<div><slot /></div>' },
  TuffBlockSwitch: { template: '<div />' },
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
})
