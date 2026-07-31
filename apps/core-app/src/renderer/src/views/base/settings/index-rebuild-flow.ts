export interface IndexRebuildResultLike {
  success?: boolean
  requiresConfirm?: boolean
  errorCode?: string
  retryable?: boolean
  reportId?: string
  reason?: string
  battery?: { level: number; charging: boolean } | null
  threshold?: number
}

export type IndexRebuildOutcome =
  | { type: 'confirm'; result: IndexRebuildResultLike }
  | { type: 'success'; message: string }
  | { type: 'failure'; message: string; reportId?: string }

/**
 * Resolve a rebuild result into a renderer outcome using ONLY localized copy
 * and stable fields (issue #476). Raw `error`/`reason`/`message` text from the
 * transport payload is never used for display.
 */
export function resolveIndexRebuildOutcome(
  result: IndexRebuildResultLike | null | undefined,
  messages: { success: string; failure: string; errors?: Record<string, string> }
): IndexRebuildOutcome {
  if (result?.requiresConfirm) {
    return { type: 'confirm', result }
  }

  if (result?.success) {
    return {
      type: 'success',
      message: messages.success
    }
  }

  const codeMessage = result?.errorCode ? messages.errors?.[result.errorCode] : undefined
  return {
    type: 'failure',
    message: codeMessage || messages.failure,
    reportId: result?.reportId
  }
}
