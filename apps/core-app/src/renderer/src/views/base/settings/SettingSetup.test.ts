// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingSetup from './SettingSetup.vue'

const state = vi.hoisted(() => {
  // Vitest hoists this factory above ESM imports, so Vue must be loaded synchronously here.

  const { reactive, ref } = require('vue') as typeof import('vue')
  return {
    appSetting: reactive({
      dev: { advancedSettings: false },
      setup: {
        fileAccess: false,
        fileAccessRootKey: '',
        accessibility: false,
        notifications: false,
        microphone: false,
        autoStart: false,
        showTray: true,
        adminPrivileges: false,
        hideDock: false,
        runAsAdmin: false,
        customDesktop: false,
        lastPermissionAudit: { at: 0, version: '', appUpdate: false, missing: [] }
      },
      window: {
        closeToTray: true,
        startMinimized: false,
        startSilent: false
      },
      omniPanel: {
        enableShortcut: false,
        enableMouseLongPress: true,
        mouseLongPressDurationMs: 600,
        autoMountFirstFeatureOnPluginInstall: false,
        featureHub: { items: [] }
      }
    }),
    isMac: ref(true),
    isWindows: ref(false),
    isLinux: ref(false),
    getTraySettings: vi.fn(async () => ({
      available: true,
      showTray: true,
      hideDock: false,
      trayReady: true,
      windowVisible: true
    }))
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useNotificationSdk: () => ({ notify: vi.fn(async () => undefined) }),
  useSettingsSdk: () => ({
    system: {
      getAutoStart: vi.fn(async () => false),
      getTraySettings: state.getTraySettings,
      updateAutoStart: vi.fn(async (value: boolean) => value),
      updateTraySettings: vi.fn(async () => ({
        available: true,
        showTray: true,
        hideDock: false,
        trayReady: true,
        windowVisible: true
      }))
    },
    appIndex: {
      getSettings: vi.fn(async () => ({ hideNoisySystemApps: true })),
      updateSettings: vi.fn(async () => ({ hideNoisySystemApps: true }))
    }
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: vi.fn(async () => ({ status: 'granted', canRequest: false }))
  })
}))

vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  defineEvent: () => ({
    module: () => ({
      event: () => ({
        define: () => 'system:permission'
      })
    })
  })
}))

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting: state.appSetting }))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    isMac: state.isMac,
    isWindows: state.isWindows,
    isLinux: state.isLinux
  })
}))
vi.mock('~/modules/system/system-permission-refresh', () => ({
  waitForPermissionGrant: vi.fn(async () => undefined)
}))
vi.mock('~/composables/useFileAccessPermission', () => ({
  useFileAccessPermission: () => ({ check: vi.fn(async () => undefined) })
}))
vi.mock('~/composables/usePermissionAutoRefresh', () => ({
  usePermissionAutoRefresh: vi.fn()
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn() })
}))

function resetState(): void {
  state.appSetting.dev.advancedSettings = false
  Object.assign(state.appSetting.setup, {
    hideDock: false,
    autoStart: false,
    showTray: true,
    runAsAdmin: false,
    customDesktop: false
  })
  Object.assign(state.appSetting.window, {
    closeToTray: true,
    startMinimized: false,
    startSilent: false
  })
  Object.assign(state.appSetting.omniPanel, {
    enableShortcut: false,
    enableMouseLongPress: true,
    mouseLongPressDurationMs: 600,
    autoMountFirstFeatureOnPluginInstall: false,
    featureHub: { items: [] }
  })
  state.isMac.value = true
  state.isWindows.value = false
  state.isLinux.value = false
  state.getTraySettings.mockResolvedValue({
    available: true,
    showTray: true,
    hideDock: false,
    trayReady: true,
    windowVisible: true
  })
}

function mountSettingSetup() {
  return mount(SettingSetup, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          template: '<div><span>{{ title }}</span><slot name="tags" /><slot /></div>',
          props: ['title']
        },
        TuffBlockSwitch: {
          template: '<label><span>{{ title }}</span><slot name="tags" /></label>',
          props: ['modelValue', 'title']
        },
        TuffStatusBadge: { template: '<span />' },
        TuffMacOSTag: { template: '<span>mac-tag</span>' },
        TuffWindowsTag: { template: '<span />' },
        TuffLinuxTag: { template: '<span />' },
        TuffBetaTag: { template: '<span />' },
        TxButton: { template: '<button><slot /></button>' }
      }
    }
  })
}

describe('settingSetup advanced settings boundary', () => {
  beforeEach(() => {
    resetState()
  })

  it('shows hide Dock, silent start, and OmniPanel auto-mount only in advanced settings', async () => {
    const wrapper = mountSettingSetup()
    await flushPromises()

    expect(wrapper.text()).not.toContain('settings.setup.hideDock')
    expect(wrapper.text()).not.toContain('settings.setup.startSilent')
    expect(wrapper.text()).not.toContain('settings.setup.omniAutoMountFeature')

    state.appSetting.dev.advancedSettings = true
    await nextTick()

    expect(wrapper.text()).toContain('settings.setup.hideDock')
    expect(wrapper.text()).toContain('settings.setup.startSilent')
    expect(wrapper.text()).toContain('settings.setup.omniAutoMountFeature')

    wrapper.unmount()
  })

  it('keeps hide Dock behind both macOS and tray capability gates', async () => {
    state.appSetting.dev.advancedSettings = true
    state.getTraySettings.mockResolvedValueOnce({
      available: false,
      showTray: true,
      hideDock: false,
      trayReady: false,
      windowVisible: true
    })
    const unavailableWrapper = mountSettingSetup()
    await flushPromises()

    expect(unavailableWrapper.text()).not.toContain('settings.setup.hideDock')
    expect(unavailableWrapper.text()).toContain('settings.setup.startSilent')
    unavailableWrapper.unmount()

    resetState()
    state.appSetting.dev.advancedSettings = true
    state.isMac.value = false
    const nonMacWrapper = mountSettingSetup()
    await flushPromises()

    expect(nonMacWrapper.text()).not.toContain('settings.setup.hideDock')
    expect(nonMacWrapper.text()).toContain('settings.setup.startSilent')
    nonMacWrapper.unmount()
  })

  it('defaults only missing target booleans to true and preserves explicit false', async () => {
    delete (state.appSetting.setup as { hideDock?: boolean }).hideDock
    delete (state.appSetting.window as { startSilent?: boolean }).startSilent
    delete (state.appSetting.omniPanel as { autoMountFirstFeatureOnPluginInstall?: boolean })
      .autoMountFirstFeatureOnPluginInstall

    const missingWrapper = mountSettingSetup()
    await flushPromises()

    expect(state.appSetting.setup.hideDock).toBe(true)
    expect(state.appSetting.window.startSilent).toBe(true)
    expect(state.appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall).toBe(true)
    missingWrapper.unmount()

    resetState()
    const falseWrapper = mountSettingSetup()
    await flushPromises()

    expect(state.appSetting.setup.hideDock).toBe(false)
    expect(state.appSetting.window.startSilent).toBe(false)
    expect(state.appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall).toBe(false)
    falseWrapper.unmount()
  })
})
