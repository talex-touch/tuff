import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'
import { AGENT_TOOL_CONFIRMATION_TIMEOUT_MS } from './agent-tools'

/**
 * Host-owned file change review for one conversation.
 *
 * Main captures every record at the file tool's own executor boundary (write/delete/copy/move);
 * paths are project-relative display strings only. A client addresses a record by
 * `conversationId + reviewId` and never sends a path, content or root for rollback.
 */
export type FileReviewOperation = 'write' | 'delete' | 'copy' | 'move'

export type FileReviewStatus = 'recorded' | 'partial' | 'unsupported' | 'rolled_back' | 'rollback_failed'

export type FileReviewReason =
  | 'binary'
  | 'too_large'
  | 'snapshot_failed'
  | 'snapshot_missing'
  | 'capture_failed'
  | 'diff_limit'
  | 'read_only_evidence'
  | 'shell_mcp_unsupported'
  | 'operation_failed'
  | 'partial_failure'
  /** Credential/native auth path or credential-like content: no snapshot or diff is kept (A4). */
  | 'sensitive_content'

export type FileReviewRollbackCode =
  | 'REVIEW_NOT_FOUND'
  | 'REVIEW_READ_ONLY'
  | 'REVIEW_UNSUPPORTED'
  | 'REVIEW_AUTHORITY_CHANGED'
  | 'REVIEW_PERMISSION_DENIED'
  | 'REVIEW_APPROVAL_REQUIRED'
  | 'REVIEW_PATH_OUTSIDE_ROOT'
  | 'REVIEW_SYMLINK_CHANGED'
  | 'REVIEW_CONTENT_CONFLICT'
  | 'REVIEW_SNAPSHOT_MISSING'
  | 'REVIEW_SNAPSHOT_INVALID'
  | 'REVIEW_ROLLBACK_PARTIAL'
  | 'REVIEW_ROLLBACK_FAILED'
  | 'REVIEW_PERSIST_FAILED'

/** `exists: null` means the capture failed and existence is unknown; it never means absent. */
export interface FileReviewSide {
  exists: boolean | null
  /** Lowercase hex SHA-256 of the full content when it was hashed. */
  hash?: string
  size?: number
}

export interface FileReviewDiffLine {
  type: 'context' | 'add' | 'del'
  text: string
}

export interface FileReviewDiffHunk {
  header: string
  lines: FileReviewDiffLine[]
}

/**
 * Bounded line diff. `binary`/`tooLarge` carry no hunks; `truncated` means the diff budget ran out.
 * Counts are omitted when they were not computed, never reported as a fake zero.
 */
export interface FileReviewDiff {
  binary: boolean
  truncated: boolean
  tooLarge: boolean
  additions?: number
  deletions?: number
  hunks: FileReviewDiffHunk[]
}

export interface FileReviewPath {
  /** Project-relative display path. */
  path: string
  before: FileReviewSide
  after: FileReviewSide
  /** Present only on `get`; `list` omits diffs. */
  diff?: FileReviewDiff
  reason?: FileReviewReason
}

export interface FileReviewRecord {
  id: string
  conversationId: string
  /** Omitted on read-only evidence inherited by a fork. */
  runId?: string
  turnId?: string
  projectId: string
  operation: FileReviewOperation
  timestamp: number
  status: FileReviewStatus
  supported: boolean
  reason?: FileReviewReason
  paths: FileReviewPath[]
}

export interface FileReviewRollbackResult {
  ok: boolean
  code?: FileReviewRollbackCode
  review: FileReviewRecord | null
  /** Project-relative paths actually restored, including on partial failure. */
  restoredPaths: string[]
}

export interface FileReviewChangeNotification {
  conversationId: string
  reviewId: string
  updatedAt: number
}

export interface FileReviewIdentityRequest {
  conversationId: string
  reviewId: string
}

export const ConversationReviewEvents = {
  list: defineEvent('conversation-review')
    .module('api')
    .event('list')
    .define<{ conversationId: string }, FileReviewRecord[]>(),
  get: defineEvent('conversation-review')
    .module('api')
    .event('get')
    .define<FileReviewIdentityRequest, FileReviewRecord | null>(),
  rollback: defineEvent('conversation-review')
    .module('api')
    .event('rollback')
    .define<FileReviewIdentityRequest, FileReviewRollbackResult>(),
  changed: defineEvent('conversation-review')
    .module('push')
    .event('changed')
    .define<FileReviewChangeNotification, void>(),
} as const

export interface ConversationReviewSdk {
  list: (conversationId: string) => Promise<FileReviewRecord[]>
  get: (conversationId: string, reviewId: string) => Promise<FileReviewRecord | null>
  rollback: (conversationId: string, reviewId: string) => Promise<FileReviewRollbackResult>
  onChanged: (listener: (notification: FileReviewChangeNotification) => void) => () => void
}

export function createConversationReviewSdk(
  transport: Pick<ITuffTransport, 'send' | 'on'>,
): ConversationReviewSdk {
  return {
    list: conversationId => transport.send(ConversationReviewEvents.list, { conversationId }),
    get: (conversationId, reviewId) =>
      transport.send(ConversationReviewEvents.get, { conversationId, reviewId }),
    rollback: (conversationId, reviewId) =>
      transport.send(ConversationReviewEvents.rollback, { conversationId, reviewId }, {
        timeout: AGENT_TOOL_CONFIRMATION_TIMEOUT_MS + 15_000,
      }),
    onChanged: listener => transport.on(ConversationReviewEvents.changed, listener),
  }
}
