import type {
  TuffIntelligenceAgentSession,
  TuffIntelligenceAgentTraceEvent,
  IntelligenceInvokeOptions,
  TuffIntelligenceActionGraph,
  TuffIntelligenceActionNode,
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceSession,
  TuffIntelligenceStateSnapshot,
  TuffIntelligenceTraceEvent,
  TuffIntelligenceTurn
} from '@talex-touch/tuff-intelligence'
import { sleep } from '@talex-touch/utils/common/utils'
import type { ToolExecutionContext } from './agents/tool-registry'
import { eq, like } from 'drizzle-orm'
import { config } from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'
import { agentManager } from './agents'
import { toolRegistry } from './agents/tool-registry'
import { tuffIntelligence } from './intelligence-sdk'
import {
  formatStableToolError,
  projectToolError,
  projectToolErrorCode,
  type StableToolErrorCode
} from './tool-error-projection'

type SessionStatus = TuffIntelligenceSession['status']

interface PlannedAction {
  title: string
  type: 'tool' | 'agent' | 'capability'
  toolId?: string
  agentId?: string
  capabilityId?: string
  input?: unknown
  riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
}

interface ToolCallExecutionRequest {
  sessionId: string
  turnId?: string
  actionId?: string
  toolId: string
  input?: unknown
  riskLevel?: TuffIntelligenceApprovalTicket['riskLevel']
  callId?: string
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

interface ToolCallExecutionResult {
  success: boolean
  output?: unknown
  error?: string
  errorCode?: StableToolErrorCode
  approvalTicket?: TuffIntelligenceApprovalTicket
  traceEvent: TuffIntelligenceTraceEvent
}

interface StoredToolCallResult {
  toolId?: string
  success: boolean
  output?: unknown
  error?: string
  errorCode?: StableToolErrorCode
  timestamp: number
}

interface StoredRuntimeSession {
  session: TuffIntelligenceSession
  turns: TuffIntelligenceTurn[]
  actionGraph: TuffIntelligenceActionGraph
  trace: TuffIntelligenceTraceEvent[]
  approvals: TuffIntelligenceApprovalTicket[]
  toolCallCache: Record<string, StoredToolCallResult>
}

interface StartSessionPayload {
  sessionId?: string
  objective?: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
  autoRunGraph?: boolean
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  reflectNotes?: string
}

interface PlanPayload {
  sessionId: string
  objective: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

interface ExecutePayload {
  sessionId: string
  turnId?: string
  maxSteps?: number
  toolBudget?: number
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

interface ReflectPayload {
  sessionId: string
  turnId: string
  notes?: string
}

interface CancelSessionPayload {
  sessionId: string
  reason?: string
}

interface PauseSessionPayload {
  sessionId: string
  reason?: 'client_disconnect' | 'heartbeat_timeout' | 'manual_pause' | 'system_preempted'
  note?: string
}

interface QueryTracePayload {
  sessionId: string
  fromSeq?: number
  limit?: number
  level?: TuffIntelligenceTraceEvent['level']
  type?: TuffIntelligenceTraceEvent['type']
}

interface SessionHistoryPayload {
  limit?: number
  status?: SessionStatus
}

interface ExportTracePayload {
  sessionId: string
  format?: 'json' | 'jsonl'
}

interface ToolResultPayload {
  sessionId: string
  turnId?: string
  toolId: string
  success: boolean
  output?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

interface ApproveToolPayload {
  ticketId: string
  approved: boolean
  approvedBy?: string
  reason?: string
}

const runtimeLog = createLogger('Intelligence').child('TuffRuntime')
const STORAGE_PREFIX = 'intelligence/runtime/session/'
const DEFAULT_TOOL_TIMEOUT_MS = 45_000
const DEFAULT_TOOL_RETRY = 1
const DEFAULT_TRACE_QUERY_LIMIT = 200
const MAX_TRACE_EVENTS = 1000
const SAFE_RUNTIME_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/

const TRACE_MESSAGES = {
  'session.started': 'Session started',
  'session.resumed': 'Session resumed',
  'session.paused': 'Session paused',
  'session.cancelled': 'Session cancelled',
  'plan.created': 'Plan created',
  'plan.updated': 'Plan updated',
  'execution.started': 'Execution started',
  'execution.completed': 'Execution completed',
  'execution.failed': 'Execution failed',
  'tool.called': 'Tool call started',
  'tool.completed': 'Tool call completed',
  'tool.approval_required': 'Tool approval required',
  'tool.approved': 'Tool call approved',
  'tool.rejected': 'Tool call rejected',
  'reflection.completed': 'Reflection completed',
  'state.snapshot': 'Runtime state updated'
} as const satisfies Record<TuffIntelligenceTraceEvent['type'], string>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function buildStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function now(): number {
  return Date.now()
}

function toSafeRuntimeIdentifier(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return SAFE_RUNTIME_IDENTIFIER.test(normalized) ? normalized : fallback
}

function readSafeRuntimeIdentifier(value: unknown): string | undefined {
  const identifier = toSafeRuntimeIdentifier(value, '')
  return identifier || undefined
}

function normalizeCallId(value: unknown): string {
  return readSafeRuntimeIdentifier(value) ?? generateId('tool')
}

function stableToolFailure(code: StableToolErrorCode): {
  error: string
  errorCode: StableToolErrorCode
} {
  return {
    error: formatStableToolError(projectToolErrorCode(code)),
    errorCode: code
  }
}

function toBoundedCount(value: unknown): number | undefined {
  const count = Number(value)
  if (!Number.isFinite(count)) return undefined
  return Math.min(Math.max(Math.floor(count), 0), Number.MAX_SAFE_INTEGER)
}

function compactPayload(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function projectTracePayload(
  type: TuffIntelligenceTraceEvent['type'],
  value: unknown
): Record<string, unknown> | undefined {
  const payload = asRecord(value)
  switch (type) {
    case 'session.started':
    case 'session.resumed':
    case 'session.paused':
    case 'session.cancelled':
      return { status: type.slice('session.'.length) }
    case 'plan.created':
      return { status: 'planning' }
    case 'plan.updated':
      return compactPayload({
        status: 'planned',
        actionCount: toBoundedCount(payload.actionCount)
      })
    case 'execution.started':
      return compactPayload({
        status: 'started',
        maxSteps: toBoundedCount(payload.maxSteps),
        toolBudget: toBoundedCount(payload.toolBudget)
      })
    case 'execution.completed':
    case 'execution.failed':
      return compactPayload({
        status: type === 'execution.completed' ? 'succeeded' : 'failed',
        actionId: readSafeRuntimeIdentifier(payload.actionId),
        executedSteps: toBoundedCount(payload.executedSteps),
        toolCalls: toBoundedCount(payload.toolCalls),
        errorCode:
          type === 'execution.failed' ? projectToolErrorCode(payload.errorCode).code : undefined
      })
    case 'tool.called':
    case 'tool.completed':
    case 'tool.approval_required':
      return compactPayload({
        callId: readSafeRuntimeIdentifier(payload.callId),
        ticketId: readSafeRuntimeIdentifier(payload.ticketId),
        toolId: readSafeRuntimeIdentifier(payload.toolId),
        riskLevel:
          payload.riskLevel === 'low' ||
          payload.riskLevel === 'medium' ||
          payload.riskLevel === 'high' ||
          payload.riskLevel === 'critical'
            ? payload.riskLevel
            : undefined,
        status:
          type === 'tool.called'
            ? 'started'
            : type === 'tool.approval_required'
              ? 'pending'
              : payload.status === 'succeeded' || payload.status === 'failed'
                ? payload.status
                : undefined,
        durationMs: toBoundedCount(payload.durationMs),
        errorCode:
          payload.status === 'failed' ? projectToolErrorCode(payload.errorCode).code : undefined,
        cached: payload.cached === true ? true : undefined
      })
    case 'tool.approved':
    case 'tool.rejected':
      return compactPayload({
        ticketId: readSafeRuntimeIdentifier(payload.ticketId),
        toolId: readSafeRuntimeIdentifier(payload.toolId),
        decision: type === 'tool.approved' ? 'approved' : 'rejected'
      })
    case 'reflection.completed':
      return compactPayload({
        status: 'completed',
        summaryLength: toBoundedCount(payload.summaryLength)
      })
    case 'state.snapshot':
      return compactPayload({
        status: 'updated',
        actionCount: toBoundedCount(payload.actionCount)
      })
  }
}

function projectApprovalTicket(
  ticket: TuffIntelligenceApprovalTicket
): TuffIntelligenceApprovalTicket {
  return {
    id: toSafeRuntimeIdentifier(ticket.id, 'unknown'),
    sessionId: toSafeRuntimeIdentifier(ticket.sessionId, 'unknown'),
    turnId: ticket.turnId ? toSafeRuntimeIdentifier(ticket.turnId, 'unknown') : undefined,
    actionId: ticket.actionId ? toSafeRuntimeIdentifier(ticket.actionId, 'unknown') : undefined,
    toolId: toSafeRuntimeIdentifier(ticket.toolId, 'unknown'),
    riskLevel: ticket.riskLevel,
    reason: `Tool approval is required for a ${ticket.riskLevel}-risk operation.`,
    status: ticket.status,
    requestedAt: ticket.requestedAt,
    resolvedAt: ticket.resolvedAt,
    resolvedBy: ticket.resolvedBy ? 'user' : undefined
  }
}

function toSafeSeq(value: unknown): number | null {
  const seq = Number(value)
  if (!Number.isFinite(seq)) {
    return null
  }
  return Math.max(1, Math.floor(seq))
}

function projectTraceEvent(event: TuffIntelligenceTraceEvent): TuffIntelligenceAgentTraceEvent {
  const type = Object.hasOwn(TRACE_MESSAGES, event.type) ? event.type : 'state.snapshot'
  const level =
    event.level === 'debug' ||
    event.level === 'info' ||
    event.level === 'warn' ||
    event.level === 'error'
      ? event.level
      : 'info'
  const timestamp = Number(event.timestamp)
  return {
    id: toSafeRuntimeIdentifier(event.id, 'unknown'),
    sessionId: toSafeRuntimeIdentifier(event.sessionId, 'unknown'),
    seq: toSafeSeq(event.seq) ?? undefined,
    turnId: event.turnId ? toSafeRuntimeIdentifier(event.turnId, 'unknown') : undefined,
    type,
    level,
    message: TRACE_MESSAGES[type],
    payload: projectTracePayload(type, event.payload),
    timestamp: Number.isFinite(timestamp)
      ? Math.min(Math.max(Math.floor(timestamp), 0), Number.MAX_SAFE_INTEGER)
      : 0,
    contractVersion: 3
  }
}

function resolveRiskLevel(
  toolId: string,
  fallback: TuffIntelligenceApprovalTicket['riskLevel'] = 'medium'
): TuffIntelligenceApprovalTicket['riskLevel'] {
  const normalized = toolId.toLowerCase()
  if (
    normalized.includes('delete') ||
    normalized.includes('shell') ||
    normalized.includes('execute')
  ) {
    return 'critical'
  }
  if (
    normalized.includes('write') ||
    normalized.includes('move') ||
    normalized.includes('network')
  ) {
    return 'high'
  }
  if (
    normalized.includes('copy') ||
    normalized.includes('download') ||
    normalized.includes('system')
  ) {
    return 'medium'
  }
  return fallback
}

function isApprovalRequired(riskLevel: TuffIntelligenceApprovalTicket['riskLevel']): boolean {
  return riskLevel === 'high' || riskLevel === 'critical'
}

function isSessionTerminal(status: SessionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export class TuffIntelligenceRuntime {
  private sessions = new Map<string, StoredRuntimeSession>()
  private approvalIndex = new Map<string, string>()
  private traceSubscribers = new Map<
    string,
    Set<(event: TuffIntelligenceAgentTraceEvent) => void>
  >()

  async startSession(payload: StartSessionPayload = {}): Promise<TuffIntelligenceSession> {
    const targetId = payload.sessionId || generateId('tis')
    const existing = await this.loadSession(targetId)

    if (existing) {
      existing.session.objective = payload.objective ?? existing.session.objective
      existing.session.context = {
        ...(existing.session.context ?? {}),
        ...(payload.context ?? {})
      }
      existing.session.metadata = {
        ...(existing.session.metadata ?? {}),
        ...(payload.metadata ?? {})
      }
      existing.session.updatedAt = now()
      this.pushTrace(existing, {
        type: 'session.resumed',
        level: 'info',
        message: `Session ${targetId} resumed by startSession`,
        payload: { sessionId: targetId }
      })
      await this.persistSession(existing)
      return existing.session
    }

    const timestamp = now()
    const session: TuffIntelligenceSession = {
      id: targetId,
      status: 'idle',
      objective: payload.objective,
      context: payload.context,
      metadata: payload.metadata,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    const stored: StoredRuntimeSession = {
      session,
      turns: [],
      actionGraph: {
        sessionId: targetId,
        nodes: [],
        edges: [],
        version: 1,
        updatedAt: timestamp
      },
      trace: [],
      approvals: [],
      toolCallCache: {}
    }
    this.pushTrace(stored, {
      type: 'session.started',
      level: 'info',
      message: `Session ${targetId} started`,
      payload: { objective: payload.objective }
    })
    await this.persistSession(stored)
    return stored.session
  }

  async heartbeatSession(sessionId: string): Promise<{ sessionId: string; heartbeatAt: string }> {
    const stored = await this.requireSession(sessionId)
    const heartbeatAt = new Date().toISOString()

    stored.session.updatedAt = now()
    stored.session.metadata = {
      ...(stored.session.metadata ?? {}),
      heartbeatAt
    }

    this.pushTrace(stored, {
      type: 'state.snapshot',
      level: 'debug',
      message: `Session ${sessionId} heartbeat`,
      payload: { heartbeatAt }
    })

    await this.persistSession(stored)
    return {
      sessionId,
      heartbeatAt
    }
  }

  async pauseSession(payload: PauseSessionPayload): Promise<TuffIntelligenceAgentSession | null> {
    const stored = await this.loadSession(payload.sessionId)
    if (!stored) return null

    const turn = this.getCurrentTurn(stored)
    const pauseReason = payload.reason ?? 'manual_pause'
    const timestamp = now()

    if (turn && !isSessionTerminal(turn.status)) {
      turn.status = 'paused_disconnect'
      turn.metadata = {
        ...(turn.metadata ?? {}),
        pauseReason,
        pauseNote: payload.note
      }
    }

    stored.session.status = 'paused_disconnect'
    stored.session.pauseReason = pauseReason
    stored.session.resumeHint = payload.note
    stored.session.updatedAt = timestamp

    this.pushTrace(stored, {
      type: 'session.paused',
      level: 'warn',
      message: `Session ${payload.sessionId} paused`,
      payload: {
        reason: pauseReason,
        note: payload.note
      }
    })

    await this.persistSession(stored)
    return stored.session
  }

  async getRecoverableSession(): Promise<TuffIntelligenceAgentSession | null> {
    const history = await this.getSessionHistory({
      limit: 50
    })
    return (
      history.find(
        (session) =>
          session.status === 'paused_disconnect' ||
          session.status === 'waiting_approval' ||
          session.status === 'resuming'
      ) ?? null
    )
  }

  async resumeSession(sessionId: string): Promise<TuffIntelligenceSession | null> {
    const stored = await this.loadSession(sessionId)
    if (!stored) return null

    stored.session.updatedAt = now()
    this.pushTrace(stored, {
      type: 'session.resumed',
      level: 'info',
      message: `Session ${sessionId} resumed`,
      payload: { sessionId }
    })
    await this.persistSession(stored)
    return stored.session
  }

  async cancelSession(
    payload: CancelSessionPayload
  ): Promise<TuffIntelligenceStateSnapshot | null> {
    const stored = await this.loadSession(payload.sessionId)
    if (!stored) return null

    const timestamp = now()
    stored.session.status = 'cancelled'
    stored.session.updatedAt = timestamp
    const turn = this.getCurrentTurn(stored)
    if (turn && !turn.completedAt) {
      turn.status = 'cancelled'
      turn.error = payload.reason || 'cancelled'
      turn.completedAt = timestamp
    }
    this.pushTrace(stored, {
      type: 'session.cancelled',
      level: 'warn',
      message: `Session ${payload.sessionId} cancelled`,
      payload: { reason: payload.reason }
    })
    await this.persistSession(stored)
    return this.buildSnapshot(stored)
  }

  async getSessionState(sessionId: string): Promise<TuffIntelligenceStateSnapshot | null> {
    const stored = await this.loadSession(sessionId)
    if (!stored) return null
    return this.buildSnapshot(stored)
  }

  async plan(payload: PlanPayload): Promise<TuffIntelligenceTurn> {
    const stored = await this.loadOrCreate(payload.sessionId, {
      objective: payload.objective,
      context: payload.context,
      metadata: payload.metadata
    })

    const timestamp = now()
    stored.session.status = 'planning'
    stored.session.objective = payload.objective
    stored.session.context = {
      ...(stored.session.context ?? {}),
      ...(payload.context ?? {})
    }
    stored.session.metadata = {
      ...(stored.session.metadata ?? {}),
      ...(payload.metadata ?? {})
    }
    stored.session.updatedAt = timestamp

    const turnId = generateId('turn')
    const turn: TuffIntelligenceTurn = {
      id: turnId,
      sessionId: stored.session.id,
      status: 'planning',
      objective: payload.objective,
      userInput: payload.objective,
      actionIds: [],
      metadata: payload.metadata,
      startedAt: timestamp
    }
    stored.turns.push(turn)
    stored.session.currentTurnId = turnId

    this.pushTrace(stored, {
      type: 'plan.created',
      level: 'info',
      message: `Planning started for turn ${turnId}`,
      payload: { objective: payload.objective }
    })

    const plannedActions = await this.buildPlanActions(payload.objective, payload.context)
    const intentNode = this.appendActionNode(stored, {
      type: 'intent',
      title: payload.objective,
      status: 'completed',
      input: { objective: payload.objective }
    })
    const planNode = this.appendActionNode(stored, {
      type: 'plan',
      title: 'Generated execution plan',
      status: 'completed',
      input: { objective: payload.objective },
      output: plannedActions
    })
    this.appendEdge(stored, intentNode.id, planNode.id, 'sequence')

    const actionNodes = plannedActions.map((action) =>
      this.appendActionNode(stored, {
        type: action.type,
        title: action.title,
        status: 'pending',
        capabilityId: action.capabilityId,
        toolId: action.toolId,
        input: action.input,
        metadata: {
          agentId: action.agentId,
          riskLevel: action.riskLevel
        }
      })
    )

    for (const node of actionNodes) {
      this.appendEdge(stored, planNode.id, node.id, 'sequence')
    }

    turn.actionIds = actionNodes.map((node) => node.id)
    turn.status = 'planned'
    turn.completedAt = now()
    stored.session.status = 'planned'
    stored.session.updatedAt = now()

    this.pushTrace(stored, {
      type: 'plan.updated',
      level: 'info',
      message: `Plan created with ${actionNodes.length} actions`,
      payload: {
        turnId,
        actionCount: actionNodes.length
      }
    })

    await this.persistSession(stored)
    return turn
  }

  async execute(payload: ExecutePayload): Promise<TuffIntelligenceTurn> {
    const stored = await this.requireSession(payload.sessionId)
    const turn = this.requireTurn(stored, payload.turnId)

    if (isSessionTerminal(stored.session.status)) {
      return turn
    }

    const maxSteps = Math.max(1, payload.maxSteps ?? 8)
    const toolBudget = Math.max(1, payload.toolBudget ?? 6)
    const continueOnError = Boolean(payload.continueOnError)
    let toolCalls = 0
    let hasFailure = false

    turn.status = 'executing'
    turn.completedAt = undefined
    stored.session.status = 'executing'
    stored.session.updatedAt = now()

    this.pushTrace(stored, {
      type: 'execution.started',
      level: 'info',
      message: `Execution started for turn ${turn.id}`,
      payload: { maxSteps, toolBudget }
    })

    const actionNodes = turn.actionIds
      .map((id) => stored.actionGraph.nodes.find((node) => node.id === id))
      .filter((node): node is TuffIntelligenceActionNode => Boolean(node))

    let executedSteps = 0
    for (const node of actionNodes) {
      if (executedSteps >= maxSteps) break
      if (node.status === 'completed') continue

      const result = await this.executeActionNode(stored, turn, node, {
        toolBudget,
        toolCalls,
        metadata: payload.metadata
      })
      if (result.toolCall) {
        toolCalls += 1
      }
      if (result.awaitingApproval) {
        turn.status = 'waiting_approval'
        stored.session.status = 'waiting_approval'
        break
      }
      if (!result.success) {
        hasFailure = true
        if (!continueOnError) {
          break
        }
      }
      executedSteps += 1
    }

    if (stored.session.status !== 'waiting_approval') {
      turn.status = hasFailure ? 'failed' : 'completed'
      turn.completedAt = now()
      stored.session.status = hasFailure ? 'failed' : 'completed'
      stored.session.updatedAt = now()
      this.pushTrace(stored, {
        type: hasFailure ? 'execution.failed' : 'execution.completed',
        level: hasFailure ? 'error' : 'info',
        message: hasFailure
          ? `Execution failed for turn ${turn.id}`
          : `Execution completed for turn ${turn.id}`,
        payload: { executedSteps, toolCalls }
      })
    }

    await this.persistSession(stored)
    return turn
  }

  async reflect(payload: ReflectPayload): Promise<TuffIntelligenceTurn> {
    const stored = await this.requireSession(payload.sessionId)
    const turn = this.requireTurn(stored, payload.turnId)
    const actionOutputs = turn.actionIds
      .map((id) => stored.actionGraph.nodes.find((node) => node.id === id))
      .filter((node): node is TuffIntelligenceActionNode => Boolean(node))
      .map((node) => ({
        id: node.id,
        type: node.type,
        status: node.status,
        output: node.output,
        error: node.error
      }))

    stored.session.status = 'reflecting'
    stored.session.updatedAt = now()
    this.pushTrace(stored, {
      type: 'state.snapshot',
      level: 'info',
      message: `Reflection started for turn ${turn.id}`,
      payload: { actionCount: actionOutputs.length }
    })

    const summary = await this.generateReflectionSummary({
      objective: turn.objective || stored.session.objective || '',
      notes: payload.notes,
      actions: actionOutputs
    })

    turn.reflection = summary
    if (turn.status !== 'failed' && turn.status !== 'cancelled') {
      turn.status = 'completed'
    }
    turn.completedAt = turn.completedAt ?? now()

    const reflectNode = this.appendActionNode(stored, {
      type: 'reflect',
      title: 'Reflection summary',
      status: 'completed',
      output: { summary }
    })
    if (turn.actionIds.length > 0) {
      this.appendEdge(
        stored,
        turn.actionIds[turn.actionIds.length - 1]!,
        reflectNode.id,
        'reflection'
      )
    }
    turn.actionIds.push(reflectNode.id)
    stored.session.status = turn.status === 'failed' ? 'failed' : 'completed'
    stored.session.updatedAt = now()

    this.pushTrace(stored, {
      type: 'reflection.completed',
      level: 'info',
      message: `Reflection completed for turn ${turn.id}`,
      payload: { summaryLength: summary.length }
    })

    await this.persistSession(stored)
    return turn
  }

  async callTool(payload: ToolCallExecutionRequest): Promise<ToolCallExecutionResult> {
    const stored = await this.requireSession(payload.sessionId)
    const toolResult = await this.executeToolCall(stored, payload)
    await this.persistSession(stored)
    return toolResult
  }

  async reportToolResult(payload: ToolResultPayload): Promise<{ accepted: boolean }> {
    const stored = await this.loadSession(payload.sessionId)
    if (!stored) return { accepted: false }

    const turn = payload.turnId
      ? stored.turns.find((item) => item.id === payload.turnId)
      : this.getCurrentTurn(stored)
    const matchedNode = turn
      ? turn.actionIds
          .map((id) => stored.actionGraph.nodes.find((node) => node.id === id))
          .filter((node): node is TuffIntelligenceActionNode => Boolean(node))
          .find((node) => node.toolId === payload.toolId && node.status !== 'completed')
      : undefined

    if (matchedNode) {
      matchedNode.status = payload.success ? 'completed' : 'failed'
      matchedNode.output = payload.output
      matchedNode.error = payload.success
        ? undefined
        : formatStableToolError(projectToolError(payload.error))
      matchedNode.updatedAt = now()
    }

    this.pushTrace(stored, {
      type: 'tool.completed',
      level: payload.success ? 'info' : 'error',
      message: payload.success
        ? `External tool result accepted for ${payload.toolId}`
        : `External tool failure reported for ${payload.toolId}`,
      payload: {
        toolId: toSafeRuntimeIdentifier(payload.toolId, 'unknown'),
        status: payload.success ? 'succeeded' : 'failed',
        errorCode: payload.success ? undefined : projectToolError(payload.error).code
      }
    })
    stored.session.updatedAt = now()
    await this.persistSession(stored)
    return { accepted: true }
  }

  async approveTool(payload: ApproveToolPayload): Promise<TuffIntelligenceApprovalTicket | null> {
    const sessionId = this.approvalIndex.get(payload.ticketId)
    if (!sessionId) return null
    const stored = await this.loadSession(sessionId)
    if (!stored) return null

    const ticket = stored.approvals.find((item) => item.id === payload.ticketId)
    if (!ticket) return null
    if (ticket.status !== 'pending') return projectApprovalTicket(ticket)

    ticket.status = payload.approved ? 'approved' : 'rejected'
    ticket.resolvedAt = now()
    ticket.resolvedBy = payload.approvedBy ? 'user' : 'system'

    this.pushTrace(stored, {
      type: payload.approved ? 'tool.approved' : 'tool.rejected',
      level: payload.approved ? 'info' : 'warn',
      message: payload.approved
        ? `Approval granted for ticket ${ticket.id}`
        : `Approval rejected for ticket ${ticket.id}`,
      payload: {
        ticketId: ticket.id,
        toolId: toSafeRuntimeIdentifier(ticket.toolId, 'unknown')
      }
    })

    const deferredCall = asRecord(ticket.metadata?.deferredCall)
    if (payload.approved && Object.keys(deferredCall).length > 0) {
      const result = await this.executeToolCall(
        stored,
        {
          sessionId: ticket.sessionId,
          turnId: ticket.turnId,
          actionId: ticket.actionId,
          toolId: ticket.toolId,
          input: deferredCall.input,
          callId: typeof deferredCall.callId === 'string' ? deferredCall.callId : undefined,
          timeoutMs:
            typeof deferredCall.timeoutMs === 'number'
              ? deferredCall.timeoutMs
              : DEFAULT_TOOL_TIMEOUT_MS,
          riskLevel: ticket.riskLevel
        },
        { approvalGranted: true }
      )

      const actionNode = ticket.actionId
        ? stored.actionGraph.nodes.find((node) => node.id === ticket.actionId)
        : undefined
      if (actionNode) {
        actionNode.status = result.success ? 'completed' : 'failed'
        actionNode.output = result.success ? result.output : undefined
        actionNode.error = result.success ? undefined : result.error
        actionNode.updatedAt = now()
      }

      const turn = ticket.turnId
        ? stored.turns.find((item) => item.id === ticket.turnId)
        : undefined
      if (turn && turn.status === 'waiting_approval' && result.success) {
        turn.status = 'executing'
      }
      if (stored.session.status === 'waiting_approval' && result.success) {
        stored.session.status = 'executing'
      }
      if (!result.success) {
        if (turn) {
          turn.status = 'failed'
          turn.error = result.error
          turn.completedAt = now()
        }
        stored.session.status = 'failed'
      }
    } else if (!payload.approved) {
      const failure = stableToolFailure('TOOL_APPROVAL_DENIED')
      const actionNode = ticket.actionId
        ? stored.actionGraph.nodes.find((node) => node.id === ticket.actionId)
        : undefined
      if (actionNode) {
        actionNode.status = 'failed'
        actionNode.error = failure.error
        actionNode.updatedAt = now()
      }
      const turn = ticket.turnId
        ? stored.turns.find((item) => item.id === ticket.turnId)
        : undefined
      if (turn && turn.status !== 'cancelled') {
        turn.status = 'failed'
        turn.error = failure.error
        turn.completedAt = now()
      }
      stored.session.status = 'failed'
    }

    stored.session.updatedAt = now()
    await this.persistSession(stored)
    return projectApprovalTicket(ticket)
  }

  async getSessionHistory(
    payload: SessionHistoryPayload = {}
  ): Promise<TuffIntelligenceAgentSession[]> {
    const limit = Math.min(Math.max(payload.limit ?? 20, 1), 200)
    const sessionsMap = new Map<string, TuffIntelligenceAgentSession>()

    for (const stored of this.sessions.values()) {
      sessionsMap.set(stored.session.id, stored.session)
    }

    const db = databaseModule.getDb()
    const rows = await db
      .select({ key: config.key, value: config.value })
      .from(config)
      .where(like(config.key, `${STORAGE_PREFIX}%`))
      .limit(500)

    for (const row of rows) {
      const parsed = safeParseJson<StoredRuntimeSession | null>(row.value, null)
      if (!parsed?.session?.id) {
        continue
      }
      this.ensureTraceSeq(parsed)
      sessionsMap.set(parsed.session.id, parsed.session)
    }

    let sessions = Array.from(sessionsMap.values())
    if (payload.status) {
      sessions = sessions.filter((session) => session.status === payload.status)
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)

    return sessions.slice(0, limit)
  }

  subscribeSessionTrace(
    sessionId: string,
    subscriber: (event: TuffIntelligenceAgentTraceEvent) => void
  ): () => void {
    const targetId = String(sessionId || '').trim()
    if (!targetId) {
      return () => void 0
    }

    let set = this.traceSubscribers.get(targetId)
    if (!set) {
      set = new Set()
      this.traceSubscribers.set(targetId, set)
    }
    set.add(subscriber)

    return () => {
      const current = this.traceSubscribers.get(targetId)
      if (!current) {
        return
      }
      current.delete(subscriber)
      if (current.size === 0) {
        this.traceSubscribers.delete(targetId)
      }
    }
  }

  async queryTrace(payload: QueryTracePayload): Promise<TuffIntelligenceAgentTraceEvent[]> {
    const stored = await this.loadSession(payload.sessionId)
    if (!stored) return []

    let trace = stored.trace.filter((event) => typeof toSafeSeq(event.seq) === 'number')
    if (typeof payload.fromSeq === 'number' && Number.isFinite(payload.fromSeq)) {
      const fromSeq = Math.max(1, Math.floor(payload.fromSeq))
      trace = trace.filter((event) => (toSafeSeq(event.seq) ?? 0) >= fromSeq)
    }
    if (payload.level) {
      trace = trace.filter((event) => event.level === payload.level)
    }
    if (payload.type) {
      trace = trace.filter((event) => event.type === payload.type)
    }
    trace.sort((left, right) => {
      const seqLeft = toSafeSeq(left.seq) ?? 0
      const seqRight = toSafeSeq(right.seq) ?? 0
      if (seqLeft !== seqRight) {
        return seqLeft - seqRight
      }
      return left.timestamp - right.timestamp
    })
    const limit = Math.max(1, payload.limit ?? DEFAULT_TRACE_QUERY_LIMIT)
    return trace.slice(-limit).map(projectTraceEvent)
  }

  async exportTrace(
    payload: ExportTracePayload
  ): Promise<{ format: 'json' | 'jsonl'; content: string }> {
    const trace = await this.queryTrace({
      sessionId: payload.sessionId,
      limit: Number.MAX_SAFE_INTEGER
    })
    const format = payload.format ?? 'json'
    if (format === 'jsonl') {
      return {
        format,
        content: trace.map((event) => JSON.stringify(event)).join('\n')
      }
    }
    return {
      format: 'json',
      content: JSON.stringify(trace, null, 2)
    }
  }

  private async executeActionNode(
    stored: StoredRuntimeSession,
    turn: TuffIntelligenceTurn,
    node: TuffIntelligenceActionNode,
    options: { toolBudget: number; toolCalls: number; metadata?: Record<string, unknown> }
  ): Promise<{ success: boolean; toolCall: boolean; awaitingApproval?: boolean }> {
    node.status = 'running'
    node.updatedAt = now()

    try {
      if (node.type === 'tool') {
        if (options.toolCalls >= options.toolBudget) {
          throw new Error(`tool budget exceeded (${options.toolBudget})`)
        }
        const result = await this.executeToolCall(stored, {
          sessionId: stored.session.id,
          turnId: turn.id,
          actionId: node.id,
          toolId: node.toolId || '',
          input: node.input,
          callId: typeof node.metadata?.callId === 'string' ? node.metadata.callId : undefined,
          riskLevel:
            (node.metadata?.riskLevel as TuffIntelligenceApprovalTicket['riskLevel'] | undefined) ||
            resolveRiskLevel(node.toolId || '')
        })

        if (result.approvalTicket) {
          node.status = 'pending'
          node.updatedAt = now()
          return { success: true, toolCall: true, awaitingApproval: true }
        }
        if (!result.success) {
          const failure = stableToolFailure(result.errorCode ?? 'TOOL_EXECUTION_FAILED')
          throw Object.assign(new Error(failure.error), { code: failure.errorCode })
        }
        node.status = 'completed'
        node.output = result.output
        node.updatedAt = now()
        return { success: true, toolCall: true }
      }

      if (node.type === 'agent') {
        const agentId =
          typeof node.metadata?.agentId === 'string' ? node.metadata.agentId : undefined
        if (!agentId) {
          throw new Error('agent action missing agentId')
        }
        const result = await agentManager.executeTaskImmediate({
          agentId,
          type: 'execute',
          input: node.input ?? {},
          context: {
            sessionId: stored.session.id,
            metadata: options.metadata
          }
        })
        if (!result.success) {
          throw new Error(result.error || `Agent ${agentId} execution failed`)
        }
        node.status = 'completed'
        node.output = result.output
        node.updatedAt = now()
        return { success: true, toolCall: false }
      }

      const capabilityId =
        node.type === 'capability' && node.capabilityId ? node.capabilityId : 'text.chat'
      const caller =
        typeof options.metadata?.caller === 'string' && options.metadata.caller.trim()
          ? options.metadata.caller.trim()
          : 'intelligence.orchestrator'
      const capabilityInput =
        capabilityId === 'agent.run'
          ? (node.input ?? { task: turn.objective || stored.session.objective || 'Continue task' })
          : {
              task: turn.objective || stored.session.objective || 'Continue task',
              context: {
                legacyCapabilityId: capabilityId,
                input: node.input
              }
            }
      const invokeOptions: IntelligenceInvokeOptions = {
        metadata: {
          ...options.metadata,
          caller,
          sessionId: stored.session.id,
          turnId: turn.id
        }
      }
      const result = await tuffIntelligence.invoke('agent.run', capabilityInput, invokeOptions)
      node.status = 'completed'
      node.output = result.result
      node.updatedAt = now()
      return { success: true, toolCall: false }
    } catch (error) {
      const failure = projectToolError(error)
      node.status = 'failed'
      node.error = formatStableToolError(failure)
      node.updatedAt = now()
      turn.error = node.error
      this.pushTrace(stored, {
        type: 'execution.failed',
        level: 'error',
        message: `Action ${node.id} failed`,
        payload: { actionId: node.id, errorCode: failure.code }
      })
      return { success: false, toolCall: node.type === 'tool' }
    }
  }

  private async executeToolCall(
    stored: StoredRuntimeSession,
    request: ToolCallExecutionRequest,
    options: { approvalGranted?: boolean } = {}
  ): Promise<ToolCallExecutionResult> {
    const timestamp = now()
    const safeToolId = toSafeRuntimeIdentifier(request.toolId, '')
    const riskLevel = resolveRiskLevel(safeToolId, request.riskLevel)
    const callId = normalizeCallId(request.callId)
    const cached = stored.toolCallCache[callId]
    if (cached?.toolId === safeToolId) {
      const cachedEvent = this.pushTrace(stored, {
        type: 'tool.completed',
        level: cached.success ? 'info' : 'warn',
        message: `Tool ${request.toolId} returned cached result`,
        payload: {
          callId,
          toolId: safeToolId,
          status: cached.success ? 'succeeded' : 'failed',
          errorCode: cached.errorCode,
          durationMs: 0,
          cached: true
        }
      })
      return {
        success: cached.success,
        output: cached.output,
        error: cached.error,
        errorCode: cached.errorCode,
        traceEvent: cachedEvent
      }
    }

    const tool = safeToolId ? toolRegistry.getTool(safeToolId) : null
    if (!tool) {
      const failure = stableToolFailure('TOOL_NOT_FOUND')
      const traceEvent = this.pushTrace(stored, {
        type: 'tool.completed',
        level: 'error',
        message: 'Tool is unavailable',
        payload: {
          callId,
          toolId: safeToolId || 'unknown',
          status: 'failed',
          errorCode: failure.errorCode,
          durationMs: now() - timestamp
        }
      })
      stored.toolCallCache[callId] = {
        toolId: safeToolId,
        success: false,
        error: failure.error,
        errorCode: failure.errorCode,
        timestamp
      }
      return {
        success: false,
        error: failure.error,
        errorCode: failure.errorCode,
        traceEvent
      }
    }

    if (isApprovalRequired(riskLevel) && options.approvalGranted !== true) {
      const ticket: TuffIntelligenceApprovalTicket = {
        id: generateId('approval'),
        sessionId: request.sessionId,
        turnId: request.turnId,
        actionId: request.actionId,
        toolId: request.toolId,
        riskLevel,
        reason: `Tool approval is required for a ${riskLevel}-risk operation.`,
        status: 'pending',
        requestedAt: timestamp,
        metadata: {
          deferredCall: {
            input: request.input,
            callId,
            timeoutMs: request.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
          }
        }
      }
      stored.approvals.push(ticket)
      this.approvalIndex.set(ticket.id, request.sessionId)
      const traceEvent = this.pushTrace(stored, {
        type: 'tool.approval_required',
        level: 'warn',
        message: `Approval required for tool ${request.toolId}`,
        payload: {
          ticketId: ticket.id,
          toolId: safeToolId,
          riskLevel,
          callId
        }
      })
      return {
        success: false,
        error: 'approval required',
        approvalTicket: projectApprovalTicket(ticket),
        traceEvent
      }
    }

    this.pushTrace(stored, {
      type: 'tool.called',
      level: 'info',
      message: `Calling tool ${request.toolId}`,
      payload: {
        callId,
        toolId: safeToolId,
        riskLevel
      }
    })

    const context: ToolExecutionContext = {
      taskId: request.turnId || generateId('tool-task'),
      agentId: 'builtin.workflow-agent',
      workingDirectory:
        typeof request.metadata?.workingDirectory === 'string'
          ? request.metadata.workingDirectory
          : undefined,
      errorProjection: 'stable'
    }

    const result = await this.executeToolWithRetry(
      safeToolId,
      request.input,
      context,
      request.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS
    )

    stored.toolCallCache[callId] = {
      toolId: safeToolId,
      success: result.success,
      output: result.output,
      error: result.error,
      errorCode: result.errorCode,
      timestamp
    }

    const traceEvent = this.pushTrace(stored, {
      type: 'tool.completed',
      level: result.success ? 'info' : 'error',
      message: result.success
        ? `Tool ${request.toolId} completed`
        : `Tool ${request.toolId} failed`,
      payload: {
        callId,
        toolId: safeToolId,
        riskLevel,
        status: result.success ? 'succeeded' : 'failed',
        errorCode: result.errorCode,
        durationMs: now() - timestamp
      }
    })

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      errorCode: result.errorCode,
      traceEvent
    }
  }

  private async executeToolWithRetry(
    toolId: string,
    input: unknown,
    context: ToolExecutionContext,
    timeoutMs: number
  ): Promise<{
    success: boolean
    output?: unknown
    error?: string
    errorCode?: StableToolErrorCode
  }> {
    let lastFailure = stableToolFailure('TOOL_EXECUTION_FAILED')
    for (let attempt = 0; attempt <= DEFAULT_TOOL_RETRY; attempt += 1) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        const execution = toolRegistry.executeTool(toolId, input, context)
        const timeout = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(Object.assign(new Error('Tool execution timed out'), { code: 'ETIMEDOUT' }))
          }, timeoutMs)
        })
        const result = await Promise.race([execution, timeout])
        if (result.success) {
          return {
            success: true,
            output: result.output
          }
        }
        lastFailure = stableToolFailure(result.errorCode ?? 'TOOL_EXECUTION_FAILED')
      } catch (error) {
        const projection = projectToolError(error)
        lastFailure = {
          error: formatStableToolError(projection),
          errorCode: projection.code
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }

      if (attempt < DEFAULT_TOOL_RETRY) {
        const backoff = 200 * Math.pow(2, attempt)
        await sleep(backoff)
      }
    }

