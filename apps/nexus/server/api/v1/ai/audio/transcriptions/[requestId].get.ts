import { getRouterParam } from 'h3'
import { requireAppAuth } from '../../../../../utils/auth'
import { pollAsrTranscription } from '../../../../../utils/asrTranscriptionService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  return await pollAsrTranscription(event, userId, getRouterParam(event, 'requestId') ?? '')
})
