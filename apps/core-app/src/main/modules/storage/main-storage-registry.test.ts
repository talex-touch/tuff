import { StorageList } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  omitMainOwnedAuthSettings,
  preserveMainOwnedAuthSettings,
  resolveMainStorageValue
} from './main-storage-registry'

describe('main storage app settings normalization', () => {
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

  it('normalizes historical strength without reviving an explicitly disabled polish mode', () => {
    const selected = resolveMainStorageValue(StorageList.APP_SETTING, {
      voiceInput: {
        enabled: true,
        language: 'fr-FR',
        polishEnabled: false,
        polishStrength: 'natural',
        historyEnabled: true,
        customLegacyField: 'kept'
      }
    })
    const malformed = resolveMainStorageValue(StorageList.APP_SETTING, {
      voiceInput: { enabled: true, language: 'fr-FR', polishEnabled: false, polishStrength: 'raw' }
    })

    expect(selected.voiceInput).toMatchObject({
      enabled: true,
      language: 'fr-FR',
      polishEnabled: false,
      polishStrength: 'natural',
      historyEnabled: true,
      customLegacyField: 'kept'
    })
    expect(malformed.voiceInput).toMatchObject({
      polishEnabled: false,
      polishStrength: 'deep'
    })
  })

  it('keeps noise suppression off unless the stored value says otherwise', () => {
    // Suppression changes what the recogniser hears, so anything unreadable has to land on
    // off rather than on the more "helpful" interpretation.
    const absent = resolveMainStorageValue(StorageList.APP_SETTING, {
      voiceInput: { enabled: true, language: 'fr-FR', polishEnabled: true, polishStrength: 'deep' }
    })
    const enabled = resolveMainStorageValue(StorageList.APP_SETTING, {
      voiceInput: {
        enabled: true,
        language: 'fr-FR',
        polishEnabled: true,
        polishStrength: 'deep',
        noiseSuppression: true
      }
    })
    const malformed = resolveMainStorageValue(StorageList.APP_SETTING, {
      voiceInput: {
        enabled: true,
        language: 'fr-FR',
        polishEnabled: false,
        polishStrength: 'natural',
        historyEnabled: true,
        noiseSuppression: 'yes',
        customLegacyField: 'kept'
      }
    })

    expect(absent.voiceInput.noiseSuppression).not.toBe(true)
    expect(enabled.voiceInput.noiseSuppression).toBe(true)
    expect(malformed.voiceInput).toMatchObject({
      noiseSuppression: false,
      // Failing closed on one field must not disturb any of its neighbours.
      polishEnabled: false,
      polishStrength: 'natural',
      historyEnabled: true,
      customLegacyField: 'kept'
    })
  })

  it('removes legacy auth preference overrides while retaining the main-owned marker', () => {
    const normalized = resolveMainStorageValue(StorageList.APP_SETTING, {
      auth: {
        deviceId: 'device-1',
        requiresReauthenticationOnNextStartup: true,
        useSecureStorage: false,
        secureStorageUserOverridden: true,
        secureStorageReminderShown: true,
        secureStorageUnavailable: true
      }
    })

    expect(normalized.auth).toEqual({
      deviceId: 'device-1',
      requiresReauthenticationOnNextStartup: true
    })
  })

  it('omits the marker from renderer and sync projections and preserves it on external writes', () => {
    const current = {
      auth: {
        deviceId: 'device-1',
        requiresReauthenticationOnNextStartup: true
      }
    }
    const projection = omitMainOwnedAuthSettings(current) as { auth?: Record<string, unknown> }
    const externalWrite = preserveMainOwnedAuthSettings(
      {
        auth: {
          deviceId: 'device-2',
          requiresReauthenticationOnNextStartup: false,
          useSecureStorage: false
        }
      },
      current
    ) as { auth?: Record<string, unknown> }

    expect(projection.auth).toEqual({ deviceId: 'device-1' })
    expect(externalWrite.auth).toEqual({
      deviceId: 'device-2',
      requiresReauthenticationOnNextStartup: true
    })
  })
})
