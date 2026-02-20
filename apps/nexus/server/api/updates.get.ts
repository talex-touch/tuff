import { createHash } from 'node:crypto'
import { getHeader, getQuery, setHeader, setResponseStatus } from 'h3'
import { listUpdates } from '../utils/dashboardStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const scope = typeof query.scope === 'string' ? query.scope : 'web'
  const type = typeof query.type === 'string' ? query.type : undefined
  const channel = typeof query.channel === 'string' ? query.channel : undefined

  const updates = await listUpdates(event, {
    scope: scope as any,
    type: type as any,
    channel: channel as string | undefined,
  })

  if (updates.length > 0) {
    const fingerprint = updates
      .map(update => `${update.id}:${update.updatedAt}:${update.payloadSha256 ?? ''}`)
      .join('|')
    const etag = `"${createHash('sha256').update(fingerprint).digest('hex')}"`
    const ifNoneMatch = getHeader(event, 'if-none-match')
    if (ifNoneMatch && ifNoneMatch === etag) {
      setResponseStatus(event, 304)
      return ''
    }
    setHeader(event, 'etag', etag)
  }

  return { updates }
})
