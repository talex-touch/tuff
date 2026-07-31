import type {
  PrivacyRetentionPolicyV1,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRIVACY_RETENTION_POLICY,
  normalizePrivacyRetentionPolicy,
  policyToPrivacyRetentionSelection,
  PRIVACY_RETENTION_DAY_MS,
  privacyRetentionSelectionToPolicy
} from './retention-policy'
import { createPrivacyRetentionPolicyStore } from './retention-policy-store'

describe('privacy retention policy', () => {
  it('defines the approved category defaults', () => {
    expect(DEFAULT_PRIVACY_RETENTION_POLICY).toEqual({
      version: 1,
      categories: {
        'clipboard-history': { enabled: true, retentionMs: 90 * PRIVACY_RETENTION_DAY_MS },
        'ocr-screenshot-temp': { enabled: true, retentionMs: PRIVACY_RETENTION_DAY_MS },
        'search-history': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
        'intelligence-audit': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
        'intelligence-context': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
        diagnostics: { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS }
      }
    })
  })

  it('maps only the fixed selectable presets into a V1 policy', () => {
    const selection: PrivacyRetentionSelectionV1 = {
      version: 1,
      selections: {
        'clipboard-history': '180-days',
        'ocr-screenshot-temp': '7-days',
        'search-history': 'permanent',
        'intelligence-audit': '30-days',
        'intelligence-context': '90-days',
        diagnostics: '365-days'
      }
    }

    expect(privacyRetentionSelectionToPolicy(selection)).toEqual({
      version: 1,
      categories: {
        'clipboard-history': { enabled: true, retentionMs: 180 * PRIVACY_RETENTION_DAY_MS },
        'ocr-screenshot-temp': { enabled: true, retentionMs: 7 * PRIVACY_RETENTION_DAY_MS },
        'search-history': { enabled: true, retentionMs: null },
        'intelligence-audit': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
        'intelligence-context': { enabled: true, retentionMs: 90 * PRIVACY_RETENTION_DAY_MS },
        diagnostics: { enabled: true, retentionMs: 365 * PRIVACY_RETENTION_DAY_MS }
      }
    })
  })

  it('normalizes malformed stored values category-by-category without accepting arbitrary milliseconds', () => {
    const normalized = normalizePrivacyRetentionPolicy({
      version: 1,
      categories: {
        'clipboard-history': { enabled: false, retentionMs: 7 * PRIVACY_RETENTION_DAY_MS },
        'ocr-screenshot-temp': { enabled: true, retentionMs: 2 * PRIVACY_RETENTION_DAY_MS },
        'search-history': { enabled: 'yes', retentionMs: 180 * PRIVACY_RETENTION_DAY_MS },
        'intelligence-audit': { enabled: true, retentionMs: Number.POSITIVE_INFINITY },
        'intelligence-context': { enabled: true, retentionMs: null },
        diagnostics: { enabled: true, retentionMs: 365 * PRIVACY_RETENTION_DAY_MS }
      }
    })

    expect(normalized.categories['clipboard-history']).toEqual({
      enabled: false,
      retentionMs: 7 * PRIVACY_RETENTION_DAY_MS
    })
    expect(normalized.categories['ocr-screenshot-temp']).toEqual(
      DEFAULT_PRIVACY_RETENTION_POLICY.categories['ocr-screenshot-temp']
    )
    expect(normalized.categories['search-history']).toEqual({
      enabled: true,
      retentionMs: 180 * PRIVACY_RETENTION_DAY_MS
    })
    expect(normalized.categories['intelligence-audit']).toEqual(
      DEFAULT_PRIVACY_RETENTION_POLICY.categories['intelligence-audit']
    )
    expect(normalized.categories['intelligence-context']).toEqual({
      enabled: true,
      retentionMs: null
    })
  })

  it('falls back to defaults for unknown policy versions and hostile objects', () => {
    expect(normalizePrivacyRetentionPolicy({ version: 2, categories: {} })).toEqual(
      DEFAULT_PRIVACY_RETENTION_POLICY
    )

    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('CANARY_NATIVE_ERROR')
        }
      }
    )
    expect(normalizePrivacyRetentionPolicy(hostile)).toEqual(DEFAULT_PRIVACY_RETENTION_POLICY)
  })

  it('never projects malformed millisecond values as permanent retention', () => {
    const malformed = {
      ...DEFAULT_PRIVACY_RETENTION_POLICY,
      categories: {
        ...DEFAULT_PRIVACY_RETENTION_POLICY.categories,
        'search-history': { enabled: true, retentionMs: 123 }
      }
    } as PrivacyRetentionPolicyV1

    expect(policyToPrivacyRetentionSelection(malformed).selections['search-history']).toBe(
      '30-days'
    )
  })

  it('normalizes on load and durably writes only the normalized policy', async () => {
    const write = vi.fn(async () => undefined)
    const store = createPrivacyRetentionPolicyStore({
      read: () => ({ version: 9, categories: {} }),
      write
    })

    expect(await store.load()).toEqual(DEFAULT_PRIVACY_RETENTION_POLICY)
    const saved = await store.save({
      version: 1,
      selections: {
        'clipboard-history': '90-days',
        'ocr-screenshot-temp': '1-day',
        'search-history': '30-days',
        'intelligence-audit': '30-days',
        'intelligence-context': '30-days',
        diagnostics: '30-days'
      }
    })

    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith(saved)
  })
})
