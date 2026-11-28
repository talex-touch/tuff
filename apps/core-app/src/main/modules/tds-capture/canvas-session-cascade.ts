import { createHash } from 'node:crypto'

export const MAX_CANVAS_CONVERSATION_ID_LENGTH = 256

/**
 * Validates and hashes a `conversationId` into a fixed 64-char SHA-256 hex digest.
 * Raw conversation IDs never touch SQLite keys, secure-store keys, or filesystem paths.
 */
export function hashCanvasConversationId(conversationId: unknown): string | null {
  if (typeof conversationId !== 'string') return null
  const normalized = conversationId.trim()
  if (!normalized || normalized.length > MAX_CANVAS_CONVERSATION_ID_LENGTH) {
    return null
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export interface TdsCanvasSessionCascadeHandler {
  markConversationDeleted: (conversationId: string) => void
  clearConversationDeletedTombstone: (conversationId: string) => void
  deleteForDeletedConversation: (conversationId: string) => Promise<void>
}

let activeCascadeHandler: TdsCanvasSessionCascadeHandler | null = null

/**
 * Registers the active main-process canvas session store so higher-layer DP6 conversation
 * lifecycle operations (`deleteConversation`, `applyConversationSyncDeletion`, `saveConversation`)
 * can fence late saves and cascade deletions without pulling Electron into DB-only modules.
 */
export function registerTdsCanvasSessionCascadeHandler(
  handler: TdsCanvasSessionCascadeHandler
): () => void {
  activeCascadeHandler = handler
  return () => {
    if (activeCascadeHandler === handler) {
      activeCascadeHandler = null
    }
  }
}

export function markTdsCanvasConversationDeleted(conversationId: string): void {
  activeCascadeHandler?.markConversationDeleted(conversationId)
}

export function clearTdsCanvasConversationDeletedTombstone(conversationId: string): void {
  activeCascadeHandler?.clearConversationDeletedTombstone(conversationId)
}

export async function deleteTdsCanvasSessionForConversation(conversationId: string): Promise<void> {
  if (!activeCascadeHandler) return
  await activeCascadeHandler.deleteForDeletedConversation(conversationId)
}
