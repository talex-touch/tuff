// @vitest-environment jsdom
import type { Component } from 'vue'
import type { TuffEvent } from '@talex-touch/utils/transport'
import {
  PRIVACY_RETENTION_CATEGORIES,
  PRIVACY_RETENTION_PRESETS,
  PRIVACY_SETTINGS_DATA_CATEGORIES
} from '@talex-touch/utils/transport/events/types/privacy'
import { PrivacyEvents } from '@talex-touch/utils/transport/events/privacy'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TransportEventLike {
  toEventName(): string
}

const rendererMocks = vi.hoisted(() => ({
  transportSend: vi.fn<(event: TransportEventLike, request: unknown) => Promise<unknown>>(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn()
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/transport', async (importOriginal) => {
  const original = await importOriginal<typeof import('@talex-touch/utils/transport')>()
  return {
    ...original,
    useTuffTransport: () => ({ send: rendererMocks.transportSend })
  }
})

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    inheritAttrs: false,
    props: ['disabled', 'loading', 'nativeType'],
    emits: ['click'],
    template:
      '<button v-bind="$attrs" :type="nativeType || \'button\'" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${Object.values(params).join(':')}`
    }
  })
}))

vi.mock('vue-sonner', () => ({ toast: rendererMocks.toast }))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => rendererMocks.logger
}))

const DAY = 24 * 60 * 60 * 1000
const DELETE_PREVIEW_ID = 'preview_0123456789abcdef'
const initialPolicy = {
  version: 1 as const,
  categories: {
    'clipboard-history': { enabled: true, retentionMs: 90 * DAY },
    'ocr-screenshot-temp': { enabled: true, retentionMs: DAY },
    'search-history': { enabled: true, retentionMs: 30 * DAY },
    'intelligence-audit': { enabled: true, retentionMs: 30 * DAY },
    'intelligence-context': { enabled: true, retentionMs: 30 * DAY },
    diagnostics: { enabled: true, retentionMs: 30 * DAY }
  }
}

const initialSummary = PRIVACY_SETTINGS_DATA_CATEGORIES.map((category, index) => ({
  category,
  itemCount: index + 3,
  byteCount: (index + 1) * 1024,
  retentionMs: initialPolicy.categories[category].retentionMs,
  lastCleanupAt: '2026-07-30T08:00:00.000Z'
}))

const defaultProviderDisclosure = {
  ok: true as const,
  data: {
    providers: [
      {
        providerId: 'provider.remote',
        displayName: 'Synthetic Remote Provider',
        destinationClass: 'remote' as const,
        dataCategories: ['text', 'image-ocr', 'usage-metadata'] as const,
        purposes: ['translation', 'vision-and-ocr'] as const,
        capabilities: ['text.translate', 'vision.ocr'],
        localRetentionCategories: ['search-history', 'intelligence-audit'] as const
      }
    ]
  }
}

const responseSuppliers = new Map<string, () => unknown | Promise<unknown>>()

function eventName(event: TuffEvent<unknown, unknown>): string {
  return event.toEventName()
}

function setResponse(event: TuffEvent<unknown, unknown>, value: unknown): void {
  responseSuppliers.set(eventName(event), () => structuredClone(value))
}

function setResponseSupplier(
  event: TuffEvent<unknown, unknown>,
  supplier: () => unknown | Promise<unknown>
): void {
  responseSuppliers.set(eventName(event), supplier)
}

function requestsFor(event: TuffEvent<unknown, unknown>): unknown[] {
  const expectedName = eventName(event)
  return rendererMocks.transportSend.mock.calls
    .filter(([candidate]) => candidate.toEventName() === expectedName)
    .map(([, request]) => request)
}

