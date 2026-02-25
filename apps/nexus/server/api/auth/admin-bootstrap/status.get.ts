import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { getAdminBootstrapState } from '../../../utils/authStore'

function hasBootstrapSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminBootstrap?.secret === 'string'
    ? config.adminBootstrap.secret.trim()
    : ''
  return secret.length > 0
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const state = await getAdminBootstrapState(event, userId)
  const enabled = hasBootstrapSecret(event)

  return {
    enabled,
    required: state.requiresBootstrap,
    adminExists: state.adminExists,
    isFirstUser: state.isFirstUser,
    canPromote: enabled && state.requiresBootstrap && state.isFirstUser,
  }
})
