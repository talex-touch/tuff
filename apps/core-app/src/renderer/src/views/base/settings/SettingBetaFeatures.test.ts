// @vitest-environment jsdom
import type {
  HerdrBinaryInfo,
  HerdrConnectionState,
  HerdrOwnership,
  HerdrRuntimeSnapshot
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import SettingBetaFeatures from './SettingBetaFeatures.vue'

enableAutoUnmount(afterEach)

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

const appSettingMock = vi.hoisted(() => ({
  betaFeatures: {
    screenshot: false,
    voiceDictation: false,
    voiceQuickEdit: false,
    omniPanel: false,
    browserWorkspace: false,
    herdrRuntime: true
  },
  herdrCore: {
    autoStart: true,
    socketPath: '',
    session: 'default',
    binaryPath: ''
  }
}))

const herdrMocks = vi.hoisted(() => ({
  reconnect: vi.fn(async () => ({})),
  ensureStarted: vi.fn(async () => ({}))
}))

const connectionRef = ref<HerdrConnectionState>('connected')
const ownershipRef = ref<HerdrOwnership>('external')
const snapshotRef = ref<HerdrRuntimeSnapshot | null>(null)

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: reactive(appSettingMock)
}))

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => ({
    connection: connectionRef,
    ownership: ownershipRef,
    snapshot: snapshotRef,
    reconnect: herdrMocks.reconnect,
    ensureStarted: herdrMocks.ensureStarted
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }
}))

function makeSnapshotWithBinary(binary: HerdrBinaryInfo): HerdrRuntimeSnapshot {
  return {
    revision: 1,
    seq: 1,
    enabled: true,
    connection: connectionRef.value,
    ownership: ownershipRef.value,
    socketPath: '/tmp/herdr.sock',
    session: 'default',
    binaryPath: binary.path,
    binary,
    error: null,
    core: null,
    sessions: [],
    machines: [],
    templates: [],
    updatedAt: 1000
  }
}

