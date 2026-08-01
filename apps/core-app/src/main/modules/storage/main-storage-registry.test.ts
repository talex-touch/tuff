import { StorageList } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { describe, expect, it } from 'vitest'
import { resolveMainStorageValue } from './main-storage-registry'

describe('main storage app settings normalization', () => {
  it('uses enabled canonical defaults for the three low-frequency settings', () => {
    expect(appSettingOriginData.setup.hideDock).toBe(true)
    expect(appSettingOriginData.window.startSilent).toBe(true)
    expect(appSettingOriginData.omniPanel.autoMountFirstFeatureOnPluginInstall).toBe(true)
  })

  it('fills only missing or non-boolean target fields while preserving historical data', () => {
    const normalized = resolveMainStorageValue(StorageList.APP_SETTING, {
      customLegacyField: 'kept',
      setup: { showTray: false, hideDock: 'invalid' },
      window: { closeToTray: false },
      omniPanel: { enableShortcut: true, autoMountFirstFeatureOnPluginInstall: null }
    })

    expect(normalized).toMatchObject({
      customLegacyField: 'kept',
      setup: { showTray: false, hideDock: true },
      window: { closeToTray: false, startSilent: true },
      omniPanel: { enableShortcut: true, autoMountFirstFeatureOnPluginInstall: true }
    })
  })

  it('preserves explicit false values at the storage boundary', () => {
    const normalized = resolveMainStorageValue(StorageList.APP_SETTING, {
      setup: { hideDock: false },
      window: { startSilent: false },
      omniPanel: { autoMountFirstFeatureOnPluginInstall: false }
    })

    expect(normalized.setup.hideDock).toBe(false)
    expect(normalized.window.startSilent).toBe(false)
    expect(normalized.omniPanel.autoMountFirstFeatureOnPluginInstall).toBe(false)
  })
})
