// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { CatalogPackDiagnostic, CatalogStatus } from '@talex-touch/utils/i18n'
import type { CatalogVoiceProviderSyncResponse } from '@talex-touch/utils/transport/events/types/catalog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as VueModule from 'vue'

const mocks = vi.hoisted(() => {
  const { ref } = require('vue') as typeof VueModule
  return {
    catalog: {
      getStatus: vi.fn(),
      checkUpdates: vi.fn(),
      sync: vi.fn(),
      rollback: vi.fn()
    },
    toast: {
      error: vi.fn(),
      success: vi.fn()
    },
    auth: {
      isLoggedIn: ref(true),
      signIn: vi.fn()
    }
  }
})

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: () => ({
    isLoggedIn: mocks.auth.isLoggedIn,
    signIn: mocks.auth.signIn,
    authLoadingState: { isSigningIn: false, isLoggingIn: false }
  })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useSettingsSdk: () => ({ catalog: mocks.catalog })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: {
    props: ['title', 'description'],
    template: '<section><span>{{ title }}</span><span>{{ description }}</span><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: {
    name: 'TuffGroupBlock',
    props: ['name', 'description'],
    template: '<main><span>{{ name }}</span><span>{{ description }}</span><slot /></main>'
  }
}))

vi.mock('vue-sonner', () => ({ toast: mocks.toast }))

// Every key stays a key: structural assertions must not be coupled to shipped copy.
vi.mock('vue-i18n', () => {
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        return params ? `${key}(${Object.values(params).join(',')})` : key
      }
    })
  }
})

import VoiceProviderCatalogSettings from './VoiceProviderCatalogSettings.vue'

const ACTIVE = '[data-testid="voice-provider-catalog-active"]'
const STATUS = '[data-testid="voice-provider-catalog-status"]'
const ROLLBACK_ROW = '[data-testid="voice-provider-catalog-rollback-row"]'
const REFRESH = '[data-testid="voice-provider-catalog-refresh"]'
const CHECK = '[data-testid="voice-provider-catalog-check"]'
const SYNC = '[data-testid="voice-provider-catalog-sync"]'
const LOGIN = '[data-testid="voice-provider-catalog-login"]'
const ROLLBACK = '[data-testid="voice-provider-catalog-rollback"]'

const PACK_ID = 'voice-provider.cloud'
const CHECKED_AT = 1_700_000_000_000
const CHECK_FAILED = 'settingSpeechRecognition.catalog.checkFailed'
const SYNC_FAILED = 'settingSpeechRecognition.catalog.syncFailed'
const LOGIN_REQUIRED = 'settingSpeechRecognition.catalog.loginRequiredDescription'
const NOT_CHECKED = 'settingSpeechRecognition.catalog.notCheckedDescription'
const CURRENT = 'settingSpeechRecognition.catalog.currentDescription'
const UP_TO_DATE = 'settingSpeechRecognition.catalog.upToDate'

// Values the UI must never surface: only the safe pack identity (packId, version, digest prefix) may
// reach the DOM. Key material and the raw envelope are never allowed out.
const PAYLOAD_SHA_CANARY = 'c'.repeat(64)
const SIGNATURE_CANARY = 'CANARY_RAW_SIGNATURE_BASE64'
const PAYLOAD_CANARY = 'CANARY_RAW_PAYLOAD_JSON'
const TOKEN_CANARY = 'CANARY_ACCESS_TOKEN'
const KEY_MATERIAL_CANARY = 'CANARY_ENVELOPE_SEALING_KEY'
const CANARIES = [
  PAYLOAD_SHA_CANARY,
  SIGNATURE_CANARY,
  PAYLOAD_CANARY,
  TOKEN_CANARY,
  KEY_MATERIAL_CANARY
]

function diagnostic(packId: string, version: string): CatalogPackDiagnostic {
  return {
    type: 'voice-provider',
    packId,
    version,
    payloadSha256: PAYLOAD_SHA_CANARY,
    source: 'remote',
    signatureStatus: 'verified',
    // Extra fields a leaky renderer could mistakenly surface.
    rawSignature: SIGNATURE_CANARY,
    payload: PAYLOAD_CANARY,
    accessToken: TOKEN_CANARY,
    sealingKeyMaterial: KEY_MATERIAL_CANARY
  } as unknown as CatalogPackDiagnostic
}

