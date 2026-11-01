export interface SearchRow {
  id: string
  kind: string
  /** The title the row shows; file rows carry the file name including its extension. */
  name: string
  /** File path or app bundle path, absolute, when the item has one. */
  path?: string
  sourceId: string
  score: number | null
}

export interface SearchAnswer {
  /** The list a user would see once the stream has settled, in display order. */
  rows: SearchRow[]
  /** From sending the query to the end signal; to the timeout when no end signal arrived. */
  answerMs: number
  /** False when the answer was cut at the timeout: absence cannot be confirmed from it. */
  endSignalSeen: boolean
  /** Snapshot plus update batches the answer was merged from; diagnostics only. */
  batches?: number
}

export interface SearchOptions {
  timeoutMs: number
  signal?: AbortSignal
}

export interface SearchDriver {
  /** Rejects with a `DriverError` when the app could not be observed; an empty list is an answer. */
  search: (query: string, options: SearchOptions) => Promise<SearchAnswer>
}
