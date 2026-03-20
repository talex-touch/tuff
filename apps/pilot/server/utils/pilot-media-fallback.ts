import type { H3Event } from 'h3'
import type { PilotCapabilityId } from './pilot-admin-routing-config'
import type { PilotIntentType, PilotRoutingResolveResult } from './pilot-routing-resolver'
import { resolvePilotRoutingSelection } from './pilot-routing-resolver'

export interface PilotMediaFallbackAttempt {
  routeKey: string
  channelId: string
  providerModel: string
  errorCode?: string
  errorMessage?: string
}

export interface PilotMediaRoutingContext {
  requestChannelId?: string
  sessionChannelId?: string
  requestedModelId?: string
  routeComboId?: string
  internet?: boolean
  thinking?: boolean
  intentType?: PilotIntentType
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    return ''
  }
  const row = error as Record<string, unknown>
  return normalizeText(row.code).toUpperCase()
}

export async function executePilotMediaWithFallback<T>(input: {
  event: H3Event
  capability: PilotCapabilityId
  context: PilotMediaRoutingContext
  initialSelection?: PilotRoutingResolveResult
  maxAttempts?: number
  execute: (selection: PilotRoutingResolveResult, attemptIndex: number) => Promise<T>
}): Promise<{
  result: T
  selected: PilotRoutingResolveResult
  attempts: PilotMediaFallbackAttempt[]
}> {
  const maxAttempts = Math.min(Math.max(Math.floor(Number(input.maxAttempts) || 8), 1), 24)
  const excludedRouteKeys = new Set<string>()
  const attempts: PilotMediaFallbackAttempt[] = []
  let selection: PilotRoutingResolveResult | null = input.initialSelection || null
  let lastError: unknown = null

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    if (!selection) {
      selection = await resolvePilotRoutingSelection(input.event, {
        requestChannelId: input.context.requestChannelId,
        sessionChannelId: input.context.sessionChannelId,
        requestedModelId: input.context.requestedModelId,
        routeComboId: input.context.routeComboId,
        internet: input.context.internet,
        thinking: input.context.thinking,
        intentType: input.context.intentType,
        requiredCapability: input.capability,
        excludeRouteKeys: Array.from(excludedRouteKeys),
      })
    }

    const routeKey = normalizeText(selection.routeKey)
    if (!routeKey || excludedRouteKeys.has(routeKey)) {
      selection = null
      continue
    }

    try {
      const result = await input.execute(selection, attemptIndex)
      attempts.push({
        routeKey,
        channelId: selection.channelId,
        providerModel: selection.providerModel,
      })
      return {
        result,
        selected: selection,
        attempts,
      }
    }
    catch (error) {
      lastError = error
      attempts.push({
        routeKey,
        channelId: selection.channelId,
        providerModel: selection.providerModel,
        errorCode: normalizeErrorCode(error),
        errorMessage: error instanceof Error ? error.message : normalizeText(error),
      })
      excludedRouteKeys.add(routeKey)
      selection = null
    }
  }

  if (lastError) {
    throw lastError
  }
  throw new Error(`No available provider route for capability: ${input.capability}`)
}