    return {
      success: false,
      ...lastFailure
    }
  }

  private async buildPlanActions(
    objective: string,
    context?: Record<string, unknown>
  ): Promise<PlannedAction[]> {
    return [
      {
        title: 'Execute with Tuff Pi coordinator',
        type: 'capability',
        capabilityId: 'agent.run',
        input: {
          task: objective,
          ...(context ? { context } : {})
        },
        riskLevel: 'low'
      }
    ]
  }

  private async generateReflectionSummary(params: {
    objective: string
    notes?: string
    actions: Array<{ id: string; type: string; status: string; output?: unknown; error?: string }>
  }): Promise<string> {
    const completed = params.actions.filter((action) => action.status === 'completed').length
    const failed = params.actions.filter((action) => action.status === 'failed').length
    const notes = params.notes ? `; notes: ${params.notes}` : ''
    return `Objective "${params.objective}" completed ${completed}/${params.actions.length} actions; failed ${failed}${notes}`
  }

  private appendActionNode(
    stored: StoredRuntimeSession,
    payload: {
      type: TuffIntelligenceActionNode['type']
      title: string
      status: TuffIntelligenceActionNode['status']
      capabilityId?: string
      toolId?: string
      input?: unknown
      output?: unknown
      error?: string
      metadata?: Record<string, unknown>
    }
  ): TuffIntelligenceActionNode {
    const node: TuffIntelligenceActionNode = {
      id: generateId('action'),
      type: payload.type,
      title: payload.title,
      status: payload.status,
      capabilityId: payload.capabilityId,
      toolId: payload.toolId,
      input: payload.input,
      output: payload.output,
      error: payload.error,
      metadata: payload.metadata,
      createdAt: now(),
      updatedAt: now()
    }
    stored.actionGraph.nodes.push(node)
    stored.actionGraph.version += 1
    stored.actionGraph.updatedAt = now()
    return node
  }

