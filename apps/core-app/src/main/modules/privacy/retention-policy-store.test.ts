import { StorageList } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMainConfig: vi.fn<() => unknown>(),
  saveMainConfigDurable: vi.fn()
}))

vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  saveMainConfigDurable: mocks.saveMainConfigDurable
}))

import { createMainPrivacyRetentionPolicyStore } from './retention-policy-store'

describe('main privacy retention policy store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveMainConfigDurable.mockResolvedValue({ success: true, version: 1 })
  })

  it('does not invoke accessor-backed settings while persisting the policy section', async () => {
    const getter = vi.fn(() => ({ retentionPolicy: 'CANARY' }))
    const appSetting = Object.defineProperty({ setup: { locale: 'en' } }, 'privacyDataLifecycle', {
      enumerable: true,
      get: getter
    })
    mocks.getMainConfig.mockReturnValue(appSetting)

    const store = createMainPrivacyRetentionPolicyStore()
    await store.save({
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

    expect(getter).not.toHaveBeenCalled()
    expect(mocks.saveMainConfigDurable).toHaveBeenCalledWith(
      StorageList.APP_SETTING,
      expect.objectContaining({
        setup: { locale: 'en' },
        privacyDataLifecycle: expect.objectContaining({
          retentionPolicy: expect.objectContaining({ version: 1 })
        })
      }),
      { force: true }
    )
  })

  it('falls back safely when stored settings reject structural inspection', async () => {
    const ownKeys = vi.fn(() => {
      throw new Error('CANARY_PROXY_TRAP')
    })
    mocks.getMainConfig.mockReturnValue(new Proxy({}, { ownKeys }))

    const store = createMainPrivacyRetentionPolicyStore()
    await expect(store.load()).resolves.toMatchObject({ version: 1 })
    await expect(
      store.save({
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
    ).rejects.toThrow('PRIVACY_RETENTION_POLICY_PERSIST_FAILED')
    expect(ownKeys).not.toHaveBeenCalled()
    expect(mocks.saveMainConfigDurable).not.toHaveBeenCalled()
  })
})
