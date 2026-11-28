import type { RegisterPublisherSigningKeyInput } from '../../utils/pluginSigning'
import { readBody } from 'h3'
import { requireAuthOrApiKey } from '../../utils/auth'
import { registerPublisherSigningKey } from '../../utils/pluginSigning'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
  const body = await readBody<RegisterPublisherSigningKeyInput>(event)
  const key = await registerPublisherSigningKey(event, userId, body)
  return { key }
})