  private appendEdge(
    stored: StoredRuntimeSession,
    from: string,
    to: string,
    kind: 'sequence' | 'dependency' | 'reflection' = 'sequence'
  ): void {
    stored.actionGraph.edges.push({ from, to, kind })
    stored.actionGraph.version += 1
    stored.actionGraph.updatedAt = now()
  }

  private ensureTraceSeq(stored: StoredRuntimeSession): void {
    let seqCursor = toSafeSeq(stored.session.lastEventSeq) ?? 0
    for (const event of stored.trace) {
      const seq = toSafeSeq(event.seq)
      if (seq !== null) {
        seqCursor = Math.max(seqCursor, seq)
      }
    }
    stored.session.lastEventSeq = seqCursor > 0 ? seqCursor : undefined
  }

  private getNextTraceSeq(stored: StoredRuntimeSession): number {
    this.ensureTraceSeq(stored)
    const latest = toSafeSeq(stored.session.lastEventSeq) ?? 0
    return latest + 1
  }

  private notifyTraceSubscribers(event: TuffIntelligenceAgentTraceEvent): void {
    const subscribers = this.traceSubscribers.get(event.sessionId)
    if (!subscribers || subscribers.size === 0) {
      return
    }
    const envelope: TuffIntelligenceAgentTraceEvent = {
      ...event,
      seq: toSafeSeq(event.seq) ?? undefined,
      contractVersion: 3
    }
    for (const subscriber of Array.from(subscribers)) {
      try {
        subscriber(envelope)
      } catch {
        runtimeLog.warn('trace subscriber callback failed', {
          meta: {
            code: 'TRACE_SUBSCRIBER_FAILED'
          }
        })
      }
    }
  }

