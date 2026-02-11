import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const DOC_COMMENTS_TABLE = 'doc_comments'

let schemaInitialized = false

export interface DocComment {
  id: string
  path: string
  userId: string
  userName: string | null
  userImage: string | null
  content: string
  createdAt: number
}

export interface DocCommentListResult {
  comments: DocComment[]
  total: number
  limit: number
  offset: number
}

export function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

export async function ensureCommentsSchema(db: D1Database) {
  if (schemaInitialized)
    return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_COMMENTS_TABLE} (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_image TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_doc_comments_path ON ${DOC_COMMENTS_TABLE} (path, created_at DESC);
  `).run()
  schemaInitialized = true
}

function mapRow(row: any): DocComment {
  return {
    id: row.id,
    path: row.path,
    userId: row.user_id,
    userName: row.user_name,
    userImage: row.user_image,
    content: row.content,
    createdAt: row.created_at,
  }
}

export function sanitizeContent(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePath(docPath: string): string {
  return docPath.replace(/^\/+|\/+$/g, '').toLowerCase()
}

export async function listComments(
  db: D1Database,
  path: string,
  options: { limit?: number, offset?: number } = {},
): Promise<{ comments: DocComment[] }> {
  const limit = Math.min(options.limit ?? 50, 100)

  const result = await db.prepare(
    `SELECT id, path, user_id, user_name, user_image, content, created_at
     FROM ${DOC_COMMENTS_TABLE}
     WHERE path = ?1
     ORDER BY created_at DESC
     LIMIT ?2`,
  ).bind(path, limit).all()

  return { comments: (result.results ?? []).map(mapRow) }
}

export async function createComment(
  db: D1Database,
  params: {
    path: string
    userId: string
    userName: string | null
    userImage: string | null
    content: string
  },
): Promise<DocComment> {
  const id = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  await db.prepare(
    `INSERT INTO ${DOC_COMMENTS_TABLE} (id, path, user_id, user_name, user_image, content, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(id, params.path, params.userId, params.userName, params.userImage, params.content, now).run()

  return {
    id,
    path: params.path,
    userId: params.userId,
    userName: params.userName,
    userImage: params.userImage,
    content: params.content,
    createdAt: now,
  }
}

export async function deleteComment(db: D1Database, commentId: string): Promise<void> {
  await db.prepare(
    `DELETE FROM ${DOC_COMMENTS_TABLE} WHERE id = ?1`,
  ).bind(commentId).run()
}

export async function getCommentOwner(db: D1Database, commentId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT user_id FROM ${DOC_COMMENTS_TABLE} WHERE id = ?1`,
  ).bind(commentId).first<{ user_id: string }>()
  return row?.user_id ?? null
}

export async function listAllComments(
  db: D1Database,
  options: { limit?: number, offset?: number, path?: string } = {},
): Promise<DocCommentListResult> {
  const limit = Math.min(options.limit ?? 20, 100)
  const offset = options.offset ?? 0

  let countSql = `SELECT COUNT(*) as total FROM ${DOC_COMMENTS_TABLE}`
  let listSql = `SELECT id, path, user_id, user_name, user_image, content, created_at FROM ${DOC_COMMENTS_TABLE}`
  const binds: any[] = []

  if (options.path) {
    countSql += ` WHERE path = ?1`
    listSql += ` WHERE path = ?1`
    binds.push(options.path)
  }

  listSql += ` ORDER BY created_at DESC LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
  binds.push(limit, offset)

  const countResult = await db.prepare(countSql).bind(...(options.path ? [options.path] : [])).first<{ total: number }>()
  const total = countResult?.total ?? 0

  const result = await db.prepare(listSql).bind(...binds).all()
  const comments = (result.results ?? []).map(mapRow)

  return { comments, total, limit, offset }
}

export async function getCommentStats(db: D1Database): Promise<{ total: number, recentCount: number }> {
  const totalResult = await db.prepare(
    `SELECT COUNT(*) as total FROM ${DOC_COMMENTS_TABLE}`,
  ).first<{ total: number }>()

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM ${DOC_COMMENTS_TABLE} WHERE created_at > ?1`,
  ).bind(weekAgo).first<{ cnt: number }>()

  return {
    total: totalResult?.total ?? 0,
    recentCount: recentResult?.cnt ?? 0,
  }
}
