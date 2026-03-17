import type { H3Event } from 'h3'
import process from 'node:process'
import { networkClient } from '@talex-touch/utils/network'
import { getPilotAdminRoutingConfig } from './pilot-admin-routing-config'

export interface LangGraphOrchestratorDecision {
  mode: 'langgraph-local' | 'deepagent'
  available: boolean
  reason: string
  routeComboId: string
  assistantId?: string
  graphProfile?: string
  endpoint?: string
  apiKey?: string
}

const HEALTH_CHECK_TIMEOUT_MS = 1_500

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function resolveRuntimeLocalServerUrl(event: H3Event): string {
  const runtimePilot = (event.context as any)?.runtimeConfig?.pilot || {}
  return normalizeText(
    runtimePilot.PILOT_LANGGRAPH_LOCAL_SERVER_URL
    || runtimePilot.langgraphLocalServerUrl
    || process.env.PILOT_LANGGRAPH_LOCAL_SERVER_URL,
  )
}

function resolveRuntimeLocalServerApiKey(event: H3Event): string {
  const runtimePilot = (event.context as any)?.runtimeConfig?.pilot || {}
  return normalizeText(
    runtimePilot.PILOT_LANGGRAPH_LOCAL_SERVER_API_KEY
    || runtimePilot.langgraphLocalServerApiKey
    || process.env.PILOT_LANGGRAPH_LOCAL_SERVER_API_KEY,
  )
}

async function checkServerHealth(url: string): Promise<boolean> {
  const endpoint = `${url.replace(/\/+$/, '')}/health`
  try {
    const response = await networkClient.request({
      method: 'GET',
      url: endpoint,
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    })
    return response.status >= 200 && response.status < 300
  }
  catch {
    return false
  }
}

export async function resolveLangGraphOrchestratorDecision(
  event: H3Event,
  routeComboId: string,
): Promise<LangGraphOrchestratorDecision> {
  const normalizedComboId = normalizeText(routeComboId) || 'default-auto'
  const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => null)
  const combo = routingConfig?.routeCombos?.find(item => item.id === normalizedComboId)

  if (!combo || combo.enabled === false) {
    return {
      mode: 'deepagent',
      available: false,
      reason: 'route_combo_missing_or_disabled',
      routeComboId: normalizedComboId,
    }
  }

  const assistantId = normalizeText(combo.langgraphAssistantId)
  if (!assistantId) {
    return {
      mode: 'deepagent',
      available: false,
      reason: 'langgraph_assistant_not_bound',
      routeComboId: normalizedComboId,
      graphProfile: normalizeText(combo.graphProfile) || undefined,
    }
  }

  const endpoint = resolveRuntimeLocalServerUrl(event)
  if (!endpoint) {
    return {
      mode: 'deepagent',
      available: false,
      reason: 'langgraph_local_server_not_configured',
      routeComboId: normalizedComboId,
      assistantId,
      graphProfile: normalizeText(combo.graphProfile) || undefined,
    }
  }

  const healthy = await checkServerHealth(endpoint)
  if (!healthy) {
    return {
      mode: 'deepagent',
      available: false,
      reason: 'langgraph_local_server_unavailable',
      routeComboId: normalizedComboId,
      assistantId,
      graphProfile: normalizeText(combo.graphProfile) || undefined,
      endpoint,
    }
  }

  return {
    mode: 'langgraph-local',
    available: true,
    reason: 'langgraph_local_server_ready',
    routeComboId: normalizedComboId,
    assistantId,
    graphProfile: normalizeText(combo.graphProfile) || undefined,
    endpoint,
    apiKey: resolveRuntimeLocalServerApiKey(event) || undefined,
  }
}
