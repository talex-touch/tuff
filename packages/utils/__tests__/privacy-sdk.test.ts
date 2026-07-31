import type { PrivacyRequest } from '../transport/events/types/privacy'
import type { ITuffTransport } from '../transport/types'
import { describe, expect, it, vi } from 'vitest'
import { PrivacyEvents } from '../transport/events/privacy'
import {
  normalizePrivacyRequest,
  normalizePrivacyResult,
  PRIVACY_RETENTION_PRESETS,
} from '../transport/events/types/privacy'
import { createPrivacySdk } from '../transport/sdk/domains/privacy'

const PREVIEW_ID = 'preview_0123456789abcdef'

function createTransportMock() {
  return {
    send: vi.fn(async () => ({
      ok: false,
      code: 'PRIVACY_OPERATION_FAILED',
      retryable: false,
    })),
  }
}

describe('privacy typed transport contracts', () => {
  it('defines canonical typed events without duplicated raw channel constants', () => {
    expect(PrivacyEvents.policy.get.toEventName()).toBe('privacy:policy:get')
    expect(PrivacyEvents.cleanup.preview.toEventName()).toBe('privacy:cleanup:preview')
    expect(PrivacyEvents.category.deletePreview.toEventName()).toBe('privacy:category:delete-preview')
    expect(PrivacyEvents.secret.restoreApply.toEventName()).toBe('privacy:secret:restore-apply')
    expect(PrivacyEvents.secret.restoreApply).toMatchObject({
      namespace: 'privacy',
      module: 'secret',
      action: 'restore-apply',
    })
  })

  it('maps every renderer operation through the domain SDK', async () => {
    const transport = createTransportMock()
    const sdk = createPrivacySdk(transport as unknown as ITuffTransport)
    const selections = {
      'clipboard-history': '90-days',
      'ocr-screenshot-temp': '1-day',
      'search-history': '30-days',
      'intelligence-audit': '30-days',
      'intelligence-context': '30-days',
      diagnostics: '30-days',
    } as const

    await sdk.policy.get()
    await sdk.policy.update({ version: 1, selections })
    await sdk.summary.get(['clipboard-history'])
    await sdk.cleanup.preview(['search-history'])
    await sdk.cleanup.run(['search-history'])
    await sdk.category.export(['clipboard-history'])
    await sdk.category.previewDelete(['clipboard-history', 'search-history'])
    await sdk.category.delete(['clipboard-history'], 'delete-selected-data', PREVIEW_ID)
    await sdk.provider.getDisclosure()
    await sdk.secret.backupPreview()
    await sdk.secret.backupWrite('correct horse battery staple')
    await sdk.secret.restorePreview('correct horse battery staple')
    await sdk.secret.restoreApply('restore_0123456789abcdef', 'correct horse battery staple', 'skip')

    expect(transport.send.mock.calls).toEqual([
      [PrivacyEvents.policy.get, { operation: 'policy.get' }],
      [PrivacyEvents.policy.update, { operation: 'policy.update', policy: { version: 1, selections } }],
      [PrivacyEvents.summary.get, { operation: 'summary.get', categories: ['clipboard-history'] }],
      [PrivacyEvents.cleanup.preview, { operation: 'cleanup.preview', categories: ['search-history'] }],
      [PrivacyEvents.cleanup.run, { operation: 'cleanup.run', categories: ['search-history'] }],
      [PrivacyEvents.category.export, { operation: 'category.export', categories: ['clipboard-history'] }],
      [
        PrivacyEvents.category.deletePreview,
        {
          operation: 'category.delete-preview',
          categories: ['clipboard-history', 'search-history'],
        },
      ],
      [
        PrivacyEvents.category.delete,
        {
          operation: 'category.delete',
          categories: ['clipboard-history'],
          confirmation: 'delete-selected-data',
          previewId: PREVIEW_ID,
        },
      ],
      [PrivacyEvents.provider.disclosure, { operation: 'provider-disclosure.get' }],
      [PrivacyEvents.secret.backupPreview, { operation: 'secret-backup.preview' }],
      [
        PrivacyEvents.secret.backupWrite,
        { operation: 'secret-backup.write', password: 'correct horse battery staple' },
      ],
      [
        PrivacyEvents.secret.restorePreview,
        { operation: 'secret-restore.preview', password: 'correct horse battery staple' },
      ],
      [
        PrivacyEvents.secret.restoreApply,
        {
          operation: 'secret-restore.apply',
          restoreId: 'restore_0123456789abcdef',
          password: 'correct horse battery staple',
          conflictPolicy: 'skip',
        },
      ],
    ])
  })

  it('normalizes exact requests and rejects authority-bearing renderer fields', () => {
    const valid: PrivacyRequest[] = [
      { operation: 'policy.get' },
      {
        operation: 'cleanup.preview',
        categories: ['clipboard-history', 'diagnostics'],
      },
      {
        operation: 'category.delete-preview',
        categories: ['clipboard-history', 'search-history'],
      },
      {
        operation: 'category.delete',
        categories: ['clipboard-history'],
        confirmation: 'delete-selected-data',
        previewId: PREVIEW_ID,
      },
      {
        operation: 'secret-restore.apply',
        restoreId: 'restore_0123456789abcdef',
        password: 'correct horse battery staple',
        conflictPolicy: 'overwrite',
      },
    ]
    for (const request of valid) expect(normalizePrivacyRequest(request)).toEqual(request)

    const forbidden = [
      { operation: 'summary.get', path: '/private/export' },
      { operation: 'summary.get', categories: ['intelligence-memory'] },
      { operation: 'category.export', categories: ['plugin-data'] },
      { operation: 'category.delete-preview', categories: ['intelligence-memory'] },
      {
        operation: 'category.delete',
        categories: ['plugin-data'],
        confirmation: 'delete-selected-data',
        previewId: PREVIEW_ID,
      },
      { operation: 'cleanup.run', categories: ['search-history'], table: 'usage_logs' },
      {
        operation: 'category.delete',
        categories: ['search-history'],
        confirmation: 'delete-selected-data',
      },
      { operation: 'category.delete', categories: ['search-history'], sql: 'DELETE FROM x' },
      {
        operation: 'category.export',
        categories: ['search-history'],
        secretPrefix: 'plugin.',
      },
      {
        operation: 'provider-disclosure.get',
        providerEndpoint: 'https://remote.invalid?q=token',
      },
      {
        operation: 'secret-backup.write',
        password: 'correct horse battery staple',
        value: 'raw-secret',
      },
      { operation: 'summary.get', rawData: 'clipboard-canary' },
    ]
    for (const request of forbidden) {
      expect(() => normalizePrivacyRequest(request)).toThrow('PRIVACY_REQUEST_INVALID')
    }
  })

  it('validates exact public results and rejects sensitive or native detail fields', async () => {
    const resultGetter = vi.fn(() => ({
      format: 'talex.touch.secret-backup',
      version: 1,
      cancelled: false,
    }))
    const accessorResult = Object.defineProperty({ ok: true }, 'data', {
      enumerable: true,
      get: resultGetter,
    })
    const sparseProviders = Array.from({ length: 1 })

    expect(
      normalizePrivacyResult('secret-backup.write', {
        ok: true,
        data: {
          format: 'talex.touch.secret-backup',
          version: 1,
          cancelled: false,
        },
      }),
    ).toEqual({
      ok: true,
      data: {
        format: 'talex.touch.secret-backup',
        version: 1,
        cancelled: false,
      },
    })
    expect(
      normalizePrivacyResult('secret-restore.preview', {
        ok: true,
        data: {
          restoreId: 'restore_0123456789abcdef',
          totalEntryCount: 2,
          conflictCount: 1,
          newEntryCount: 1,
        },
      }),
    ).toMatchObject({ ok: true })
    expect(
      normalizePrivacyResult('category.delete-preview', {
        ok: true,
        data: {
          categories: [
            {
              category: 'clipboard-history',
              eligibleItemCount: 3,
              eligibleByteCount: 128,
              protectedItemCount: 1,
            },
          ],
          bounded: false,
          previewId: PREVIEW_ID,
        },
      }),
    ).toMatchObject({
      ok: true,
      data: {
        categories: [{ category: 'clipboard-history', eligibleItemCount: 3 }],
        bounded: false,
        previewId: PREVIEW_ID,
      },
    })
    expect(
      normalizePrivacyResult('category.export', {
        ok: true,
        data: {
          format: 'talex.touch.privacy-export/v1',
          categories: ['clipboard-history'],
          cancelled: false,
          itemCount: 2,
          byteCount: 128,
          reportId: 'report_export_0001',
        },
      }),
    ).toEqual({
      ok: true,
      data: {
        format: 'talex.touch.privacy-export/v1',
        categories: ['clipboard-history'],
        cancelled: false,
        itemCount: 2,
        byteCount: 128,
        reportId: 'report_export_0001',
      },
    })

    for (const result of [
      {
        ok: false,
        code: 'PRIVACY_OPERATION_FAILED',
        retryable: false,
        message: 'native path detail',
      },
      {
        ok: true,
        data: {
          format: 'talex.touch.secret-backup',
          version: 1,
          cancelled: false,
          value: 'synthetic-secret-canary',
        },
      },
      {
        ok: true,
        data: {
          restoreId: 'restore_0123456789abcdef',
          totalEntryCount: 2,
          conflictCount: 2,
          newEntryCount: 1,
        },
      },
      accessorResult,
      new Proxy(
        {
          ok: false,
          code: 'PRIVACY_OPERATION_FAILED',
          retryable: false,
        },
        {},
      ),
    ]) {
      expect(() => normalizePrivacyResult('secret-restore.preview', result)).toThrow('PRIVACY_REQUEST_INVALID')
    }
    expect(() =>
      normalizePrivacyResult('provider-disclosure.get', {
        ok: true,
        data: { providers: sparseProviders },
      }),
    ).toThrow('PRIVACY_REQUEST_INVALID')
    expect(resultGetter).not.toHaveBeenCalled()

    const transport = {
      send: vi.fn(async () => ({
        ok: false,
        code: 'PRIVACY_OPERATION_FAILED',
        retryable: false,
        stack: 'native stack must not cross',
      })),
    }
    const sdk = createPrivacySdk(transport as unknown as ITuffTransport)
    await expect(sdk.policy.get()).rejects.toThrow('PRIVACY_REQUEST_INVALID')
  })

  it('accepts only fixed retention presets and complete V1 category selections', () => {
    expect(PRIVACY_RETENTION_PRESETS).toEqual([
      '1-day',
      '7-days',
      '30-days',
      '90-days',
      '180-days',
      '365-days',
      'permanent',
    ])

    expect(() =>
      normalizePrivacyRequest({
        operation: 'policy.update',
        policy: {
          version: 1,
          selections: {
            'clipboard-history': '90-days',
            'ocr-screenshot-temp': '1-day',
            'search-history': '30-days',
            'intelligence-audit': '30-days',
            'intelligence-context': '30-days',
            diagnostics: '30-days',
          },
        },
      }),
    ).not.toThrow()

    for (const policy of [
      { version: 1, selections: { 'clipboard-history': '90-days' } },
      {
        version: 1,
        selections: {
          'clipboard-history': 90 * 24 * 60 * 60 * 1000,
          'ocr-screenshot-temp': '1-day',
          'search-history': '30-days',
          'intelligence-audit': '30-days',
          'intelligence-context': '30-days',
          diagnostics: '30-days',
        },
      },
    ]) {
      expect(() => normalizePrivacyRequest({ operation: 'policy.update', policy })).toThrow('PRIVACY_REQUEST_INVALID')
    }
  })

  it('counts password code points and rejects non-well-formed Unicode', () => {
    expect(() => normalizePrivacyRequest({ operation: 'secret-backup.write', password: '😀'.repeat(12) })).not.toThrow()
    for (const password of ['😀'.repeat(11), `${'p'.repeat(12)}\uD800`]) {
      expect(() => normalizePrivacyRequest({ operation: 'secret-backup.write', password })).toThrow(
        'PRIVACY_REQUEST_INVALID',
      )
    }
  })

  it('rejects path, endpoint, query and SQL detail from provider disclosure results', () => {
    const provider = {
      providerId: 'provider.local',
      displayName: 'Custom remote endpoint',
      destinationClass: 'remote',
      dataCategories: ['text'],
      purposes: ['text-processing'],
      capabilities: ['text.chat'],
      localRetentionCategories: ['intelligence-audit'],
    }
    expect(() =>
      normalizePrivacyResult('provider-disclosure.get', {
        ok: true,
        data: { providers: [provider] },
      }),
    ).not.toThrow()

    for (const displayName of [
      '/Users/private/provider.json',
      'C:\\private\\provider.json',
      'https://remote.invalid/v1?token=canary',
      'api.remote.invalid/v1',
      'SELECT secret FROM provider_config',
    ]) {
      expect(() =>
        normalizePrivacyResult('provider-disclosure.get', {
          ok: true,
          data: { providers: [{ ...provider, displayName }] },
        }),
      ).toThrow('PRIVACY_REQUEST_INVALID')
    }
    expect(() =>
      normalizePrivacyResult('provider-disclosure.get', {
        ok: true,
        data: { providers: [{ ...provider, capabilities: ['https://remote.invalid/v1'] }] },
      }),
    ).toThrow('PRIVACY_REQUEST_INVALID')
    expect(() =>
      normalizePrivacyResult('provider-disclosure.get', {
        ok: true,
        data: { providers: [{ ...provider, capabilities: ['text.chat', 'text.chat'] }] },
      }),
    ).toThrow('PRIVACY_REQUEST_INVALID')
  })

  it('rejects malformed objects, accessors, proxies, sparse arrays and prototype keys', () => {
    const getter = vi.fn(() => 'policy.get')
    const nestedGetter = vi.fn(() => ({}))
    const accessor = Object.defineProperty({}, 'operation', {
      enumerable: true,
      get: getter,
    })
    const nestedAccessor = {
      operation: 'policy.update',
      policy: Object.defineProperty({ version: 1 }, 'selections', {
        enumerable: true,
        get: nestedGetter,
      }),
    }
    const sparse = Array.from({ length: 2 })
    sparse[0] = 'clipboard-history'
    const arraySubclass = ['clipboard-history']
    Object.setPrototypeOf(arraySubclass, Object.create(Array.prototype))
    const arrayProxyGetPrototype = vi.fn(() => {
      throw new Error('native path canary')
    })
    const arrayProxy = new Proxy(['clipboard-history'], {
      getPrototypeOf: arrayProxyGetPrototype,
    })
    const inherited = Object.create({ operation: 'policy.get' })
    const prototypeKey = JSON.parse('{"operation":"policy.get","__proto__":"blocked"}')

    for (const request of [
      accessor,
      nestedAccessor,
      new Proxy({ operation: 'policy.get' }, {}),
      { operation: 'summary.get', categories: sparse },
      { operation: 'summary.get', categories: arraySubclass },
      { operation: 'summary.get', categories: arrayProxy },
      inherited,
      prototypeKey,
    ]) {
      expect(() => normalizePrivacyRequest(request)).toThrow('PRIVACY_REQUEST_INVALID')
    }
    expect(getter).not.toHaveBeenCalled()
    expect(nestedGetter).not.toHaveBeenCalled()
    expect(arrayProxyGetPrototype).toHaveBeenCalledOnce()
  })
})
