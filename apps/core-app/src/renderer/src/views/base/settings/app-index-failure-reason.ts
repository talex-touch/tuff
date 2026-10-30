/**
 * Why an app index request failed, in the interface language.
 *
 * The app index handlers refuse with a kebab-case code (`entry-not-found`, `not-app`) and report a
 * failure they caught with its text. A code this table words reads as its sentence. A code it does
 * not word - an empty path or flag, which only a broken caller sends - has nothing to add to the
 * caller's own "Failed to …" line, and any other text is shown as it came: it is the only diagnosis.
 */
type AppIndexFailureTranslate = (key: string) => string

const REASON_KEYS: Record<string, string> = {
  'db-not-ready': 'dbNotReady',
  'search-index-not-ready': 'searchIndexNotReady',
  'entry-not-found': 'notFound',
  'entry-missing': 'notFound',
  'target-not-found': 'notFound',
  'not-found': 'notFound',
  'not-user-managed': 'notUserManaged',
  'invalid-path': 'invalidPath',
  'not-app': 'notApp',
  unstable: 'unstable',
  processing: 'processing',
  'scan-failed': 'scanFailed'
}

const REASON_CODE = /^[a-z]+(?:-[a-z]+)*$/

export function describeAppIndexFailure(
  reason: string | null | undefined,
  t: AppIndexFailureTranslate
): string | undefined {
  const normalized = reason?.trim()
  if (!normalized) return undefined

  const key = REASON_KEYS[normalized]
  if (key) return t(`settings.settingFileIndex.appIndexManagerReasons.${key}`)

  return REASON_CODE.test(normalized) ? undefined : normalized
}
