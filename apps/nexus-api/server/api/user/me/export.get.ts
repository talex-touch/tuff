import { defineEventHandler, setResponseHeader } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { buildUserPrivacyExport } from '../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const payload = await buildUserPrivacyExport(event, userId)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `tuff-account-data-${date}.json`

  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${filename}"`)
  setResponseHeader(event, 'cache-control', 'private, no-store')

  return JSON.stringify(payload, null, 2)
})
