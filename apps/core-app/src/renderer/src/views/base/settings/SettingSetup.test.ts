// @vitest-environment jsdom
import type { VueWrapper } from '@vue/test-utils'
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
    })),
    notify: vi.fn(async () => undefined),
    /** Answer per permission type for the `system:permission:check` probe. */
    permissionChecks: {} as Record<
      string,
      { status: string; canRequest: boolean; message?: string }
    >,
    /** Permission types the page asked the main process to open system settings for. */
    requestedPermissions: [] as string[],
    transportSend: vi.fn()
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useNotificationSdk: () => ({ notify: state.notify }),
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
  useTuffTransport: () => ({ send: state.transportSend })
}))

vi.mock('@talex-touch/utils/transport/event/builder', () => ({
  // The real builder hands back an identifier encoding namespace/module/event; the page needs
  // `check` and `request` to stay distinguishable so this mock must not collapse them.
  defineEvent: (namespace: string) => ({
    module: (moduleName: string) => ({
      event: (eventName: string) => ({
        define: () => `${namespace}:${moduleName}:${eventName}`
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
  state.notify.mockClear()
  state.permissionChecks = {}
  state.requestedPermissions = []
  state.transportSend.mockReset()
  state.transportSend.mockImplementation(async (event: string, permissionType: string) => {
    if (event === 'system:permission:request') {
      state.requestedPermissions.push(permissionType)
      return true
    }
    return state.permissionChecks[permissionType] ?? { status: 'granted', canRequest: false }
  })
}

function mountSettingSetup() {
  return mount(SettingSetup, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          name: 'TuffBlockSlotStub',
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

describe('settingSetup notification permission actions', () => {
  beforeEach(() => {
    resetState()
  })

  function findPermissionRow(wrapper: VueWrapper, titleKey: string) {
    const row = wrapper
      .findAllComponents({ name: 'TuffBlockSlotStub' })
      .find((candidate) => candidate.text().includes(titleKey))
    if (!row) throw new Error(`permission row not rendered: ${titleKey}`)
    return row
  }

  it('offers both the system-settings deep link and a test notification while notifications are unverifiable', async () => {
    state.permissionChecks.notifications = { status: 'unverifiable', canRequest: true }
    const wrapper = mountSettingSetup()
    await flushPromises()

    const row = findPermissionRow(wrapper, 'settings.setup.notifications')
    const actions = row.findAll('button').map((button) => button.text())

    expect(actions).toEqual([
      'setupPermissions.statusUnverifiable · setupPermissions.openSettings',
      'setupPermissions.testNotification'
    ])

    wrapper.unmount()
  })

  it('asks the main process to open system settings for the notifications permission', async () => {
    state.permissionChecks.notifications = { status: 'unverifiable', canRequest: true }
    const wrapper = mountSettingSetup()
    await flushPromises()

    const row = findPermissionRow(wrapper, 'settings.setup.notifications')
    const openSettings = row
      .findAll('button')
      .find((button) => button.text().includes('setupPermissions.openSettings'))
    await openSettings!.trigger('click')
    await flushPromises()

    // The request must target notifications, not whichever row happens to be first.
    expect(state.requestedPermissions).toEqual(['notifications'])

    wrapper.unmount()
  })

  it('sends a system-channel notification when the test action is pressed', async () => {
    state.permissionChecks.notifications = { status: 'denied', canRequest: true }
    const wrapper = mountSettingSetup()
    await flushPromises()

    const row = findPermissionRow(wrapper, 'settings.setup.notifications')
    const testNotification = row
      .findAll('button')
      .find((button) => button.text().includes('setupPermissions.testNotification'))
    await testNotification!.trigger('click')
    await flushPromises()

    expect(state.notify).toHaveBeenCalledWith({
      channel: 'system',
      level: 'info',
      title: 'setupPermissions.testNotificationTitle',
      message: 'setupPermissions.testNotificationBody'
    })

    wrapper.unmount()
  })

  it('drops the notification actions once the permission is granted', async () => {
    // `canRequest` is deliberately left true: the granted status alone must retire the actions.
    state.permissionChecks.notifications = { status: 'granted', canRequest: true }
    const wrapper = mountSettingSetup()
    await flushPromises()

    const row = findPermissionRow(wrapper, 'settings.setup.notifications')

    expect(row.findAll('button')).toHaveLength(0)
    expect(state.appSetting.setup.notifications).toBe(true)

    wrapper.unmount()
  })

  it('keeps the full disk access row on the plain open-settings action', async () => {
    state.permissionChecks.fullDiskAccess = { status: 'unverifiable', canRequest: true }
    state.permissionChecks.notifications = { status: 'granted', canRequest: false }
    const wrapper = mountSettingSetup()
    await flushPromises()

    const row = findPermissionRow(wrapper, 'setupPermissions.fullDiskAccess')
    const actions = row.findAll('button').map((button) => button.text())
    expect(actions).toEqual(['setupPermissions.statusUnverifiable · setupPermissions.openSettings'])

    await row.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(state.requestedPermissions).toEqual(['fullDiskAccess'])

    wrapper.unmount()
  })
})
