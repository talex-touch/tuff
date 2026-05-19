type StoreTranslate = (key: string, params?: unknown) => string

const ERROR_KEY_MAP: Record<string, string> = {
  PACKAGE_ID_REQUIRED: 'packageIdRequired',
  PACKAGE_ID_MISMATCH: 'packageIdMismatch',
  UNSUPPORTED_TARGET_PLUGIN: 'unsupportedTargetPlugin',
  UNSUPPORTED_CONTENT_PLUGIN: 'unsupportedContentPlugin',
  UNSUPPORTED_CONTENT_KIND: 'unsupportedContentKind',
  UNSUPPORTED_IMPORT_TARGET: 'unsupportedImportTarget',
  UNSUPPORTED_CONTENT_FORMAT: 'unsupportedContentFormat',
  CONTENT_INLINE_REQUIRED: 'contentInlineRequired',
  TARGET_PLUGIN_NOT_INSTALLED: 'targetPluginNotInstalled',
  PLUGIN_STORAGE_WRITE_FAILED: 'storageWriteFailed',
  NETWORK_ERROR: 'networkError',
  LIST_REQUEST_FAILED: 'listRequestFailed',
  INSTALL_COUNT_SYNC_FAILED: 'installCountSyncFailed',
  PLUGIN_CONTENT_INSTALL_FAILED: 'installFailed'
}

export function resolvePluginContentErrorReason(
  errorCode: string | null | undefined,
  t: StoreTranslate
): string {
  const normalized = errorCode?.trim()
  if (!normalized) {
    return t('store.detailDialog.contentErrors.installFailed')
  }

  const key = ERROR_KEY_MAP[normalized]
  if (key) {
    return t(`store.detailDialog.contentErrors.${key}`)
  }

  return normalized
}
