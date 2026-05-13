import { createError, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { invokeIntelligenceCapability } from '../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object' || typeof body.capabilityId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'capabilityId is required.' })
  }

  const invocation = await invokeIntelligenceCapability(event, userId, {
    capabilityId: body.capabilityId,
    payload: body.payload,
    options: body.options,
  })

  return { invocation }
})
