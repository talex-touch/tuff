// @vitest-environment jsdom
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { SentryEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

/**
 * The telemetry consent group mounted whole, with only its boundaries stubbed: the transport that
 * reads/writes `sentry-config.json` and reads the upload stats, the auth state, and the toast.
 * Under test is the page: the stored document decides the switches, the upload switch writes the
 * whole document back through the storage channel main subscribes to, and anonymous mode is
 * inert while signed out.
 */

const transport = vi.hoisted(() => ({ send: vi.fn() }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
const openExternal = vi.hoisted(() => vi.fn(async () => {}))
const auth = vi.hoisted(() => ({ isLoggedIn: null as unknown }))

vi.hoisted(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transport
}))
vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ openExternal })
}))
vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: auth.isLoggedIn })
}))
vi.mock('~/modules/auth/auth-env', () => ({
  getAuthBaseUrl: () => 'https://nexus.test'
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    te: () => true,
    locale: { value: 'en-US' }
  })
}))
vi.mock('vue-sonner', () => ({ toast }))

import SettingSentry from './SettingSentry.vue'

const GET = StorageEvents.app.get.toEventName()
const SAVE = StorageEvents.app.save.toEventName()
const STATS = SentryEvents.api.getTelemetryStats.toEventName()

const stats = {
  searchCount: 52,
  bufferSize: 0,
  lastUploadTime: 1791301831490,
  totalUploads: 410,
  failedUploads: 36,
  lastFailureAt: 1790673401054,
  lastFailureMessage: 'NETWORK_TIMEOUT',
  apiBase: 'https://nexus.test',
  isEnabled: true,
  isAnonymous: false
}

const mounted: VueWrapper[] = []

function installTransport(config: { enabled?: boolean; anonymous?: boolean } | null) {
  const saves: unknown[] = []
  transport.send.mockImplementation(async (event: { toEventName(): string }, payload?: unknown) => {
    const name = event.toEventName()
    if (name === GET) return config
    if (name === SAVE) {
      saves.push(payload)
      return { success: true, version: saves.length }
    }
    if (name === STATS) return stats
    throw new Error(`unexpected transport event ${name}`)
  })
  return saves
}

async function mountGroup(): Promise<VueWrapper> {
  const wrapper = mount(SettingSentry, {
    attachTo: document.body,
    global: { stubs: { teleport: true } }
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function switchButton(wrapper: VueWrapper, testId: string) {
  return wrapper.find(`[data-testid="${testId}"] button[role="switch"]`)
}

beforeEach(() => {
  transport.send.mockReset()
  toast.error.mockReset()
  toast.success.mockReset()
  auth.isLoggedIn = ref(true)
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('SettingSentry', () => {
  it('renders the stored document: both switches on, identity notice, and the upload status', async () => {
    installTransport({ enabled: true, anonymous: false })
    const wrapper = await mountGroup()

    expect(switchButton(wrapper, 'telemetry-upload-switch').attributes('aria-checked')).toBe('true')
    expect(switchButton(wrapper, 'telemetry-anonymous-switch').attributes('aria-checked')).toBe(
      'false'
    )
    expect(wrapper.find('[data-testid="telemetry-identity-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="telemetry-total-uploads"]').text()).toBe('410')
    expect(wrapper.find('[data-testid="telemetry-failed-uploads"]').text()).toBe('36')
    expect(wrapper.find('[data-testid="telemetry-last-failure"]').text()).toContain(
      'NETWORK_TIMEOUT'
    )
    expect(transport.send).toHaveBeenCalledWith(StorageEvents.app.get, {
      key: 'sentry-config.json'
    })
  })

  it('treats a missing document as the documented default: enabled, not anonymous', async () => {
    installTransport(null)
    const wrapper = await mountGroup()

    expect(switchButton(wrapper, 'telemetry-upload-switch').attributes('aria-checked')).toBe('true')
    expect(switchButton(wrapper, 'telemetry-anonymous-switch').attributes('aria-checked')).toBe(
      'false'
    )
  })

  it('turning upload off writes the whole document through the storage channel and hides the rest', async () => {
    const saves = installTransport({ enabled: true, anonymous: true })
    const wrapper = await mountGroup()

    await switchButton(wrapper, 'telemetry-upload-switch').trigger('click')
    await flushPromises()

    expect(saves).toEqual([
      {
        key: 'sentry-config.json',
        value: { enabled: false, anonymous: true },
        force: true,
        persist: true
      }
    ])
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(switchButton(wrapper, 'telemetry-upload-switch').attributes('aria-checked')).toBe(
      'false'
    )
    expect(wrapper.find('[data-testid="telemetry-anonymous-switch"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="telemetry-total-uploads"]').exists()).toBe(false)
  })

  it('anonymous mode writes alongside the unchanged upload switch while signed in', async () => {
    const saves = installTransport({ enabled: true, anonymous: false })
    const wrapper = await mountGroup()

    await switchButton(wrapper, 'telemetry-anonymous-switch').trigger('click')
    await flushPromises()

    expect(saves).toEqual([
      {
        key: 'sentry-config.json',
        value: { enabled: true, anonymous: true },
        force: true,
        persist: true
      }
    ])
    expect(switchButton(wrapper, 'telemetry-anonymous-switch').attributes('aria-checked')).toBe(
      'true'
    )
    expect(wrapper.find('[data-testid="telemetry-identity-notice"]').exists()).toBe(false)
  })

  it('anonymous mode is disabled and shows the sign-in hint while signed out', async () => {
    auth.isLoggedIn = ref(false) as Ref<boolean>
    const saves = installTransport({ enabled: true, anonymous: true })
    const wrapper = await mountGroup()

    const anonymousSwitch = switchButton(wrapper, 'telemetry-anonymous-switch')
    expect(anonymousSwitch.attributes('disabled')).toBeDefined()
    // Stored anonymous=true has no effect while signed out, and the row says why.
    expect(anonymousSwitch.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('[data-testid="telemetry-anonymous-switch"]').text()).toContain(
      'settingSentry.anonymousLoginRequired'
    )
    expect(wrapper.find('[data-testid="telemetry-identity-notice"]').exists()).toBe(false)

    await anonymousSwitch.trigger('click')
    await flushPromises()
    expect(saves).toEqual([])
  })

  it('keeps the switch where it was and reports the failure when the write is rejected', async () => {
    installTransport({ enabled: true, anonymous: false })
    transport.send.mockImplementation(async (event: { toEventName(): string }) => {
      const name = event.toEventName()
      if (name === GET) return { enabled: true, anonymous: false }
      if (name === SAVE) return { success: false, version: 0, reason: 'invalid-key' }
      if (name === STATS) return stats
      throw new Error(`unexpected transport event ${name}`)
    })
    const wrapper = await mountGroup()

    await switchButton(wrapper, 'telemetry-upload-switch').trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(switchButton(wrapper, 'telemetry-upload-switch').attributes('aria-checked')).toBe('true')
  })
})
