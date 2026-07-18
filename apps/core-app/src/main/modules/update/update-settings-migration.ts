export interface UpdateInstallSettingsMigration {
  installOnNormalQuit: boolean
  shouldPersist: boolean
  removeLegacyInstallSetting: boolean
  removeLegacyPendingVersion: boolean
}

export function resolveUpdateInstallSettingsMigration(
  persisted: Record<string, unknown>,
  defaultInstallOnNormalQuit: boolean
): UpdateInstallSettingsMigration {
  const legacyInstallOnNormalQuit = persisted.autoInstallDownloadedUpdates
  const installOnNormalQuit =
    typeof persisted.installOnNormalQuit === 'boolean'
      ? persisted.installOnNormalQuit
      : typeof legacyInstallOnNormalQuit === 'boolean'
        ? legacyInstallOnNormalQuit
        : defaultInstallOnNormalQuit
  const removeLegacyInstallSetting = Object.prototype.hasOwnProperty.call(
    persisted,
    'autoInstallDownloadedUpdates'
  )
  const removeLegacyPendingVersion = Object.prototype.hasOwnProperty.call(
    persisted,
    'pendingInstallVersion'
  )

  return {
    installOnNormalQuit,
    shouldPersist:
      persisted.installOnNormalQuit !== installOnNormalQuit ||
      removeLegacyInstallSetting ||
      removeLegacyPendingVersion,
    removeLegacyInstallSetting,
    removeLegacyPendingVersion
  }
}
