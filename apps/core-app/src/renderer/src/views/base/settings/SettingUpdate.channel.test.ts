// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AppPreviewChannel } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingUpdate from './SettingUpdate.vue'

const mocks = vi.hoisted(() => {
  const { ref } = require('vue') as typeof import('vue')
  return {
    lifecycleSnapshot: ref(null as { phase: string } | null),
    checkApplicationUpgrade: vi.fn(),
    getUpdateSettings: vi.fn(),
    updateSettings: vi.fn(),
    getUpdateStatus: vi.fn(),
    getCachedRelease: vi.fn()
  }
})

vi.mock('@talex-touch/utils', () => ({
  AppPreviewChannel: {
    RELEASE: 'RELEASE',
    BETA: 'BETA'
  },
  DownloadModule: {
    APP_UPDATE: 'APP_UPDATE'
  }
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useDownloadSdk: () => ({
    onTaskCompleted: vi.fn(() => vi.fn())
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: vi.fn(() => vi.fn()),
    send: vi.fn(async () => null)
  })
}))

vi.mock('@talex-touch/utils/transport/events', () => ({
  AppEvents: {
    build: {
      statusUpdated: 'build:status-updated',
      getVerificationStatus: 'build:get-verification-status'
    }
  }
}))

vi.mock('@talex-touch/utils/transport/events/types', () => ({
  isBuildVerificationStatus: () => false
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<section v-if="modelValue"><slot /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/select', () => ({
  TxSelectItem: {
    props: ['value'],
    template: '<option :value="value"><slot /></option>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('~/components/tuff/TuffBlockSelect.vue', () => ({
  default: {
    name: 'TuffBlockSelect',
    props: ['modelValue', 'title', 'description', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><span>{{ title }}</span><select data-testid="channel-select" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select></label>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: {
    props: ['title', 'description'],
    template: '<section><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: {
    template: '<main><slot /></main>'
  }
}))

vi.mock('~/modules/hooks/useStartupInfo', () => ({
  useStartupInfo: () => ({
    startupInfo: { value: { version: '2.4.13' } }
  })
}))

vi.mock('~/modules/hooks/useUpdateRuntime', () => ({
  useUpdateRuntime: () => ({
    lifecycleSnapshot: mocks.lifecycleSnapshot,
    checkApplicationUpgrade: mocks.checkApplicationUpgrade,
    handleDownloadUpdate: vi.fn(),
    installDownloadedUpdate: vi.fn(),
    getUpdateSettings: mocks.getUpdateSettings,
    updateSettings: mocks.updateSettings,
    getUpdateStatus: mocks.getUpdateStatus,
    getCachedRelease: mocks.getCachedRelease
  })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({
    platform: { value: 'linux' },
    isMac: { value: false }
  })
}))

vi.mock('~/modules/preload/process-info', () => ({
  getPreloadProcessInfo: () => ({ arch: 'x64' })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    dev: { advancedSettings: false }
  }
}))

vi.mock('~/modules/update/GithubUpdateProvider', () => ({
  GithubUpdateProvider: class {
    getDownloadAssets(): never[] {
      return []
    }
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn()
  })
}))

function createSettings(updateChannel?: AppPreviewChannel) {
  return {
    enabled: true,
    frequency: 'everyday',
    updateChannel,
    autoDownload: true,
    installOnNormalQuit: true,
    rendererOverrideEnabled: false,
    ignoredVersions: []
  }
}

function mountSettingUpdate() {
  return mount(SettingUpdate, {
    global: {
      stubs: {
        TuffBlockSwitch: {
          props: ['modelValue', 'title', 'disabled'],
          template: '<div />'
        }
      }
    }
  })
}

describe('SettingUpdate channel selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lifecycleSnapshot.value = null
    mocks.getUpdateSettings.mockResolvedValue(createSettings())
    mocks.updateSettings.mockResolvedValue(undefined)
    mocks.checkApplicationUpgrade.mockResolvedValue(undefined)
    mocks.getUpdateStatus.mockResolvedValue(undefined)
    mocks.getCachedRelease.mockResolvedValue(null)
  })

  it('shows Release as the default channel for ordinary users', async () => {
    const wrapper = mountSettingUpdate()
    await flushPromises()

    const channelSelect = wrapper.get<HTMLSelectElement>('[data-testid="channel-select"]')
    expect(channelSelect.element.value).toBe(AppPreviewChannel.RELEASE)
    expect(channelSelect.text()).toContain('settings.settingUpdate.channels.release')
    expect(channelSelect.text()).toContain('settings.settingUpdate.channels.beta')
    // Check frequency used to hide behind the advanced flag; artboard `aRjnd` makes it a normal row.
    expect(wrapper.text()).toContain('settings.settingUpdate.frequencyTitle')

    wrapper.unmount()
  })

  it('offers install mode as one ordered choice instead of two switches', async () => {
    const wrapper = mountSettingUpdate()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('settings.settingUpdate.installMode.title')
    expect(text).toContain('settings.settingUpdate.installMode.manual')
    expect(text).toContain('settings.settingUpdate.installMode.immediate')
    // The two switches these replaced must be gone.
    expect(text).not.toContain('settings.settingUpdate.autoDownloadTitle')
    expect(text).not.toContain('settings.settingUpdate.installOnNormalQuitTitle')

    wrapper.unmount()
  })

  it('drops the eight-field lifecycle grid and the duplicate trust block', async () => {
    const wrapper = mountSettingUpdate()
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('settings.settingUpdate.lifecycle.fields.targetVersion')
    expect(text).not.toContain('settings.settingUpdate.lifecycle.fields.rollbackCompatible')
    expect(wrapper.findAll('.native-trust-status')).toHaveLength(0)
    // Diagnostics ship through a single export action rather than a copy/save pair.
    expect(text).toContain('settings.settingUpdate.exportEvidence')

    wrapper.unmount()
  })

  it('checks and refreshes the selected channel after saving', async () => {
    const wrapper = mountSettingUpdate()
    await flushPromises()

    await wrapper.get('[data-testid="channel-select"]').setValue(AppPreviewChannel.BETA)
    await flushPromises()

    expect(mocks.updateSettings).toHaveBeenCalledOnce()
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      updateChannel: AppPreviewChannel.BETA
    })
    expect(mocks.checkApplicationUpgrade).toHaveBeenCalledOnce()
    expect(mocks.checkApplicationUpgrade).toHaveBeenCalledWith(true)
    expect(mocks.updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkApplicationUpgrade.mock.invocationCallOrder[0]
    )
    expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2)
    expect(mocks.getCachedRelease).toHaveBeenNthCalledWith(1, AppPreviewChannel.RELEASE)
    expect(mocks.getCachedRelease).toHaveBeenNthCalledWith(2, AppPreviewChannel.BETA)

    wrapper.unmount()
  })

  it('rolls back the channel and skips checking when saving fails', async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error('save failed'))
    const wrapper = mountSettingUpdate()
    await flushPromises()

    const channelSelect = wrapper.get<HTMLSelectElement>('[data-testid="channel-select"]')
    await channelSelect.setValue(AppPreviewChannel.BETA)
    await flushPromises()

    expect(channelSelect.element.value).toBe(AppPreviewChannel.RELEASE)
    expect(mocks.checkApplicationUpgrade).not.toHaveBeenCalled()
    expect(mocks.getUpdateStatus).toHaveBeenCalledOnce()
    expect(mocks.getCachedRelease).toHaveBeenCalledOnce()
    expect(mocks.getCachedRelease).toHaveBeenCalledWith(AppPreviewChannel.RELEASE)

    wrapper.unmount()
  })

  it('disables channel changes and ignores emitted updates when checking is unavailable', async () => {
    mocks.lifecycleSnapshot.value = { phase: 'downloading' }
    const wrapper = mountSettingUpdate()
    await flushPromises()

    const channelSelect = wrapper.get('[data-testid="channel-select"]')
    expect(channelSelect.attributes('disabled')).toBeDefined()

    wrapper
      .findComponent({ name: 'TuffBlockSelect' })
      .vm.$emit('update:modelValue', AppPreviewChannel.BETA)
    await flushPromises()

    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(mocks.checkApplicationUpgrade).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
