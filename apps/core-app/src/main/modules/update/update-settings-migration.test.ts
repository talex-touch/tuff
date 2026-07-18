import { describe, expect, it } from 'vitest'
import { resolveUpdateInstallSettingsMigration } from './update-settings-migration'

describe('resolveUpdateInstallSettingsMigration', () => {
  it('prefers the new install-on-normal-quit setting over a conflicting legacy value', () => {
    expect(
      resolveUpdateInstallSettingsMigration(
        { installOnNormalQuit: false, autoInstallDownloadedUpdates: true },
        true
      )
    ).toEqual({
      installOnNormalQuit: false,
      shouldPersist: true,
      removeLegacyInstallSetting: true,
      removeLegacyPendingVersion: false
    })
  })

  it.each([
    ['true', true],
    ['false', false]
  ])('preserves a legacy %s install-on-normal-quit choice', (_name, legacyValue) => {
    expect(
      resolveUpdateInstallSettingsMigration({ autoInstallDownloadedUpdates: legacyValue }, true)
    ).toEqual({
      installOnNormalQuit: legacyValue,
      shouldPersist: true,
      removeLegacyInstallSetting: true,
      removeLegacyPendingVersion: false
    })
  })

  it('uses the supplied true default when neither install setting exists', () => {
    expect(resolveUpdateInstallSettingsMigration({}, true)).toEqual({
      installOnNormalQuit: true,
      shouldPersist: true,
      removeLegacyInstallSetting: false,
      removeLegacyPendingVersion: false
    })
  })

  it('marks a legacy pending-install key for removal and persistence', () => {
    expect(
      resolveUpdateInstallSettingsMigration(
        { installOnNormalQuit: false, pendingInstallVersion: 'v2.5.0' },
        true
      )
    ).toEqual({
      installOnNormalQuit: false,
      shouldPersist: true,
      removeLegacyInstallSetting: false,
      removeLegacyPendingVersion: true
    })
  })
})
