import { requirePilotAuth } from '../../../../utils/auth'
import {
  getPilotMemoryPolicy,
  getPilotMemoryUserPreference,
  resolvePilotMemoryEnabled,
} from '../../../../utils/pilot-chat-memory'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const memoryPolicy = await getPilotMemoryPolicy(event)
  const userPreference = await getPilotMemoryUserPreference(event, auth.userId)
  const memoryEnabled = resolvePilotMemoryEnabled(memoryPolicy, undefined, userPreference)

  return quotaOk({
    memoryPolicy,
    memoryEnabled,
    userPreference,
  })
})
