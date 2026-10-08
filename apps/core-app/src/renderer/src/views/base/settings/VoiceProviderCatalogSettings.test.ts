// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { CatalogPackDiagnostic, CatalogStatus } from '@talex-touch/utils/i18n'
import type {
  CatalogVoiceProviderPackSummary,
  CatalogVoiceProviderStatusResponse,
  CatalogVoiceProviderSyncResponse
} from '@talex-touch/utils/transport/events/types/catalog'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as VueModule from 'vue'

const mocks = vi.hoisted(() => {
  const { ref } = require('vue') as typeof VueModule
  const statusListeners: Array<(snapshot: unknown) => void> = []
  return {
    statusListeners,
    catalog: {
      getStatus: vi.fn(),
      checkUpdates: vi.fn(),
      sync: vi.fn(),
      rollback: vi.fn(),
      onStatusChanged: vi.fn((listener: (snapshot: unknown) => void) => {
        statusListeners.push(listener)
        return () => {
          statusListeners.splice(statusListeners.indexOf(listener), 1)
        }
      })
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

vi.mock('@talex-touch/tuffex/tag', () => ({
  TxTag: {
    props: ['variant'],
    template: '<span :data-variant="variant"><slot /></span>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: {
    props: ['title', 'description'],
    template:
      '<section><span>{{ title }}</span><slot name="tags" /><span>{{ description }}</span><slot /></section>'
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
      locale: { value: 'en-US' },
      t: (key: string, params?: Record<string, unknown>) => {
        return params ? `${key}(${Object.values(params).join(',')})` : key
      }
    })
  }
})

import VoiceProviderCatalogSettings from './VoiceProviderCatalogSettings.vue'

const STATUS = '[data-testid="voice-provider-catalog-status"]'
const BADGE = '[data-testid="voice-provider-catalog-badge"]'
const ROLLBACK_ROW = '[data-testid="voice-provider-catalog-rollback-row"]'
const SYNC = '[data-testid="voice-provider-catalog-sync"]'
const LOGIN = '[data-testid="voice-provider-catalog-login"]'
const ROLLBACK = '[data-testid="voice-provider-catalog-rollback"]'

const PACK_ID = 'voice-provider.cloud'
const CHECKED_AT = 1_700_000_000_000
const SYNC_FAILED = 'settingSpeechRecognition.catalog.syncFailed'
const ACTIVATED = 'settingSpeechRecognition.catalog.activated'
const DOWNLOADED = 'settingSpeechRecognition.catalog.badge.downloaded'
const NOT_DOWNLOADED = 'settingSpeechRecognition.catalog.badge.notDownloaded'
const SYNCING = 'settingSpeechRecognition.catalog.badge.syncing'
const SIGNED_OUT = 'settingSpeechRecognition.catalog.signedOutDescription'
const SYNCING_DESCRIPTION = 'settingSpeechRecognition.catalog.syncingDescription'

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

function summary(): CatalogVoiceProviderPackSummary {
  return {
    payloadBytes: 1200,
    importedAt: CHECKED_AT,
    expiresAt: null,
    providers: [{ id: 'tuff-nexus-default', displayName: { default: 'Nexus Voice' } }]
  }
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

function snapshotOf(
  status: CatalogStatus,
  extra: Partial<CatalogVoiceProviderStatusResponse> = {}
): CatalogVoiceProviderStatusResponse {
  return { status, pack: status.active ? summary() : null, syncing: false, ...extra }
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

async function push(snapshot: CatalogVoiceProviderStatusResponse): Promise<void> {
  for (const listener of [...mocks.statusListeners]) listener(snapshot)
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
    mocks.statusListeners.length = 0
    mocks.auth.isLoggedIn.value = true
  })

  it('shows what is on this machine — name, version, size — without leaking diagnostics', async () => {
    mocks.catalog.getStatus.mockResolvedValue(
      snapshotOf(statusOf({ active: diagnostic(PACK_ID, '2.1.0') }))
    )

    const wrapper = await mountCatalog()

    const row = wrapper.get(STATUS)
    expect(row.text()).toContain('Nexus Voice')
    expect(row.text()).toContain('2.1.0')
    expect(row.text()).toContain('1.2 KB')
    expect(row.text()).not.toContain(PACK_ID)
    expect(wrapper.get(BADGE).text()).toBe(DOWNLOADED)
    expectNoCanaries(wrapper)
    expect(wrapper.findAll(ROLLBACK_ROW)).toHaveLength(0)

    wrapper.unmount()
  })

  it('still names the version when main sends no summary', async () => {
    mocks.catalog.getStatus.mockResolvedValue({
      status: statusOf({ active: diagnostic(PACK_ID, '2.1.0') })
    })

    const wrapper = await mountCatalog()

    expect(wrapper.get(STATUS).text()).toContain('2.1.0')
    expect(wrapper.get(STATUS).text()).not.toContain('KB')
    expect(wrapper.get(BADGE).text()).toBe(DOWNLOADED)

    wrapper.unmount()
  })

  it('offers rollback only when the status carries a previous pack', async () => {
    mocks.catalog.getStatus.mockResolvedValueOnce(
      snapshotOf(statusOf({ active: diagnostic(PACK_ID, '2.1.0') }))
    )
    const withoutPrevious = await mountCatalog()
    expect(withoutPrevious.findAll(ROLLBACK_ROW)).toHaveLength(0)
    withoutPrevious.unmount()

    mocks.catalog.getStatus.mockResolvedValueOnce(
      snapshotOf(
        statusOf({
          active: diagnostic(PACK_ID, '2.1.0'),
          previous: diagnostic(PACK_ID, '1.4.0')
        })
      )
    )
    const withPrevious = await mountCatalog()
    const row = withPrevious.get(ROLLBACK_ROW)
    expect(row.text()).toContain(PACK_ID)
    expect(row.text()).toContain('1.4.0')
    expect(row.text()).not.toContain('2.1.0')
    withPrevious.unmount()
  })

  it('follows the sync main runs on its own, such as the one after sign-in', async () => {
    mocks.catalog.getStatus.mockResolvedValue(snapshotOf(statusOf()))

    const wrapper = await mountCatalog()
    expect(wrapper.get(BADGE).text()).toBe(NOT_DOWNLOADED)

    await push(snapshotOf(statusOf({ lastCheckedAt: CHECKED_AT }), { syncing: true }))
    expect(wrapper.get(BADGE).text()).toBe(SYNCING)
    expect(wrapper.get(STATUS).text()).toContain(SYNCING_DESCRIPTION)
    expect(wrapper.get(SYNC).attributes('disabled')).toBeDefined()

    await push(snapshotOf(statusOf({ active: diagnostic(PACK_ID, '2.1.0') })))
    expect(wrapper.get(BADGE).text()).toBe(DOWNLOADED)
    expect(wrapper.get(STATUS).text()).toContain('2.1.0')
    expect(wrapper.get(SYNC).attributes('disabled')).toBeUndefined()
    expect(mocks.catalog.sync).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(mocks.statusListeners).toHaveLength(0)
  })

  it('syncs once and replaces the active pack with the returned status', async () => {
    mocks.catalog.getStatus.mockResolvedValue(
      snapshotOf(statusOf({ active: diagnostic(PACK_ID, '2.1.0') }))
    )
    mocks.catalog.sync.mockResolvedValue({
      outcome: 'activated',
      status: statusOf({ active: diagnostic(PACK_ID, '3.0.0'), lastCheckedAt: CHECKED_AT }),
      activated: diagnostic(PACK_ID, '3.0.0'),
      errorCode: null
    })

    const wrapper = await mountCatalog()
    expect(wrapper.get(STATUS).text()).toContain('2.1.0')

    await click(wrapper, SYNC)

    expect(mocks.catalog.sync).toHaveBeenCalledTimes(1)
    expect(mocks.catalog.sync).toHaveBeenCalledWith()
    expect(mocks.catalog.checkUpdates).not.toHaveBeenCalled()
    expect(wrapper.get(STATUS).text()).toContain('3.0.0')
    expect(wrapper.get(STATUS).text()).not.toContain('2.1.0')
    expect(mocks.toast.success).toHaveBeenCalledWith(ACTIVATED)

    wrapper.unmount()
  })

  it('rolls back with the manual reason and shows the returned active pack', async () => {
    mocks.catalog.getStatus.mockResolvedValue(
      snapshotOf(
        statusOf({
          active: diagnostic(PACK_ID, '3.0.0'),
          previous: diagnostic(PACK_ID, '2.1.0')
        })
      )
    )
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
    expect(wrapper.get(STATUS).text()).toContain('2.1.0')
    expect(wrapper.findAll(ROLLBACK_ROW)).toHaveLength(0)

    wrapper.unmount()
  })

  it('keeps the returned active pack and surfaces the error code when a sync fails', async () => {
    mocks.catalog.getStatus.mockResolvedValue(
      snapshotOf(statusOf({ active: diagnostic(PACK_ID, '2.1.0') }))
    )
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

    expect(wrapper.get(STATUS).text()).toContain('2.1.0')
    expect(wrapper.get(STATUS).text()).toContain('CATALOG_ACTIVATION_FAILED')
    expect(mocks.toast.error).toHaveBeenCalledWith(SYNC_FAILED)
    expectNoCanaries(wrapper)

    wrapper.unmount()
  })

  it('says the pack syncs after sign-in and offers a working login while signed out', async () => {
    mocks.auth.isLoggedIn.value = false
    mocks.catalog.getStatus.mockResolvedValue(snapshotOf(statusOf()))

    const wrapper = await mountCatalog()

    expect(wrapper.get(STATUS).text()).toContain(SIGNED_OUT)
    expect(wrapper.get(BADGE).text()).toBe(NOT_DOWNLOADED)
    expect(wrapper.findAll(SYNC)).toHaveLength(0)

    await click(wrapper, LOGIN)

    expect(mocks.auth.signIn).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('disables every catalog control while an operation is in flight', async () => {
    mocks.catalog.getStatus.mockResolvedValue(
      snapshotOf(
        statusOf({
          active: diagnostic(PACK_ID, '2.1.0'),
          previous: diagnostic(PACK_ID, '1.4.0')
        })
      )
    )
    const pending = deferred<CatalogVoiceProviderSyncResponse>()
    mocks.catalog.sync.mockReturnValue(pending.promise)

    const wrapper = await mountCatalog()
    expect(wrapper.get(SYNC).attributes('disabled')).toBeUndefined()

    await wrapper.get(SYNC).trigger('click')

    expect(wrapper.get(SYNC).attributes('disabled')).toBeDefined()
    expect(wrapper.get(ROLLBACK).attributes('disabled')).toBeDefined()

    pending.resolve({
      outcome: 'no-update',
      status: statusOf({
        active: diagnostic(PACK_ID, '2.1.0'),
        previous: diagnostic(PACK_ID, '1.4.0'),
        lastCheckedAt: CHECKED_AT
      }),
      activated: null,
      errorCode: null
    })
    await flushPromises()

    expect(wrapper.get(SYNC).attributes('disabled')).toBeUndefined()
    expect(wrapper.get(ROLLBACK).attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })
})