describe('SettingBetaFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appSettingMock.betaFeatures.browserWorkspace = false
    appSettingMock.betaFeatures.herdrRuntime = true
    appSettingMock.herdrCore.autoStart = true
    appSettingMock.herdrCore.socketPath = ''
    appSettingMock.herdrCore.session = 'default'
    appSettingMock.herdrCore.binaryPath = ''
    connectionRef.value = 'connected'
    ownershipRef.value = 'external'
    snapshotRef.value = null
  })

  it('renders browserWorkspace and herdrRuntime (default ON) feature switches', () => {
    const wrapper = mount(SettingBetaFeatures)
    expect(wrapper.find('[data-testid="beta-feature-browser-workspace"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="beta-feature-herdr-runtime"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('settings.betaFeatures.browserWorkspace.title')
    expect(wrapper.text()).toContain('settings.betaFeatures.herdrRuntime.title')
  })

  it('updates appSetting.betaFeatures.browserWorkspace and herdrRuntime when toggled', async () => {
    const wrapper = mount(SettingBetaFeatures)
    const switches = wrapper.findAllComponents({ name: 'TuffBlockSwitch' })
    const browserSwitch = switches.find(
      (comp) => comp.attributes('data-testid') === 'beta-feature-browser-workspace'
    )
    const herdrSwitch = switches.find(
      (comp) => comp.attributes('data-testid') === 'beta-feature-herdr-runtime'
    )

    expect(browserSwitch).toBeDefined()
    expect(herdrSwitch).toBeDefined()
    expect(herdrSwitch!.props('modelValue')).toBe(true)

    browserSwitch!.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(appSettingMock.betaFeatures.browserWorkspace).toBe(true)

    herdrSwitch!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(appSettingMock.betaFeatures.herdrRuntime).toBe(false)
  })

  it('renders live herdr connection status pills across all connection and ownership states', async () => {
    const wrapper = mount(SettingBetaFeatures)

    expect(wrapper.find('[data-testid="herdr-connection-status"]').text()).toContain(
      'settings.herdrCore.status.connectedExternal'
    )

    ownershipRef.value = 'managed'
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-connection-status"]').text()).toContain(
      'settings.herdrCore.status.connectedManaged'
    )

    connectionRef.value = 'fallback-pty'
    ownershipRef.value = 'none'
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-connection-status"]').text()).toContain(
      'settings.herdrCore.status.fallbackPty'
    )

    connectionRef.value = 'unavailable'
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-connection-status"]').text()).toContain(
      'settings.herdrCore.status.unavailable'
    )
  })

  it('renders binary runtime source badges, detected version, resolved path, and missing-binary install hint', async () => {
    snapshotRef.value = makeSnapshotWithBinary({
      source: 'system',
      path: '/usr/local/bin/herdr-core',
      version: '0.1.21',
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: null
    })

    const wrapper = mount(SettingBetaFeatures)
    expect(wrapper.find('[data-testid="herdr-binary-source-badge"]').text()).toContain(
      'settings.herdrCore.binary.source.system'
    )
    expect(wrapper.find('[data-testid="herdr-binary-version"]').text()).toBe('v0.1.21')
    const pathEl = wrapper.find('[data-testid="herdr-binary-path"]')
    expect(pathEl.text()).toBe('/usr/local/bin/herdr-core')
    expect(pathEl.attributes('title')).toBe('/usr/local/bin/herdr-core')
    expect(wrapper.find('[data-testid="herdr-binary-missing-hint"]').exists()).toBe(false)

    // Bundled / packaged-resource binary state.
    snapshotRef.value = makeSnapshotWithBinary({
      source: 'packaged-resource',
      path: '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core',
      version: 'v0.1.22',
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: null
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-binary-source-badge"]').text()).toContain(
      'settings.herdrCore.binary.source.packagedResource'
    )
    expect(wrapper.find('[data-testid="herdr-binary-version"]').text()).toBe('v0.1.22')
    expect(wrapper.find('[data-testid="herdr-binary-missing-hint"]').exists()).toBe(false)

    // Missing binary shows non-alarmist install hint and install command.
    snapshotRef.value = makeSnapshotWithBinary({
      source: 'missing',
      path: null,
      version: null,
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: 'brew install herdr-core'
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="herdr-binary-source-badge"]').text()).toContain(
      'settings.herdrCore.binary.source.missing'
    )
    expect(wrapper.find('[data-testid="herdr-binary-version"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="herdr-binary-path"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="herdr-binary-missing-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="herdr-binary-install-cmd"]').text()).toBe(
      'brew install herdr-core'
    )
  })

  it('updates herdrCore autoStart, binaryPath, socketPath, session and forwards cleared overrides to ensureStarted', async () => {
    const wrapper = mount(SettingBetaFeatures)

    const autoStartSwitch = wrapper
      .findAllComponents({ name: 'TuffBlockSwitch' })
      .find((comp) => comp.attributes('data-testid') === 'herdr-autostart-switch')
    expect(autoStartSwitch).toBeDefined()
    autoStartSwitch!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(appSettingMock.herdrCore.autoStart).toBe(false)

    const inputs = wrapper.findAllComponents({ name: 'TuffBlockInput' })
    const binaryInput = inputs.find(
      (comp) => comp.attributes('data-testid') === 'herdr-binary-path-input'
    )
    const socketInput = inputs.find(
      (comp) => comp.attributes('data-testid') === 'herdr-socket-path-input'
    )
    const sessionInput = inputs.find(
      (comp) => comp.attributes('data-testid') === 'herdr-session-input'
    )
    expect(binaryInput).toBeDefined()
    expect(socketInput).toBeDefined()
    expect(sessionInput).toBeDefined()

    binaryInput!.vm.$emit('update:modelValue', '/opt/custom/herdr-core')
    socketInput!.vm.$emit('update:modelValue', '/tmp/custom-hc.sock')
    sessionInput!.vm.$emit('update:modelValue', 'work')
    await flushPromises()
    expect(appSettingMock.herdrCore.binaryPath).toBe('/opt/custom/herdr-core')
    expect(appSettingMock.herdrCore.socketPath).toBe('/tmp/custom-hc.sock')
    expect(appSettingMock.herdrCore.session).toBe('work')

    await wrapper.find('[data-testid="herdr-reconnect-btn"]').trigger('click')
    await flushPromises()
    expect(herdrMocks.reconnect).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-testid="herdr-ensure-started-btn"]').trigger('click')
    await flushPromises()
    expect(herdrMocks.ensureStarted).toHaveBeenCalledWith({
      forceBootstrap: true,
      socketPath: '/tmp/custom-hc.sock',
      session: 'work',
      binaryPath: '/opt/custom/herdr-core'
    })

    // Clearing socketPath & binaryPath forwards empty strings explicitly to clear stale overrides.
    binaryInput!.vm.$emit('update:modelValue', '')
    socketInput!.vm.$emit('update:modelValue', '')
    await flushPromises()
    expect(appSettingMock.herdrCore.binaryPath).toBe('')
    expect(appSettingMock.herdrCore.socketPath).toBe('')

    await wrapper.find('[data-testid="herdr-ensure-started-btn"]').trigger('click')
    await flushPromises()
    expect(herdrMocks.ensureStarted).toHaveBeenLastCalledWith({
      forceBootstrap: true,
      socketPath: '',
      session: 'work',
      binaryPath: ''
    })
  })
})