  private pushTrace(
    stored: StoredRuntimeSession,
    payload: Omit<TuffIntelligenceTraceEvent, 'id' | 'sessionId' | 'timestamp'> & {
      timestamp?: number
    }
  ): TuffIntelligenceTraceEvent {
    const seq = this.getNextTraceSeq(stored)
    const event = projectTraceEvent({
      id: generateId('trace'),
      sessionId: stored.session.id,
      seq,
      turnId: payload.turnId ? toSafeRuntimeIdentifier(payload.turnId, 'unknown') : undefined,
      type: payload.type,
      level: payload.level,
      message: payload.message,
      payload: payload.payload,
      timestamp: payload.timestamp ?? now()
    })
    stored.trace.push(event)
    stored.session.lastEventSeq = seq
    if (stored.trace.length > MAX_TRACE_EVENTS) {
      stored.trace = stored.trace.slice(stored.trace.length - MAX_TRACE_EVENTS)
    }
    this.notifyTraceSubscribers(event)
    return event
  }

  private buildSnapshot(stored: StoredRuntimeSession): TuffIntelligenceStateSnapshot {
    const currentTurn = this.getCurrentTurn(stored)
    return {
      sessionId: stored.session.id,
      status: stored.session.status,
      currentTurn,
      actionGraph: stored.actionGraph,
      pendingApprovals: stored.approvals
        .filter((ticket) => ticket.status === 'pending')
        .map(projectApprovalTicket),
      lastTraceEvent: stored.trace[stored.trace.length - 1]
        ? projectTraceEvent(stored.trace[stored.trace.length - 1]!)
        : undefined,
      updatedAt: stored.session.updatedAt
    }
  }

