import type { D1Database } from '@cloudflare/workers-types'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

export const DOC_FEEDBACK_TABLE = 'doc_feedback'

const DOC_FEEDBACK_SCHEMA = defineD1Schema('doc-feedback', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${DOC_FEEDBACK_TABLE} (
      path TEXT NOT NULL,
      user_id TEXT NOT NULL,
      helpful INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (path, user_id)
    )`,
  ],
})

export async function ensureDocFeedbackSchema(db: D1Database): Promise<void> {
  await ensureD1Schema(db, DOC_FEEDBACK_SCHEMA)
}

export function normalizeDocFeedbackPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}
