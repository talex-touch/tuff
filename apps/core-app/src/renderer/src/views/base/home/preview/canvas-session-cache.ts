import type {
  TdsCanvasFrame,
  TdsCanvasHistoryState,
  TdsCanvasNote
} from '~/components/tds-canvas/types'

export interface InMemoryCanvasSession {
  version: 1
  frames: TdsCanvasFrame[]
  notes: TdsCanvasNote[]
  selectedFrameId: string | null
  history: TdsCanvasHistoryState
  deletedAutoFrameIds: string[]
  antiSlop: boolean
  canvasThemePackId?: string | null
}

const MAX_IN_MEMORY_CANVAS_SESSIONS = 32

/**
 * Process-local in-memory session cache per conversation.
 * Assistant HTML/SVG frame bodies, snapshot history blobs, and pin notes MUST NEVER
 * be persisted to browser `sessionStorage` / `localStorage`.
 */
const inMemoryCanvasSessions = new Map<string, InMemoryCanvasSession>()

export function cloneInMemoryCanvasSession(session: InMemoryCanvasSession): InMemoryCanvasSession {
  return {
    version: 1,
    frames: session.frames.map((frame) => ({ ...frame })),
    notes: session.notes.map((note) => ({ ...note })),
    selectedFrameId: session.selectedFrameId,
    history: {
      blobs: { ...session.history.blobs },
      entries: session.history.entries.map((entry) => ({
        ...entry,
        frameSnapshots: entry.frameSnapshots.map((snapshot) => ({ ...snapshot }))
      })),
      cursor: session.history.cursor
    },
    deletedAutoFrameIds: [...session.deletedAutoFrameIds],
    antiSlop: session.antiSlop,
    canvasThemePackId: session.canvasThemePackId ?? null
  }
}

export function getInMemoryCanvasSessionKey(conversationId: string | null): string {
  return conversationId?.trim() || 'default'
}

export function getPersistedConversationId(conversationId: string | null): string | null {
  const cleanId = conversationId?.trim() ?? ''
  return cleanId.length > 0 ? cleanId : null
}

export function readInMemoryCanvasSession(
  conversationId: string | null
): InMemoryCanvasSession | null {
  const key = getInMemoryCanvasSessionKey(conversationId)
  const stored = inMemoryCanvasSessions.get(key)
  if (!stored) return null
  // Refresh LRU recency
  inMemoryCanvasSessions.delete(key)
  inMemoryCanvasSessions.set(key, stored)
  return cloneInMemoryCanvasSession(stored)
}

export function writeInMemoryCanvasSession(
  conversationId: string | null,
  session: InMemoryCanvasSession
): void {
  const key = getInMemoryCanvasSessionKey(conversationId)
  inMemoryCanvasSessions.delete(key)
  inMemoryCanvasSessions.set(key, cloneInMemoryCanvasSession(session))
  while (inMemoryCanvasSessions.size > MAX_IN_MEMORY_CANVAS_SESSIONS) {
    const oldestKey = inMemoryCanvasSessions.keys().next().value
    if (oldestKey === undefined) break
    inMemoryCanvasSessions.delete(oldestKey)
  }
}

export function __resetHomeSideCanvasSessionsForTesting(): void {
  inMemoryCanvasSessions.clear()
}