  private getCurrentTurn(stored: StoredRuntimeSession): TuffIntelligenceTurn | undefined {
    if (!stored.session.currentTurnId) {
      return stored.turns[stored.turns.length - 1]
    }
    return stored.turns.find((turn) => turn.id === stored.session.currentTurnId)
  }

  private requireTurn(stored: StoredRuntimeSession, turnId?: string): TuffIntelligenceTurn {
    const turn =
      (turnId ? stored.turns.find((item) => item.id === turnId) : this.getCurrentTurn(stored)) ||
      null
    if (!turn) {
      throw new Error('[Intelligence] Turn not found')
    }
    return turn
  }

  private async loadOrCreate(
    sessionId: string,
    seed: Omit<StartSessionPayload, 'sessionId'>
  ): Promise<StoredRuntimeSession> {
    const existing = await this.loadSession(sessionId)
    if (existing) {
      return existing
    }
    await this.startSession({ sessionId, ...seed })
    return this.requireSession(sessionId)
  }

  private async requireSession(sessionId: string): Promise<StoredRuntimeSession> {
    const stored = await this.loadSession(sessionId)
    if (!stored) {
      throw new Error(`[Intelligence] Session ${sessionId} not found`)
    }
    return stored
  }

  private async loadSession(sessionId: string): Promise<StoredRuntimeSession | null> {
    const cached = this.sessions.get(sessionId)
    if (cached) return cached

    const db = databaseModule.getDb()
    const rows = await db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.key, buildStorageKey(sessionId)))
      .limit(1)
    const raw = rows[0]?.value
    if (!raw) return null

    const parsed = safeParseJson<StoredRuntimeSession | null>(raw, null)
    if (!parsed) return null
    this.ensureTraceSeq(parsed)
    this.sessions.set(sessionId, parsed)
    for (const ticket of parsed.approvals) {
      if (ticket.status === 'pending') {
        this.approvalIndex.set(ticket.id, sessionId)
      }
    }
    return parsed
  }

  private async persistSession(stored: StoredRuntimeSession): Promise<void> {
    stored.session.updatedAt = now()
    stored.actionGraph.updatedAt = now()
    this.sessions.set(stored.session.id, stored)

    const db = databaseModule.getDb()
    const serialized = JSON.stringify(stored)
    await db
      .insert(config)
      .values({
        key: buildStorageKey(stored.session.id),
        value: serialized
      })
      .onConflictDoUpdate({
        target: config.key,
        set: { value: serialized }
      })
  }
}

export const tuffIntelligenceRuntime = new TuffIntelligenceRuntime()
