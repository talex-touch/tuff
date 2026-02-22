import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { overrideDefenseMode, type DefenseMode } from './defenseModeController'
import { unblockIp } from './ipSecurityStore'
import { deleteIpBan, setIpBanEnabled, upsertIpBan } from './intelligenceStore'

export type RiskActionType = 'risk.mode.override' | 'risk.actor.unblock' | 'risk.case.review'

export interface RiskModeOverridePayload {
  mode: DefenseMode
  reason?: string | null
}

export interface RiskActorUnblockPayload {
  actors: string[]
  reason?: string | null
}

export type RiskCaseReviewPayload =
  | {
    kind: 'ip-ban-upsert'
    ip: string
    enabled: boolean
    reason?: string | null
    expiresAt?: string | null
    permanent?: boolean
  }
  | {
    kind: 'ip-ban-toggle'
    id: string
    enabled: boolean
    reason?: string | null
  }
  | {
    kind: 'ip-ban-delete'
    id: string
    reason?: string | null
  }

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(',')}}`
}

export function digestRiskPayload(payload: unknown): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

export function normalizeActorList(payload: { actor?: unknown, actors?: unknown }): string[] {
  const values: string[] = []
  if (typeof payload.actor === 'string' && payload.actor.trim())
    values.push(payload.actor.trim())
  if (Array.isArray(payload.actors)) {
    for (const actor of payload.actors) {
      if (typeof actor === 'string' && actor.trim())
        values.push(actor.trim())
    }
  }
  return Array.from(new Set(values))
}

export function shouldRequireDualControl(action: RiskActionType, payload: unknown): boolean {
  if (action === 'risk.mode.override') {
    const mode = String((payload as RiskModeOverridePayload)?.mode || '').toUpperCase()
    return mode === 'NORMAL'
  }

  if (action === 'risk.actor.unblock') {
    const actors = (payload as RiskActorUnblockPayload)?.actors || []
    return Array.isArray(actors) && actors.length > 50
  }

  if (action === 'risk.case.review') {
    const casePayload = payload as RiskCaseReviewPayload
    return casePayload?.kind === 'ip-ban-upsert'
      && casePayload.enabled === true
      && casePayload.permanent === true
  }

  return false
}

export async function executeRiskModeOverride(event: H3Event, payload: RiskModeOverridePayload, actorId: string) {
  const mode = String(payload.mode || '').toUpperCase()
  if (mode !== 'NORMAL' && mode !== 'ELEVATED' && mode !== 'EXTREME') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid defense mode.' })
  }
  await overrideDefenseMode(event, {
    mode,
    actorId,
    reason: payload.reason ?? null,
  })
  return { mode }
}

export async function executeRiskActorUnblock(event: H3Event, payload: RiskActorUnblockPayload) {
  const actors = normalizeActorList({ actors: payload.actors })
  if (actors.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No actor to unblock.' })
  }

  const results: Array<{ actor: string, success: boolean }> = []
  for (const actor of actors) {
    const success = await unblockIp(event, actor)
    await upsertIpBan(event, {
      ip: actor,
      enabled: false,
      reason: payload.reason ?? null,
    })
    results.push({ actor, success })
  }

  const successCount = results.filter(item => item.success).length
  return {
    total: actors.length,
    success: successCount > 0,
    successCount,
    results,
  }
}

export async function executeRiskCaseReview(event: H3Event, payload: RiskCaseReviewPayload) {
  if (payload.kind === 'ip-ban-upsert') {
    const ip = payload.ip?.trim()
    if (!ip) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid ip.' })
    }
    const ban = await upsertIpBan(event, {
      ip,
      reason: payload.reason ?? null,
      enabled: payload.enabled,
      expiresAt: payload.expiresAt ?? null,
    })
    return { kind: payload.kind, ban }
  }

  if (payload.kind === 'ip-ban-toggle') {
    const id = payload.id?.trim()
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid id.' })
    }
    await setIpBanEnabled(event, id, payload.enabled)
    return { kind: payload.kind, id, enabled: payload.enabled }
  }

  if (payload.kind === 'ip-ban-delete') {
    const id = payload.id?.trim()
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid id.' })
    }
    await deleteIpBan(event, id)
    return { kind: payload.kind, id, deleted: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'Unsupported case review payload.' })
}
