import type { H3Event } from 'h3'
import { createError, getQuery, setHeader } from 'h3'
import { requirePilotAuth } from '../../../../../../utils/auth'
import {
  getPilotAttachmentObject,
  verifyPilotAttachmentSignedAccess,
} from '../../../../../../utils/pilot-attachment-storage'
import { requireSessionId } from '../../../../../../utils/pilot-http'
import { createPilotStoreAdapter, requirePilotDatabase } from '../../../../../../utils/pilot-store'

function resolveAttachmentId(event: H3Event): string {
  return String(event.context.params?.attachmentId || '').trim()
}

interface AttachmentRecord {
  id: string
  sessionId: string
  kind: 'image' | 'file'
  name: string
  mimeType: string
  size: number
  ref: string
}

function hasSignedAccess(event: H3Event, sessionId: string, attachmentId: string): boolean {
  const query = getQuery(event)
  const signature = String(query.sig || '').trim()
  const expiresAt = Number(query.exp)
  if (!signature || !Number.isFinite(expiresAt)) {
    return false
  }

  return verifyPilotAttachmentSignedAccess(event, {
    sessionId,
    attachmentId,
    expiresAt,
    signature,
  })
}

async function findAttachmentWithoutUserScope(event: H3Event, sessionId: string, attachmentId: string): Promise<AttachmentRecord | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT id, session_id, kind, name, mime_type, size, ref
    FROM pilot_chat_attachments
    WHERE session_id = ?1 AND id = ?2
    LIMIT 1
  `).bind(sessionId, attachmentId).first<{
    id: string
    session_id: string
    kind: string
    name: string
    mime_type: string
    size: number
    ref: string
  }>()

  if (!row) {
    return null
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind === 'image' ? 'image' : 'file',
    name: row.name,
    mimeType: row.mime_type,
    size: Number(row.size || 0),
    ref: row.ref,
  }
}

export default defineEventHandler(async (event) => {
  const sessionId = requireSessionId(event)
  const attachmentId = resolveAttachmentId(event)

  if (!attachmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'attachmentId is required',
    })
  }

  const signedAccess = hasSignedAccess(event, sessionId, attachmentId)
  const attachment = signedAccess
    ? await findAttachmentWithoutUserScope(event, sessionId, attachmentId)
    : await (async () => {
        const { userId } = requirePilotAuth(event)
        const store = createPilotStoreAdapter(event, userId)
        await store.runtime.ensureSchema()
        const attachments = await store.runtime.listAttachments(sessionId)
        return attachments.find(item => item.id === attachmentId) || null
      })()

  if (!attachment) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Attachment not found',
    })
  }

  const object = await getPilotAttachmentObject(event, attachment.ref)
  if (!object) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Attachment object not found',
    })
  }

  setHeader(event, 'Content-Type', attachment.mimeType || object.mimeType || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, max-age=600')
  setHeader(event, 'Content-Length', object.size)
  setHeader(event, 'Content-Disposition', `inline; filename="${encodeURIComponent(attachment.name || attachment.id)}"`)
  return object.bytes
})
