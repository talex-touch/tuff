type InstallPromptTranslate = (key: string, params?: Record<string, unknown>) => string

export function isPluginAlreadyInstalledMessage(message: unknown): boolean {
  return message === 'plugin already exists'
}

export function resolvePluginApplyInstallErrorMessage(
  message: unknown,
  t: InstallPromptTranslate
): string {
  const normalized = typeof message === 'string' ? message.trim() : ''

  if (!normalized) {
    return t('plugin.dropInstall.installFailed')
  }

  if (normalized === '10091') {
    return t('plugin.dropInstall.corrupted')
  }

  if (normalized === '10092' || normalized === 'INTERNAL_ERROR') {
    return t('plugin.dropInstall.invalidPackage')
  }

  return t('plugin.dropInstall.installFailed')
}
