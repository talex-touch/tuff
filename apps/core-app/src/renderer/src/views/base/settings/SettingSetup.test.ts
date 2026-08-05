// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps legacy implementation controls out of standard settings', async () => {
    state.appSetting.dev.advancedSettings = true
    // `resetState` leaves mac on; this case is explicitly the non-mac platforms.
    state.isMac.value = false
    state.isWindows.value = true
    state.isLinux.value = true
    const wrapper = mountSettingSetup()
    await flushPromises()

    expect(wrapper.text()).toContain('settings.setup.backgroundMode')
    expect(wrapper.text()).not.toContain('settings.setup.showTray')
    expect(wrapper.text()).not.toContain('settings.setup.customDesktop')
    expect(wrapper.text()).not.toContain('settings.setup.runAsAdmin')
    // Belong to plugins and file index respectively, not to startup behaviour.
    expect(wrapper.text()).not.toContain('settings.setup.omniAutoMountFeature')
    expect(wrapper.text()).not.toContain('settings.setup.hideNoisySystemApps')
    // macOS-only, and this case is Windows/Linux.
    expect(wrapper.text()).not.toContain('settings.setup.hideDock')

    wrapper.unmount()
  })

  it('shows the startup rows the artboard lists rather than hiding them behind a dead flag', async () => {
    // `showPermissionRecovery` and `showAdvancedSettings` were hardcoded `false`, so the whole
    // permission block and most of these switches never rendered at all.
    state.isMac.value = true
    const wrapper = mountSettingSetup()
    await flushPromises()

    expect(wrapper.text()).toContain('settings.setup.autoStart')
    expect(wrapper.text()).toContain('settings.setup.startSilent')
    expect(wrapper.text()).toContain('settings.setup.accessibility')
    expect(wrapper.text()).toContain('setupPermissions.fullDiskAccess')
    expect(wrapper.text()).toContain('setupPermissions.microphone')
    expect(wrapper.text()).toContain('settings.setup.notifications')

    wrapper.unmount()
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
