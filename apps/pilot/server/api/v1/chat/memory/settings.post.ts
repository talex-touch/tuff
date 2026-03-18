import { requirePilotAuth } from '../../../../utils/auth'
import {
  getPilotMemoryPolicy,
  resolvePilotMemoryEnabled,
  setPilotMemoryUserPreference,
} from '../../../../utils/pilot-chat-memory'
import { quotaError, quotaOk } from '../../../../utils/quota-api'

interface UpdateMemorySettingsBody {
  memoryEnabled?: boolean
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<UpdateMemorySettingsBody>(event)
  if (typeof body?.memoryEnabled !== 'boolean') {
    return quotaError(400, 'memoryEnabled must be boolean', null)
  }

  const memoryPolicy = await getPilotMemoryPolicy(event)
  if (!memoryPolicy.allowUserDisable) {
    return quotaError(403, 'memory toggle is disabled by policy', {
      memoryPolicy,
    })
  }

  const userPreference = await setPilotMemoryUserPreference(event, auth.userId, body.memoryEnabled)
  const memoryEnabled = resolvePilotMemoryEnabled(memoryPolicy, undefined, userPreference)

  return quotaOk({
    memoryPolicy,
    memoryEnabled,
    userPreference,
  })
})
