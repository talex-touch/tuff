import type { H3Event } from 'h3'
import type { PilotRouteComboItem } from './pilot-admin-routing-config'
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

export interface ResolveLangGraphOrchestratorOptions {
  preferLangGraph?: boolean
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

function isGraphComboAvailable(combo: PilotRouteComboItem | null | undefined): boolean {
  if (!combo || combo.enabled === false) {
    return false
  }
  return Boolean(normalizeText(combo.langgraphAssistantId))
}

function pickPreferredGraphCombo(
  routeCombos: PilotRouteComboItem[],
  requestedComboId: string,
): PilotRouteComboItem | null {
  if (!Array.isArray(routeCombos) || routeCombos.length <= 0) {
    return null
  }

  const requestedCombo = routeCombos.find(item => item.id === requestedComboId)
  if (isGraphComboAvailable(requestedCombo)) {
    return requestedCombo || null
  }

  const fallbackComboId = normalizeText(requestedCombo?.fallbackRouteComboId)
  if (fallbackComboId) {
    const fallbackCombo = routeCombos.find(item => item.id === fallbackComboId)
    if (isGraphComboAvailable(fallbackCombo)) {
      return fallbackCombo || null
    }
  }

  const defaultCombo = routeCombos.find(item => item.id === 'default-auto')
  if (isGraphComboAvailable(defaultCombo)) {
    return defaultCombo || null
  }

  const anyGraphCombo = routeCombos.find(item => isGraphComboAvailable(item))
  return anyGraphCombo || null
}

export async function resolveLangGraphOrchestratorDecision(
  event: H3Event,
  routeComboId: string,
  options: ResolveLangGraphOrchestratorOptions = {},
): Promise<LangGraphOrchestratorDecision> {
  const preferLangGraph = options.preferLangGraph === true
  const normalizedComboId = normalizeText(routeComboId) || 'default-auto'
  const routingConfig = await getPilotAdminRoutingConfig(event).catch(() => null)
  const routeCombos = Array.isArray(routingConfig?.routeCombos)
    ? routingConfig.routeCombos
    : []
  const requestedCombo = routeCombos.find(item => item.id === normalizedComboId)
  const preferredCombo = preferLangGraph
    ? pickPreferredGraphCombo(routeCombos, normalizedComboId)
    : null
  const combo = preferredCombo || requestedCombo || null
  const resolvedComboId = normalizeText(combo?.id) || normalizedComboId

  if (!combo || combo.enabled === false) {
    return {
      mode: 'deepagent',
      available: false,
      reason: preferLangGraph
        ? 'pilot_mode_graph_combo_missing_or_disabled'
        : 'route_combo_missing_or_disabled',
      routeComboId: resolvedComboId,
    }
  }

  const assistantId = normalizeText(combo.langgraphAssistantId)
  if (!assistantId) {
    return {
      mode: 'deepagent',
      available: false,
      reason: preferLangGraph
        ? 'pilot_mode_graph_combo_not_bound'
        : 'langgraph_assistant_not_bound',
      routeComboId: resolvedComboId,
      graphProfile: normalizeText(combo.graphProfile) || undefined,
    }
  }

  const endpoint = resolveRuntimeLocalServerUrl(event)
  if (!endpoint) {
    return {
      mode: 'deepagent',
      available: false,
      reason: 'langgraph_local_server_not_configured',
      routeComboId: resolvedComboId,
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
      routeComboId: resolvedComboId,
      assistantId,
      graphProfile: normalizeText(combo.graphProfile) || undefined,
      endpoint,
    }
  }

  return {
    mode: 'langgraph-local',
    available: true,
    reason: preferLangGraph && resolvedComboId !== normalizedComboId
      ? 'pilot_mode_promoted_to_langgraph'
      : 'langgraph_local_server_ready',
    routeComboId: resolvedComboId,
    assistantId,
    graphProfile: normalizeText(combo.graphProfile) || undefined,
    endpoint,
    apiKey: resolveRuntimeLocalServerApiKey(event) || undefined,
  }
}
