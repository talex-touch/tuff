import type {
  AgentToolConfirmRequest,
  AgentToolConfirmSettlement,
  AgentToolPermissionMode
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { Ref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  AgentToolEvents,
  createAgentToolsSdk
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { getCurrentScope, onScopeDispose, ref } from 'vue'

const agentToolsLog = createRendererLogger('AgentTools')
/**
 * What the composer's permission pill offers: the gate's two behaviours, plus
 * "no tools at all". `off` is not a gate mode — it closes the gateway — so it
 * only exists on this side of the transport.
 */
export type AgentToolsMode = 'off' | AgentToolPermissionMode

export interface UseAgentToolsReturn {
  /** The confirmation the user is being asked about, or null when idle. */
  pending: Ref<AgentToolConfirmRequest | null>
  /** Requests queued behind the visible one. */
  queued: Ref<AgentToolConfirmRequest[]>
  approve: (remember: boolean) => Promise<void>
  deny: (remember: boolean) => Promise<void>
  /** Applies a permission mode; returns the granted tool names, empty when off. */
  setMode: (mode: AgentToolsMode) => Promise<string[]>
  /** Forgets remembered approvals — called when the thread changes. */
  resetApprovals: () => Promise<void>
}

/**
 * Renderer half of the tool confirmation round-trip.
 *
 * One request is shown at a time: a parallel agent could ask twice before the
 * user answers once, and stacking two cards on the same conversation would
 * make it ambiguous which one a click belongs to.
 */
export function useAgentTools(): UseAgentToolsReturn {
  const transport = useTuffTransport()
  const sdk = createAgentToolsSdk(transport)

  const pending = ref<AgentToolConfirmRequest | null>(null)
  const queued = ref<AgentToolConfirmRequest[]>([])
  const decisionsInFlight = new Set<string>()
  const settledWhileDeciding = new Set<string>()

  /** Shows the request now if nothing is being answered, otherwise lines it up behind. */
  function enqueue(request: AgentToolConfirmRequest): void {
    if (pending.value) queued.value = [...queued.value, request]
    else pending.value = request
  }

  function advance(): void {
    const [next, ...rest] = queued.value
    pending.value = next ?? null
    queued.value = rest
  }

  function removeSettled(settlement: AgentToolConfirmSettlement): void {
    if (decisionsInFlight.has(settlement.requestId)) {
      settledWhileDeciding.add(settlement.requestId)
    }
    if (pending.value?.requestId === settlement.requestId) {
      advance()
      return
    }
    queued.value = queued.value.filter((request) => request.requestId !== settlement.requestId)
  }

  const disposers = [
    transport.on(AgentToolEvents.confirmRequest, enqueue),
    transport.on(AgentToolEvents.confirmSettled, removeSettled)
  ]

  async function settle(approved: boolean, remember: boolean): Promise<void> {
    const request = pending.value
    if (!request) return
    decisionsInFlight.add(request.requestId)
    // The queue advances first: the gateway answering slowly must not leave a
    // dead card on screen taking clicks.
    advance()
    try {
      await sdk.decide({ requestId: request.requestId, approved, remember })
    } catch (error) {
      // The card had already gone and the gateway never got an answer, so the turn hung on a
      // blocked tool call with nothing on screen - and, bound straight to a template handler,
      // this was an unhandled rejection too (#828).
      //
      // Re-queued rather than awaited before advancing: awaiting would undo the fast advance
      // above and put the dead card back. The request returns to the same place a fresh one
      // would, so the user can answer it again unless main already settled it.
      agentToolsLog.error(`Failed to answer tool confirmation ${request.requestId}`, error)
      if (!settledWhileDeciding.has(request.requestId)) enqueue(request)
    } finally {
      decisionsInFlight.delete(request.requestId)
      settledWhileDeciding.delete(request.requestId)
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const dispose of disposers) dispose()
    })
  }

  return {
    pending,
    queued,
    approve: (remember) => settle(true, remember),
    deny: (remember) => settle(false, remember),
    setMode: async (mode) => {
      // `off` sends no mode at all: the gate behaviour is meaningless with the
      // gateway shut, and omitting it keeps the payload honest about that.
      const result = await sdk.setEnabled(mode !== 'off', mode === 'off' ? undefined : mode)
      return result?.tools ?? []
    },
    resetApprovals: async () => {
      await sdk.resetApprovals()
    }
  }
}
