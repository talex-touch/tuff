function includesMissingDocsTableMessage(value: string) {
  const normalized = value.toLowerCase()
  return normalized.includes('no such table') && normalized.includes('_content_docs')
}

function readObjectValue(record: Record<string, unknown>, key: string) {
  try {
    return record[key]
  }
  catch {
    return undefined
  }
}

export function isMissingDocsContentTableError(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error)
    return false

  if (typeof error === 'string')
    return includesMissingDocsTableMessage(error)

  if (error instanceof Error) {
    if (includesMissingDocsTableMessage(`${error.message}\n${error.stack ?? ''}`))
      return true
  }

  if (typeof error !== 'object')
    return false

  if (seen.has(error))
    return false
  seen.add(error)

  const record = error as Record<string, unknown>
  const values = [
    readObjectValue(record, 'message'),
    readObjectValue(record, 'stack'),
    readObjectValue(record, 'statusMessage'),
    readObjectValue(record, 'statusText'),
    readObjectValue(record, 'data'),
    readObjectValue(record, 'cause'),
    readObjectValue(record, 'response'),
  ]

  for (const value of values) {
    if (isMissingDocsContentTableError(value, seen))
      return true
  }

  const response = readObjectValue(record, 'response')
  if (response && typeof response === 'object')
    return isMissingDocsContentTableError(readObjectValue(response as Record<string, unknown>, '_data'), seen)

  return false
}