function installDefaultResponses(): void {
  responseSuppliers.clear()
  setResponse(PrivacyEvents.policy.get, {
    ok: true,
    data: {
      policy: initialPolicy,
      supportedPresets: PRIVACY_RETENTION_PRESETS
    }
  })
  setResponse(PrivacyEvents.policy.update, {
    ok: true,
    data: { policy: initialPolicy }
  })
  setResponse(PrivacyEvents.summary.get, {
    ok: true,
    data: { categories: initialSummary }
  })
  setResponse(PrivacyEvents.provider.disclosure, defaultProviderDisclosure)
  setResponse(PrivacyEvents.secret.backupPreview, {
    ok: true,
    data: { portableEntryCount: 3, available: true }
  })
  setResponse(PrivacyEvents.cleanup.preview, {
    ok: true,
    data: {
      categories: [
        {
          category: 'clipboard-history',
          eligibleItemCount: 7,
          eligibleByteCount: 4096,
          protectedItemCount: 2
        },
        {
          category: 'search-history',
          eligibleItemCount: 4,
          eligibleByteCount: 2048,
          protectedItemCount: 0
        }
      ],
      bounded: true
    }
  })
  setResponse(PrivacyEvents.cleanup.run, {
    ok: true,
    data: {
      categories: [
        {
          category: 'clipboard-history',
          deletedItemCount: 7,
          deletedByteCount: 4096
        }
      ],
      partial: false,
      reportId: 'report_cleanup_301'
    }
  })
  setResponse(PrivacyEvents.category.export, {
    ok: true,
    data: {
      format: 'talex.touch.privacy-export/v1',
      categories: ['clipboard-history', 'search-history'],
      cancelled: false,
      itemCount: 11,
      byteCount: 6144,
      reportId: 'report_export_301'
    }
  })
  setResponse(PrivacyEvents.category.deletePreview, {
    ok: true,
    data: {
      categories: [
        {
          category: 'clipboard-history',
          eligibleItemCount: 9,
          eligibleByteCount: 5120,
          protectedItemCount: 2
        },
        {
          category: 'search-history',
          eligibleItemCount: 5,
          eligibleByteCount: 3072,
          protectedItemCount: 0
        }
      ],
      bounded: false,
      previewId: DELETE_PREVIEW_ID
    }
  })
  setResponse(PrivacyEvents.category.delete, {
    ok: true,
    data: {
      categories: [{ category: 'clipboard-history', deletedItemCount: 9 }],
      partial: false
    }
  })
  setResponse(PrivacyEvents.secret.backupWrite, {
    ok: true,
    data: {
      format: 'talex.touch.secret-backup',
      version: 1,
      cancelled: false
    }
  })
  setResponse(PrivacyEvents.secret.restorePreview, {
    ok: true,
    data: {
      restoreId: 'restore_plan_301abcdef',
      totalEntryCount: 5,
      conflictCount: 2,
      newEntryCount: 3
    }
  })
  setResponse(PrivacyEvents.secret.restoreApply, {
    ok: true,
    data: {
      importedCount: 5,
      overwrittenCount: 2,
      skippedCount: 0
    }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function mountPrivacyDataSection(): Promise<VueWrapper> {
  const module = await vi.importActual<{ default: Component }>('./PrivacyDataSection.vue')
  return mount(module.default, {
    attachTo: document.body,
    global: {
      directives: { wave: {} }
    }
  })
}

async function selectCleanupCategories(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="privacy-category-clipboard-history"]').setValue(true)
  await wrapper.get('[data-testid="privacy-category-search-history"]').setValue(true)
}

function serializedPublicFeedback(): string {
  return JSON.stringify({
    logger: rendererMocks.logger.error.mock.calls,
    toastError: rendererMocks.toast.error.mock.calls,
    toastInfo: rendererMocks.toast.info.mock.calls,
    toastSuccess: rendererMocks.toast.success.mock.calls
  })
}

describe('PrivacyDataSection', () => {
  beforeEach(() => {
    installDefaultResponses()
    rendererMocks.transportSend.mockReset()
    rendererMocks.transportSend.mockImplementation(async (event) => {
      const supplier = responseSuppliers.get(event.toEventName())
      if (!supplier) throw new Error('PRIVACY_TEST_RESPONSE_MISSING')
      return supplier()
    })
    rendererMocks.toast.error.mockReset()
    rendererMocks.toast.info.mockReset()
    rendererMocks.toast.success.mockReset()
    rendererMocks.logger.error.mockReset()
    rendererMocks.logger.warn.mockReset()
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('loads policy, summaries, disclosure and Secret availability with exact defaults and options', async () => {
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    expect(requestsFor(PrivacyEvents.policy.get)).toEqual([{ operation: 'policy.get' }])
    expect(requestsFor(PrivacyEvents.summary.get)).toEqual([{ operation: 'summary.get' }])
    expect(requestsFor(PrivacyEvents.provider.disclosure)).toEqual([
      { operation: 'provider-disclosure.get' }
    ])
    expect(requestsFor(PrivacyEvents.secret.backupPreview)).toEqual([
      { operation: 'secret-backup.preview' }
    ])

    const expectedSelections = {
      'clipboard-history': '90-days',
      'ocr-screenshot-temp': '1-day',
      'search-history': '30-days',
      'intelligence-audit': '30-days',
      'intelligence-context': '30-days',
      diagnostics: '30-days'
    }
    for (const category of PRIVACY_RETENTION_CATEGORIES) {
      const select = wrapper.get(`[data-testid="privacy-retention-${category}"]`)
      expect((select.element as HTMLSelectElement).value).toBe(expectedSelections[category])
      expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual(
        PRIVACY_RETENTION_PRESETS
      )
      expect(wrapper.get(`[data-testid="privacy-summary-${category}"]`).text()).not.toBe('')
    }

    expect(wrapper.text()).toContain('privacyData.retention.clipboardProtected')
    expect(wrapper.text()).toContain('privacyData.retention.contextProtected')
    expect(wrapper.text()).toContain('privacyData.retention.memoryIndependent')
    expect(wrapper.get('[data-testid="privacy-secret-backup-availability"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="privacy-result-status"]').attributes('aria-live')).toBe(
      'polite'
    )
    wrapper.unmount()
  })

  it('shows but cannot resubmit a retained preset that main no longer supports', async () => {
    const supported = PRIVACY_RETENTION_PRESETS.filter((preset) => preset !== '90-days')
    setResponse(PrivacyEvents.policy.get, {
      ok: true,
      data: { policy: initialPolicy, supportedPresets: supported }
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    const clipboard = wrapper.get('[data-testid="privacy-retention-clipboard-history"]')
    expect((clipboard.element as HTMLSelectElement).value).toBe('90-days')
    expect(
      clipboard
        .findAll('option')
        .find((option) => option.attributes('value') === '90-days')
        ?.attributes('disabled')
    ).toBeDefined()
    expect(
      (wrapper.get('[data-testid="privacy-policy-save"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(wrapper.text()).toContain('privacyData.retention.unsupportedSelection')

    await clipboard.setValue('180-days')
    expect(
      (wrapper.get('[data-testid="privacy-policy-save"]').element as HTMLButtonElement).disabled
    ).toBe(false)
    wrapper.unmount()
  })

  it('bounds initial loading and exposes a redacted retry path after a stable load failure', async () => {
    const pendingPolicy = deferred<unknown>()
    setResponseSupplier(PrivacyEvents.policy.get, () => pendingPolicy.promise)

    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-data-section"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="privacy-initial-loading"]').attributes('role')).toBe('status')

    pendingPolicy.resolve({
      ok: false,
      code: 'PRIVACY_OPERATION_FAILED',
      retryable: true,
      reportId: 'report_load_301'
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-load-retry"]').element.tagName).toBe('BUTTON')
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.errors.PRIVACY_OPERATION_FAILED'
    )

    setResponse(PrivacyEvents.policy.get, {
      ok: true,
      data: { policy: initialPolicy, supportedPresets: PRIVACY_RETENTION_PRESETS }
    })
    await wrapper.get('[data-testid="privacy-load-retry"]').trigger('click')
    await flushPromises()

    expect(requestsFor(PrivacyEvents.policy.get)).toHaveLength(2)
    expect(requestsFor(PrivacyEvents.summary.get)).toHaveLength(2)
    expect(requestsFor(PrivacyEvents.provider.disclosure)).toHaveLength(2)
    expect(requestsFor(PrivacyEvents.secret.backupPreview)).toHaveLength(2)
    wrapper.unmount()
  })

  it('sends all six retention selections, disables controls, then reloads prior policy on failure', async () => {
    const update = deferred<unknown>()
    setResponseSupplier(PrivacyEvents.policy.update, () => update.promise)
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    const selections = {
      'clipboard-history': '180-days',
      'ocr-screenshot-temp': '7-days',
      'search-history': '90-days',
      'intelligence-audit': 'permanent',
      'intelligence-context': '365-days',
      diagnostics: '1-day'
    }
    for (const category of PRIVACY_RETENTION_CATEGORIES) {
      await wrapper
        .get(`[data-testid="privacy-retention-${category}"]`)
        .setValue(selections[category])
    }

    await wrapper.get('[data-testid="privacy-policy-save"]').trigger('click')

    expect(requestsFor(PrivacyEvents.policy.update)).toEqual([
      {
        operation: 'policy.update',
        policy: { version: 1, selections }
      }
    ])
    expect(
      (wrapper.get('[data-testid="privacy-policy-save"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    for (const category of PRIVACY_RETENTION_CATEGORIES) {
      expect(
        (wrapper.get(`[data-testid="privacy-retention-${category}"]`).element as HTMLSelectElement)
          .disabled
      ).toBe(true)
    }

    update.resolve({
      ok: false,
      code: 'PRIVACY_POLICY_INVALID',
      retryable: false,
      reportId: 'report_policy_301'
    })
    await flushPromises()

    expect(requestsFor(PrivacyEvents.policy.get)).toHaveLength(2)
    expect(
      (
        wrapper.get('[data-testid="privacy-retention-clipboard-history"]')
          .element as HTMLSelectElement
      ).value
    ).toBe('90-days')
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.errors.PRIVACY_POLICY_INVALID'
    )
    wrapper.unmount()
  })

  it('uses selected categories for preview and cleanup while treating export cancellation as neutral', async () => {
    setResponse(PrivacyEvents.category.export, {
      ok: true,
      data: {
        format: 'talex.touch.privacy-export/v1',
        categories: ['clipboard-history', 'search-history'],
        cancelled: true,
        itemCount: 0,
        byteCount: 0,
        reportId: 'report_cancel_301'
      }
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await selectCleanupCategories(wrapper)

    await wrapper.get('[data-testid="privacy-cleanup-preview"]').trigger('click')
    await flushPromises()

    expect(requestsFor(PrivacyEvents.cleanup.preview)).toEqual([
      {
        operation: 'cleanup.preview',
        categories: ['clipboard-history', 'search-history']
      }
    ])
    expect(
      wrapper.get('[data-testid="privacy-cleanup-impact-clipboard-history"]').text()
    ).toContain('7')
    expect(
      wrapper.get('[data-testid="privacy-cleanup-impact-clipboard-history"]').text()
    ).toContain('2')

    await wrapper.get('[data-testid="privacy-cleanup-run"]').trigger('click')
    await flushPromises()
    expect(requestsFor(PrivacyEvents.cleanup.run)).toEqual([
      {
        operation: 'cleanup.run',
        categories: ['clipboard-history', 'search-history']
      }
    ])
    expect(requestsFor(PrivacyEvents.summary.get)).toHaveLength(2)

    await wrapper.get('[data-testid="privacy-category-export"]').trigger('click')
    await flushPromises()
    expect(requestsFor(PrivacyEvents.category.export)).toEqual([
      {
        operation: 'category.export',
        categories: ['clipboard-history', 'search-history']
      }
    ])
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.feedback.exportCancelled'
    )
    expect(rendererMocks.toast.success).not.toHaveBeenCalled()
    expect(rendererMocks.toast.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('requires a fresh preview and semantic confirmation before category deletion', async () => {
    const deletion = deferred<unknown>()
    setResponseSupplier(PrivacyEvents.category.delete, () => deletion.promise)
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await selectCleanupCategories(wrapper)

    const opener = wrapper.get('[data-testid="privacy-category-delete-open"]')
    expect(opener.element.tagName).toBe('BUTTON')
    expect((opener.element as HTMLButtonElement).disabled).toBe(true)

    const previewButton = wrapper.get('[data-testid="privacy-category-delete-preview"]')
    await previewButton.trigger('click')
    await flushPromises()
    expect(requestsFor(PrivacyEvents.category.deletePreview)).toEqual([
      {
        operation: 'category.delete-preview',
        categories: ['clipboard-history', 'search-history']
      }
    ])
    expect(wrapper.get('[data-testid="privacy-delete-impact-clipboard-history"]').text()).toContain(
      '9'
    )
    expect((opener.element as HTMLButtonElement).disabled).toBe(false)
    ;(opener.element as HTMLButtonElement).focus()
    await opener.trigger('click')
    await flushPromises()
    const dialog = wrapper.get('[data-testid="privacy-delete-confirmation"]')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-labelledby')).toBe('privacy-delete-dialog-title')
    expect(dialog.attributes('aria-describedby')).toBe('privacy-delete-dialog-description')
    const cancel = wrapper.get('[data-testid="privacy-delete-cancel"]')
    const confirm = wrapper.get('[data-testid="privacy-delete-confirm"]')
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm.element)
    await confirm.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(cancel.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(opener.element)
    expect(requestsFor(PrivacyEvents.category.delete)).toHaveLength(0)

    await opener.trigger('click')
    await wrapper.get('[data-testid="privacy-delete-confirm"]').trigger('click')
    expect(requestsFor(PrivacyEvents.category.delete)).toEqual([
      {
        operation: 'category.delete',
        categories: ['clipboard-history', 'search-history'],
        confirmation: 'delete-selected-data',
        previewId: DELETE_PREVIEW_ID
      }
    ])
    expect(
      (wrapper.get('[data-testid="privacy-delete-confirm"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    await wrapper.get('[data-testid="privacy-delete-confirmation"]').trigger('keydown', {
      key: 'Escape'
    })
    expect(wrapper.find('[data-testid="privacy-delete-confirmation"]').exists()).toBe(true)

    deletion.resolve({
      ok: true,
      data: {
        categories: [{ category: 'clipboard-history', deletedItemCount: 9 }],
        partial: false
      }
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="privacy-delete-confirmation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.feedback.deleteCompleted'
    )
    expect(requestsFor(PrivacyEvents.summary.get)).toHaveLength(2)
    expect(document.activeElement).toBe(previewButton.element)
    wrapper.unmount()
  })

  it('validates an ephemeral backup password, writes after preview, and clears every visible copy', async () => {
    const password = 'Synthetic-Backup-301!'
    const write = deferred<unknown>()
    setResponseSupplier(PrivacyEvents.secret.backupWrite, () => write.promise)
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    const backupDialog = wrapper.get('[data-testid="privacy-secret-backup-dialog"]')
    const passwordInput = wrapper.get('[data-testid="privacy-secret-backup-password"]')
    const confirmationInput = wrapper.get(
      '[data-testid="privacy-secret-backup-password-confirmation"]'
    )
    expect(backupDialog.attributes('aria-labelledby')).toBe('privacy-secret-backup-dialog-title')
    expect(backupDialog.attributes('aria-describedby')).toBe(
      'privacy-secret-backup-dialog-description'
    )
    expect(document.activeElement).toBe(passwordInput.element)
    expect(passwordInput.attributes('type')).toBe('password')
    expect(passwordInput.attributes('autocomplete')).toBe('new-password')
    expect(confirmationInput.attributes('autocomplete')).toBe('new-password')

    await passwordInput.setValue('short-value')
    await confirmationInput.setValue('short-value')
    await wrapper.get('[data-testid="privacy-secret-backup-submit"]').trigger('click')
    expect(requestsFor(PrivacyEvents.secret.backupWrite)).toHaveLength(0)
    expect(wrapper.get('[data-testid="privacy-secret-backup-error"]').text()).toContain(
      'privacyData.secret.passwordMinimum'
    )
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
    expect((confirmationInput.element as HTMLInputElement).value).toBe('')

    await passwordInput.setValue(password)
    await confirmationInput.setValue(`${password}-mismatch`)
    await wrapper.get('[data-testid="privacy-secret-backup-submit"]').trigger('click')
    expect(requestsFor(PrivacyEvents.secret.backupWrite)).toHaveLength(0)
    expect(wrapper.get('[data-testid="privacy-secret-backup-error"]').text()).toContain(
      'privacyData.secret.passwordMismatch'
    )
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
    expect((confirmationInput.element as HTMLInputElement).value).toBe('')

    await passwordInput.setValue(password)
    await confirmationInput.setValue(password)
    await wrapper.get('[data-testid="privacy-secret-backup-submit"]').trigger('click')
    expect(requestsFor(PrivacyEvents.secret.backupPreview)).toHaveLength(1)
    expect(requestsFor(PrivacyEvents.secret.backupWrite)).toEqual([
      { operation: 'secret-backup.write', password }
    ])
    expect((passwordInput.element as HTMLInputElement).disabled).toBe(true)

    write.resolve({
      ok: true,
      data: {
        format: 'talex.touch.secret-backup',
        version: 1,
        cancelled: false
      }
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="privacy-secret-backup-dialog"]').exists()).toBe(false)
    expect(document.body.textContent).not.toContain(password)
    expect(serializedPublicFeedback()).not.toContain(password)

    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    expect(
      (wrapper.get('[data-testid="privacy-secret-backup-password"]').element as HTMLInputElement)
        .value
    ).toBe('')
    wrapper.unmount()
    expect(document.body.textContent).not.toContain(password)
  })

  it('treats backup cancellation as neutral and clears local password state on close', async () => {
    const password = 'Synthetic-Cancel-301!'
    setResponse(PrivacyEvents.secret.backupWrite, {
      ok: true,
      data: {
        format: 'talex.touch.secret-backup',
        version: 1,
        cancelled: true
      }
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-backup-password"]').setValue(password)
    await wrapper
      .get('[data-testid="privacy-secret-backup-password-confirmation"]')
      .setValue(password)
    await wrapper.get('[data-testid="privacy-secret-backup-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.feedback.backupCancelled'
    )
    expect(rendererMocks.toast.success).not.toHaveBeenCalled()
    expect(rendererMocks.toast.error).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(password)

    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-backup-password"]').setValue(password)
    await wrapper.get('[data-testid="privacy-secret-backup-cancel"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    expect(
      (wrapper.get('[data-testid="privacy-secret-backup-password"]').element as HTMLInputElement)
        .value
    ).toBe('')
    wrapper.unmount()
  })

  it('clears backup credentials and reports an unconfirmed mutation without native details', async () => {
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    const password = 'Synthetic-Unknown-Backup-301!'
    setResponseSupplier(PrivacyEvents.secret.backupWrite, () => {
      throw new Error('/private/native/backup/CANARY')
    })
    await wrapper.get('[data-testid="privacy-secret-backup-open"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-backup-password"]').setValue(password)
    await wrapper
      .get('[data-testid="privacy-secret-backup-password-confirmation"]')
      .setValue(password)
    await wrapper.get('[data-testid="privacy-secret-backup-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="privacy-secret-backup-dialog"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="privacy-secret-backup-password"]').element as HTMLInputElement)
        .value
    ).toBe('')
    expect(wrapper.get('[data-testid="privacy-secret-backup-error"]').text()).toContain(
      'privacyData.feedback.outcomeUnknown'
    )
    expect(document.body.textContent).not.toContain(password)
    expect(document.body.textContent).not.toContain('/private/native/backup/CANARY')
    wrapper.unmount()
  })

  it('previews restore conflicts and binds explicit overwrite to the returned restore id', async () => {
    const password = 'Synthetic-Restore-301!'
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    await wrapper.get('[data-testid="privacy-secret-restore-open"]').trigger('click')
    const restoreDialog = wrapper.get('[data-testid="privacy-secret-restore-dialog"]')
    const passwordInput = wrapper.get('[data-testid="privacy-secret-restore-password"]')
    expect(restoreDialog.attributes('aria-labelledby')).toBe('privacy-secret-restore-dialog-title')
    expect(restoreDialog.attributes('aria-describedby')).toBe(
      'privacy-secret-restore-dialog-description'
    )
    expect(document.activeElement).toBe(passwordInput.element)
    expect(passwordInput.attributes('autocomplete')).toBe('current-password')
    await passwordInput.setValue('short-value')
    await wrapper.get('[data-testid="privacy-secret-restore-preview"]').trigger('click')
    expect(requestsFor(PrivacyEvents.secret.restorePreview)).toHaveLength(0)
    expect((passwordInput.element as HTMLInputElement).value).toBe('')

    await passwordInput.setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-preview"]').trigger('click')
    await flushPromises()

    expect(requestsFor(PrivacyEvents.secret.restorePreview)).toEqual([
      { operation: 'secret-restore.preview', password }
    ])
    expect(wrapper.get('[data-testid="privacy-secret-restore-plan"]').text()).toContain('5')
    expect(wrapper.get('[data-testid="privacy-secret-restore-plan"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="privacy-secret-restore-plan"]').text()).toContain('3')
    expect((passwordInput.element as HTMLInputElement).value).toBe('')

    await wrapper.get('[data-testid="privacy-secret-restore-conflict-overwrite"]').setValue(true)
    await passwordInput.setValue('short-value')
    await wrapper.get('[data-testid="privacy-secret-restore-apply"]').trigger('click')
    expect(requestsFor(PrivacyEvents.secret.restoreApply)).toHaveLength(0)
    expect(wrapper.get('[data-testid="privacy-secret-restore-error"]').text()).toContain(
      'privacyData.secret.passwordMinimum'
    )
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="privacy-secret-restore-plan"]').exists()).toBe(true)
    await passwordInput.setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-apply"]').trigger('click')
    await flushPromises()

    expect(requestsFor(PrivacyEvents.secret.restoreApply)).toEqual([
      {
        operation: 'secret-restore.apply',
        restoreId: 'restore_plan_301abcdef',
        password,
        conflictPolicy: 'overwrite'
      }
    ])
    expect(wrapper.find('[data-testid="privacy-secret-restore-dialog"]').exists()).toBe(false)
    expect(document.body.textContent).not.toContain(password)

    await wrapper.get('[data-testid="privacy-secret-restore-open"]').trigger('click')
    expect(
      (wrapper.get('[data-testid="privacy-secret-restore-password"]').element as HTMLInputElement)
        .value
    ).toBe('')
    expect(wrapper.find('[data-testid="privacy-secret-restore-plan"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('redacts wrong-password and stale-plan failures and clears restore authority before retry', async () => {
    const password = 'Synthetic-Wrong-301!'
    const nativeCanary = 'native-crypto-detail-301'
    setResponse(PrivacyEvents.secret.restorePreview, {
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_AUTH_FAILED',
      retryable: false,
      reportId: 'report_auth_301'
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await wrapper.get('[data-testid="privacy-secret-restore-open"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-restore-password"]').setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-secret-restore-error"]').text()).toContain(
      'privacyData.errors.PRIVACY_SECRET_BACKUP_AUTH_FAILED'
    )
    expect(wrapper.text()).not.toContain(nativeCanary)
    expect(
      (wrapper.get('[data-testid="privacy-secret-restore-password"]').element as HTMLInputElement)
        .value
    ).toBe('')

    setResponse(PrivacyEvents.secret.restorePreview, {
      ok: true,
      data: {
        restoreId: 'restore_plan_301abcdef',
        totalEntryCount: 5,
        conflictCount: 2,
        newEntryCount: 3
      }
    })
    setResponse(PrivacyEvents.secret.restoreApply, {
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
      retryable: true,
      reportId: 'report_stale_301'
    })
    await wrapper.get('[data-testid="privacy-secret-restore-password"]').setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privacy-secret-restore-conflict-skip"]').setValue(true)
    await wrapper.get('[data-testid="privacy-secret-restore-password"]').setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-secret-restore-error"]').text()).toContain(
      'privacyData.errors.PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    )
    expect(wrapper.find('[data-testid="privacy-secret-restore-plan"]').exists()).toBe(false)
    expect(
      (wrapper.get('[data-testid="privacy-secret-restore-password"]').element as HTMLInputElement)
        .value
    ).toBe('')
    expect(serializedPublicFeedback()).not.toContain(password)
    wrapper.unmount()
  })

  it('invalidates cleanup and delete evidence on selection or policy changes', async () => {
    setResponse(PrivacyEvents.category.deletePreview, {
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 9,
            eligibleByteCount: 8192,
            protectedItemCount: 3
          },
          {
            category: 'search-history',
            eligibleItemCount: 5,
            eligibleByteCount: 2048,
            protectedItemCount: 0
          }
        ],
        bounded: false,
        previewId: DELETE_PREVIEW_ID
      }
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await selectCleanupCategories(wrapper)
    await wrapper.get('[data-testid="privacy-cleanup-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privacy-category-delete-preview"]').trigger('click')
    await flushPromises()

    expect(
      (wrapper.get('[data-testid="privacy-cleanup-run"]').element as HTMLButtonElement).disabled
    ).toBe(false)
    expect(
      (wrapper.get('[data-testid="privacy-category-delete-open"]').element as HTMLButtonElement)
        .disabled
    ).toBe(false)

    await wrapper.get('[data-testid="privacy-category-search-history"]').setValue(false)
    expect(
      (wrapper.get('[data-testid="privacy-cleanup-run"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="privacy-category-delete-open"]').element as HTMLButtonElement)
        .disabled
    ).toBe(true)

    setResponse(PrivacyEvents.category.deletePreview, {
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 9,
            eligibleByteCount: 8192,
            protectedItemCount: 3
          }
        ],
        bounded: false,
        previewId: DELETE_PREVIEW_ID
      }
    })
    await wrapper.get('[data-testid="privacy-cleanup-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privacy-category-delete-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privacy-retention-clipboard-history"]').setValue('180-days')
    expect(
      (wrapper.get('[data-testid="privacy-cleanup-run"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="privacy-category-delete-open"]').element as HTMLButtonElement)
        .disabled
    ).toBe(true)
    wrapper.unmount()
  })

  it('reports a committed mutation separately when authoritative summary refresh fails', async () => {
    let summaryReads = 0
    setResponseSupplier(PrivacyEvents.summary.get, () => {
      summaryReads += 1
      return summaryReads === 1
        ? { ok: true, data: { categories: structuredClone(initialSummary) } }
        : {
            ok: false,
            code: 'PRIVACY_OPERATION_FAILED',
            retryable: true,
            reportId: 'report_summary_refresh_301'
          }
    })
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await wrapper.get('[data-testid="privacy-category-clipboard-history"]').setValue(true)
    setResponse(PrivacyEvents.cleanup.preview, {
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 7,
            eligibleByteCount: 4096,
            protectedItemCount: 2
          }
        ],
        bounded: false
      }
    })
    await wrapper.get('[data-testid="privacy-cleanup-preview"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="privacy-cleanup-run"]').trigger('click')
    await flushPromises()

    expect(requestsFor(PrivacyEvents.cleanup.run)).toHaveLength(1)
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.feedback.summaryRefreshFailed'
    )
    wrapper.unmount()
  })

  it('invalidates mutation evidence when a committed cleanup response cannot be confirmed', async () => {
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await wrapper.get('[data-testid="privacy-category-clipboard-history"]').setValue(true)
    setResponse(PrivacyEvents.cleanup.preview, {
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 4,
            eligibleByteCount: 1024,
            protectedItemCount: 1
          }
        ],
        bounded: false
      }
    })
    await wrapper.get('[data-testid="privacy-cleanup-preview"]').trigger('click')
    await flushPromises()
    setResponseSupplier(PrivacyEvents.cleanup.run, () => {
      throw new Error('/private/native/cleanup/CANARY')
    })
    await wrapper.get('[data-testid="privacy-cleanup-run"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.feedback.outcomeUnknown'
    )
    expect(
      (wrapper.get('[data-testid="privacy-cleanup-run"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(document.body.textContent).not.toContain('/private/native/cleanup/CANARY')
    wrapper.unmount()
  })

  it('does not expose independently governed Memory or plugin data as broad actions', async () => {
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    expect(wrapper.find('[data-testid="privacy-summary-intelligence-memory"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="privacy-summary-plugin-data"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="privacy-category-intelligence-memory"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="privacy-category-plugin-data"]').exists()).toBe(false)
    expect(requestsFor(PrivacyEvents.category.deletePreview)).toHaveLength(0)
    expect(requestsFor(PrivacyEvents.category.delete)).toHaveLength(0)
    wrapper.unmount()
  })

  it('fails closed for incomplete summaries and unsupported retention projections', async () => {
    setResponse(PrivacyEvents.summary.get, {
      ok: true,
      data: { categories: initialSummary.slice(0, -1) }
    })
    const incomplete = await mountPrivacyDataSection()
    await flushPromises()
    expect(incomplete.find('[data-testid="privacy-summary-diagnostics"]').exists()).toBe(false)
    expect(incomplete.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.errors.PRIVACY_REQUEST_INVALID'
    )
    incomplete.unmount()

    installDefaultResponses()
    setResponse(PrivacyEvents.policy.get, {
      ok: true,
      data: {
        policy: {
          ...initialPolicy,
          categories: {
            ...initialPolicy.categories,
            'search-history': { enabled: true, retentionMs: 2 * DAY }
          }
        },
        supportedPresets: PRIVACY_RETENTION_PRESETS
      }
    })
    const unsupported = await mountPrivacyDataSection()
    await flushPromises()
    expect(unsupported.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.errors.PRIVACY_REQUEST_INVALID'
    )
    unsupported.unmount()
  })

  it('invalidates late restore preview authority after unmount', async () => {
    const preview = deferred<unknown>()
    const password = 'Synthetic-Late-Restore-301!'
    setResponseSupplier(PrivacyEvents.secret.restorePreview, () => preview.promise)
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()
    await wrapper.get('[data-testid="privacy-secret-restore-open"]').trigger('click')
    await wrapper.get('[data-testid="privacy-secret-restore-password"]').setValue(password)
    await wrapper.get('[data-testid="privacy-secret-restore-preview"]').trigger('click')
    wrapper.unmount()

    preview.resolve({
      ok: true,
      data: {
        restoreId: 'restore_plan_301abcdef',
        totalEntryCount: 1,
        conflictCount: 0,
        newEntryCount: 1
      }
    })
    await flushPromises()
    expect(requestsFor(PrivacyEvents.secret.restoreApply)).toHaveLength(0)
    expect(serializedPublicFeedback()).not.toContain(password)
    expect(document.body.textContent).not.toContain(password)
  })

  it('renders only safe provider disclosure fields plus external-retention guidance', async () => {
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    const provider = wrapper.get('[data-testid="privacy-provider-provider.remote"]')
    expect(provider.text()).toContain('Synthetic Remote Provider')
    expect(provider.text()).toContain('privacyData.providers.destination.remote')
    expect(provider.text()).toContain('privacyData.providers.purpose.translation')
    expect(provider.text()).toContain('privacyData.providers.purpose.vision-and-ocr')
    expect(provider.text()).toContain('privacyData.providers.dataCategory.text')
    expect(provider.text()).toContain('privacyData.providers.dataCategory.image-ocr')
    expect(provider.text()).toContain('text.translate')
    expect(provider.text()).toContain('privacyData.categories.search-history')
    expect(wrapper.text()).toContain('privacyData.providers.externalRetentionLimitation')
    expect(wrapper.text()).toContain('privacyData.providers.disableAndClearGuidance')
    wrapper.unmount()
  })

  it('rejects hostile provider extras before render and never projects payload canaries', async () => {
    const canaries = [
      'credential-canary-301',
      'https://user:credential@example.test/path?token=endpoint-canary-301',
      'prompt-canary-301',
      'response-canary-301',
      'image-payload-canary-301',
      'audio-payload-canary-301',
      'file-content-canary-301'
    ]
    setResponse(PrivacyEvents.provider.disclosure, {
      ok: true,
      data: {
        providers: [
          {
            ...defaultProviderDisclosure.data.providers[0],
            apiKey: canaries[0],
            endpoint: canaries[1],
            prompt: canaries[2],
            response: canaries[3],
            image: canaries[4],
            audio: canaries[5],
            fileContent: canaries[6]
          }
        ]
      }
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = await mountPrivacyDataSection()
    await flushPromises()

    const publicProjection = `${wrapper.text()}${serializedPublicFeedback()}${JSON.stringify(
      consoleError.mock.calls
    )}${JSON.stringify(consoleWarn.mock.calls)}`
    for (const canary of canaries) expect(publicProjection).not.toContain(canary)
    expect(wrapper.get('[data-testid="privacy-result-status"]').text()).toContain(
      'privacyData.errors.PRIVACY_REQUEST_INVALID'
    )
    wrapper.unmount()
  })
})