function statusOf(overrides: Partial<CatalogStatus> = {}): CatalogStatus {
  return {
    databaseAvailable: true,
    registrySource: 'sqlite',
    active: null,
    previous: null,
    lastCheckedAt: null,
    lastUpdatedAt: null,
    rollbackReason: null,
    lastErrorCode: null,
    ...overrides
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function mountCatalog(): Promise<VueWrapper> {
  const wrapper = mount(VoiceProviderCatalogSettings)
  await flushPromises()
  return wrapper
}

async function click(wrapper: VueWrapper, testId: string): Promise<void> {
  await wrapper.get(testId).trigger('click')
  await flushPromises()
}

function expectNoCanaries(wrapper: VueWrapper): void {
  const text = wrapper.text()
  for (const canary of CANARIES) {
    expect(text).not.toContain(canary)
  }
}

describe('VoiceProviderCatalogSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.isLoggedIn.value = true
  })

  it('projects the active pack version on load without leaking diagnostic payloads', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })

    const wrapper = await mountCatalog()

    const active = wrapper.get(ACTIVE)
    expect(active.text()).toContain('2.1.0')
    expect(active.text()).not.toContain(PACK_ID)
    expectNoCanaries(wrapper)
    expect(wrapper.findAll(ROLLBACK_ROW)).toHaveLength(0)

    wrapper.unmount()
  })

  it('offers rollback only when the status carries a previous pack', async () => {
    mocks.catalog.getStatus.mockResolvedValueOnce({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    const withoutPrevious = await mountCatalog()
    expect(withoutPrevious.findAll(ROLLBACK_ROW)).toHaveLength(0)
    withoutPrevious.unmount()

    mocks.catalog.getStatus.mockResolvedValueOnce({
      status: statusOf({
        active: diagnostic(PACK_ID, '2.1.0'),
        previous: diagnostic(PACK_ID, '1.4.0')
      })
    })
    const withPrevious = await mountCatalog()
    const row = withPrevious.get(ROLLBACK_ROW)
    expect(row.text()).toContain(PACK_ID)
    expect(row.text()).toContain('1.4.0')
    expect(row.text()).not.toContain('2.1.0')
    withPrevious.unmount()
  })

  it('only claims the catalogue is current after a completed check', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    mocks.catalog.checkUpdates.mockResolvedValue({
      outcome: 'no-update',
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0'), lastCheckedAt: CHECKED_AT }),
      candidate: null,
      errorCode: null
    })

    const wrapper = await mountCatalog()

    const untouched = wrapper.get(STATUS).text()
    expect(untouched).toContain(NOT_CHECKED)
    expect(untouched).not.toContain(CURRENT)
    expect(mocks.toast.success).not.toHaveBeenCalled()

    await click(wrapper, CHECK)

    const checked = wrapper.get(STATUS).text()
    expect(checked).toContain(CURRENT)
    expect(checked).not.toContain(NOT_CHECKED)
    expect(mocks.toast.success).toHaveBeenCalledWith(UP_TO_DATE)

    wrapper.unmount()
  })

  it('renders the checked candidate version instead of the active pack when an update exists', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    mocks.catalog.checkUpdates.mockResolvedValue({
      outcome: 'update-available',
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0'), lastCheckedAt: CHECKED_AT }),
      candidate: diagnostic(PACK_ID, '3.0.0'),
      errorCode: null
    })

    const wrapper = await mountCatalog()
    await click(wrapper, CHECK)

    expect(mocks.catalog.checkUpdates).toHaveBeenCalledTimes(1)
    const status = wrapper.get(STATUS)
    expect(status.text()).toContain('3.0.0')
    expect(status.text()).not.toContain(PACK_ID)
    expect(status.text()).not.toContain('2.1.0')
    expectNoCanaries(wrapper)

    wrapper.unmount()
  })

  it('syncs once and replaces the active pack with the returned status', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    mocks.catalog.sync.mockResolvedValue({
      outcome: 'activated',
      status: statusOf({ active: diagnostic(PACK_ID, '3.0.0'), lastCheckedAt: CHECKED_AT }),
      activated: diagnostic(PACK_ID, '3.0.0'),
      errorCode: null
    })

    const wrapper = await mountCatalog()
    expect(wrapper.get(ACTIVE).text()).toContain('2.1.0')

    await click(wrapper, SYNC)

    expect(mocks.catalog.sync).toHaveBeenCalledTimes(1)
    expect(mocks.catalog.sync).toHaveBeenCalledWith()
    expect(wrapper.get(ACTIVE).text()).toContain('3.0.0')
    expect(wrapper.get(ACTIVE).text()).not.toContain('2.1.0')

    wrapper.unmount()
  })

  it('rolls back with the manual reason and shows the returned active pack', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({
        active: diagnostic(PACK_ID, '3.0.0'),
        previous: diagnostic(PACK_ID, '2.1.0')
      })
    })
    mocks.catalog.rollback.mockResolvedValue({
      outcome: 'rolled-back',
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0'), lastCheckedAt: CHECKED_AT }),
      errorCode: null
    })

    const wrapper = await mountCatalog()
    expect(wrapper.findAll(ROLLBACK_ROW)).toHaveLength(1)

    await click(wrapper, ROLLBACK)

    expect(mocks.catalog.rollback).toHaveBeenCalledTimes(1)
    expect(mocks.catalog.rollback).toHaveBeenCalledWith({ reason: 'manual' })
    expect(wrapper.get(ACTIVE).text()).toContain('2.1.0')
    expect(wrapper.findAll(ROLLBACK_ROW)).toHaveLength(0)

    wrapper.unmount()
  })

  it('keeps the returned active pack and surfaces the error code when a check fails', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    mocks.catalog.checkUpdates.mockResolvedValue({
      outcome: 'failed',
      status: statusOf({
        active: diagnostic(PACK_ID, '2.1.0'),
        lastErrorCode: 'CATALOG_SIGNATURE_INVALID'
      }),
      candidate: null,
      errorCode: 'CATALOG_SIGNATURE_INVALID'
    })

    const wrapper = await mountCatalog()
    await click(wrapper, CHECK)

    expect(wrapper.get(ACTIVE).text()).toContain('2.1.0')
    expect(wrapper.get(STATUS).text()).toContain('CATALOG_SIGNATURE_INVALID')
    expect(mocks.toast.error).toHaveBeenCalledWith(CHECK_FAILED)
    expectNoCanaries(wrapper)

    wrapper.unmount()
  })

  it('keeps the returned active pack and surfaces the error code when a sync fails', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    mocks.catalog.sync.mockResolvedValue({
      outcome: 'failed',
      status: statusOf({
        active: diagnostic(PACK_ID, '2.1.0'),
        lastErrorCode: 'CATALOG_ACTIVATION_FAILED'
      }),
      activated: null,
      errorCode: 'CATALOG_ACTIVATION_FAILED'
    })

    const wrapper = await mountCatalog()
    await click(wrapper, SYNC)

    expect(wrapper.get(ACTIVE).text()).toContain('2.1.0')
    expect(wrapper.get(STATUS).text()).toContain('CATALOG_ACTIVATION_FAILED')
    expect(mocks.toast.error).toHaveBeenCalledWith(SYNC_FAILED)

    wrapper.unmount()
  })

  it('gates remote controls behind sign-in and offers a working login', async () => {
    mocks.auth.isLoggedIn.value = false
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })

    const wrapper = await mountCatalog()

    expect(wrapper.get(STATUS).text()).toContain(LOGIN_REQUIRED)
    expect(wrapper.findAll(CHECK)).toHaveLength(0)
    expect(wrapper.findAll(SYNC)).toHaveLength(0)

    await click(wrapper, LOGIN)

    expect(mocks.auth.signIn).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('disables every catalog control while an operation is in flight', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })
    const pending = deferred<CatalogVoiceProviderSyncResponse>()
    mocks.catalog.sync.mockReturnValue(pending.promise)

    const wrapper = await mountCatalog()
    expect(wrapper.get(SYNC).attributes('disabled')).toBeUndefined()

    await wrapper.get(SYNC).trigger('click')

    expect(wrapper.get(CHECK).attributes('disabled')).toBeDefined()
    expect(wrapper.get(REFRESH).attributes('disabled')).toBeDefined()
    expect(wrapper.get(SYNC).attributes('disabled')).toBeDefined()

    pending.resolve({
      outcome: 'no-update',
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0'), lastCheckedAt: CHECKED_AT }),
      activated: null,
      errorCode: null
    })
    await flushPromises()

    expect(wrapper.get(CHECK).attributes('disabled')).toBeUndefined()
    expect(wrapper.get(SYNC).attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })
})
