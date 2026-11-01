/**
 * The sentences main answers with when it does not say why something failed.
 *
 * A channel that keeps its failures to itself - `safeApiHandler`, `safeOpHandler`, an operational
 * error report - answers with one of these in place of the internal message, so nothing internal
 * reaches a page or a plugin by accident. They stay English because logs and plugins read them
 * too; a page shows them in the interface language through `describePublicFailure`.
 */

type PublicFailureTranslate = (key: string) => string

export const PublicFailure = {
  OperationFailed: 'The operation failed. Please retry.',
  DatabaseBusy: 'Database is busy. Please retry.',
  IndexWriterBusy: 'The index writer is busy. Please retry.'
} as const

const PUBLIC_FAILURE_KEYS: Record<string, string> = {
  [PublicFailure.OperationFailed]: 'operationFailed',
  [PublicFailure.DatabaseBusy]: 'databaseBusy',
  [PublicFailure.IndexWriterBusy]: 'indexWriterBusy'
}

/** One of the sentences above in the interface language; any other text is returned as it is. */
export function describePublicFailure(text: string, t: PublicFailureTranslate): string {
  const key = PUBLIC_FAILURE_KEYS[text.trim()]
  return key ? t(`common.failures.${key}`) : text
}
