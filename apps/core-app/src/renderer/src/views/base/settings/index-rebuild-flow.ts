export interface IndexRebuildResultLike {
  success?: boolean
  requiresConfirm?: boolean
  message?: string
  error?: string
  reason?: string
  errorCode?: string
  retryable?: boolean
  reportId?: string
  battery?: { level: number; charging: boolean } | null
  threshold?: number
}

export type IndexRebuildOutcome =
  | { type: 'confirm'; result: IndexRebuildResultLike }
  | { type: 'success'; message: string }
  | { type: 'failure'; message: string }

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
      message: messages.success || result.message || ''
    }
  }

  const codeMessage = result?.errorCode ? messages.errors?.[result.errorCode] : undefined
  return {
    type: 'failure',
    message: codeMessage || result?.error || result?.reason || messages.failure
  }
}
