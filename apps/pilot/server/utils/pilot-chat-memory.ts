import type { H3Event } from 'h3'
import { getPilotAdminRoutingConfig } from './pilot-admin-routing-config'
import { getPilotEntity, upsertPilotEntity } from './pilot-entity-store'

const MEMORY_PREFERENCE_DOMAIN = 'chat.memory.preference'

export interface PilotMemoryPolicyResolved {
  enabledByDefault: boolean
  allowUserDisable: boolean
  allowUserClear: boolean
}

const DEFAULT_MEMORY_POLICY: PilotMemoryPolicyResolved = {
  enabledByDefault: true,
  allowUserDisable: true,
  allowUserClear: true,
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

export function normalizePilotMemoryPolicy(value: unknown): PilotMemoryPolicyResolved {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...DEFAULT_MEMORY_POLICY,
    }
  }

  const row = value as Record<string, unknown>
  return {
    enabledByDefault: toBoolean(row.enabledByDefault, DEFAULT_MEMORY_POLICY.enabledByDefault),
    allowUserDisable: toBoolean(row.allowUserDisable, DEFAULT_MEMORY_POLICY.allowUserDisable),
    allowUserClear: toBoolean(row.allowUserClear, DEFAULT_MEMORY_POLICY.allowUserClear),
  }
}

export async function getPilotMemoryPolicy(event: H3Event): Promise<PilotMemoryPolicyResolved> {
  const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => null)
  return normalizePilotMemoryPolicy(routingConfig?.memoryPolicy)
}

export async function getPilotMemoryUserPreference(
  event: H3Event,
  userId: string,
): Promise<boolean | null> {
  const entity = await getPilotEntity(event, MEMORY_PREFERENCE_DOMAIN, userId)
  if (!entity || typeof entity !== 'object') {
    return null
  }
  if (typeof entity.memoryEnabled === 'boolean') {
    return entity.memoryEnabled
  }
  return null
}

export async function setPilotMemoryUserPreference(
  event: H3Event,
  userId: string,
  memoryEnabled: boolean,
): Promise<boolean> {
  const normalized = Boolean(memoryEnabled)
  const record = await upsertPilotEntity(event, {
    domain: MEMORY_PREFERENCE_DOMAIN,
    id: userId,
    payload: {
      memoryEnabled: normalized,
    },
  })
  return Boolean(record?.memoryEnabled)
}

export function resolvePilotMemoryEnabled(
  policy: PilotMemoryPolicyResolved,
  requested?: boolean,
  userPreference?: boolean | null,
): boolean {
  if (typeof requested === 'boolean') {
    if (!policy.allowUserDisable) {
      return policy.enabledByDefault
    }
    return requested
  }

  if (policy.allowUserDisable && typeof userPreference === 'boolean') {
    return userPreference
  }

  return policy.enabledByDefault
}
