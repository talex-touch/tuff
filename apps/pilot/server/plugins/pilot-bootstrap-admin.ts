import process from 'node:process'
import {
  ensurePilotLocalAuthSchema,
  isPilotLocalEmail,
  normalizePilotLocalEmail,
  normalizePilotLocalNickname,
  upsertPilotLocalUserByEmail,
} from '../utils/pilot-local-auth'

const BOOTSTRAP_CACHE_KEY = '__pilotBootstrapAdminInitialized'
const MIN_BOOTSTRAP_ADMIN_PASSWORD_LENGTH = 6

type GlobalBootstrapCache = typeof globalThis & {
  [BOOTSTRAP_CACHE_KEY]?: boolean
}

function resolveAdminEmail(): string {
  return normalizePilotLocalEmail(
    process.env.PILOT_BOOTSTRAP_ADMIN_EMAIL
    || 'admin@pilot.local',
  )
}

function resolveAdminPassword(): string {
  return String(
    process.env.PILOT_BOOTSTRAP_ADMIN_PASSWORD
    || '',
  ).trim()
}

function resolveAdminNickname(email: string): string {
  return normalizePilotLocalNickname(
    'Pilot Admin',
    email,
  )
}

function toBootstrapEvent(): any {
  return { context: {} }
}

export default defineNitroPlugin(async () => {
  if (!process.versions?.node) {
    return
  }

  const globalCache = globalThis as GlobalBootstrapCache
  if (globalCache[BOOTSTRAP_CACHE_KEY]) {
    return
  }
  globalCache[BOOTSTRAP_CACHE_KEY] = true

  const email = resolveAdminEmail()
  const password = resolveAdminPassword()
  if (!email) {
    console.info('[pilot][admin] bootstrap skipped (missing valid admin email)')
    return
  }

  if (password.length < MIN_BOOTSTRAP_ADMIN_PASSWORD_LENGTH) {
    console.info(`[pilot][admin] bootstrap skipped (PILOT_BOOTSTRAP_ADMIN_PASSWORD must be set and at least ${MIN_BOOTSTRAP_ADMIN_PASSWORD_LENGTH} chars)`)
    return
  }

  if (!isPilotLocalEmail(email)) {
    console.error(`[pilot][admin] bootstrap skipped (invalid admin email: ${email})`)
    return
  }

  const nickname = resolveAdminNickname(email)
  const event = toBootstrapEvent()

  try {
    await ensurePilotLocalAuthSchema(event)
    const account = await upsertPilotLocalUserByEmail(event, {
      email,
      password,
      nickname,
    })
    const action = account.created ? 'created' : 'updated'

    console.info(`[pilot][admin] bootstrap ${action}: email=${email}, userId=${account.userId}`)
  }
  catch (error: any) {
    const message = error?.message || String(error)
    console.error(`[pilot][admin] bootstrap failed: ${message}`)
  }
})
