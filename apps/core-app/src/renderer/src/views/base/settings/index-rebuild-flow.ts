export interface IndexRebuildResultLike {
  success?: boolean
  requiresConfirm?: boolean
  message?: string
  error?: string
  reason?: string
}

export type IndexRebuildOutcome =
  | { type: 'confirm' }
  | { type: 'success'; message: string }
  | { type: 'failure'; message: string }

export function resolveIndexRebuildOutcome(
  result: IndexRebuildResultLike | null | undefined,
  messages: { success: string; failure: string }
): IndexRebuildOutcome {
  if (result?.requiresConfirm) {
    return { type: 'confirm' }
  }

  if (result?.success) {
    return {
      type: 'success',
      message: messages.success || result.message || ''
    }
  }

  return {
    type: 'failure',
    message: result?.error || result?.reason || messages.failure
  }
}
