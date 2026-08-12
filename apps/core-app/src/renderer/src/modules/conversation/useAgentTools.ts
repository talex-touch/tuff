import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { Ref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  AgentToolEvents,
  createAgentToolsSdk
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { getCurrentScope, onScopeDispose, ref } from 'vue'

const agentToolsLog = createRendererLogger('AgentTools')

export interface UseAgentToolsReturn {
  /** The confirmation the user is being asked about, or null when idle. */
  pending: Ref<AgentToolConfirmRequest | null>
  /** Requests queued behind the visible one. */
  queued: Ref<AgentToolConfirmRequest[]>
  approve: (remember: boolean) => Promise<void>
  deny: (remember: boolean) => Promise<void>
  /** Turns the agent's tool access on or off; returns the granted tool names. */
  setEnabled: (enabled: boolean) => Promise<string[]>
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

  /** Shows the request now if nothing is being answered, otherwise lines it up behind. */
  function enqueue(request: AgentToolConfirmRequest): void {
    if (pending.value) queued.value = [...queued.value, request]
    else pending.value = request
  }

  const dispose = transport.on(AgentToolEvents.confirmRequest, enqueue)

  function advance(): void {
    const [next, ...rest] = queued.value
    pending.value = next ?? null
    queued.value = rest
  }

  async function settle(approved: boolean, remember: boolean): Promise<void> {
    const request = pending.value
    if (!request) return
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
      // would, so the user can answer it again.
      agentToolsLog.error(`Failed to answer tool confirmation ${request.requestId}`, error)
      enqueue(request)
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      dispose()
    })
  }

  return {
    pending,
    queued,
    approve: (remember) => settle(true, remember),
    deny: (remember) => settle(false, remember),
    setEnabled: async (enabled) => {
      const result = await sdk.setEnabled(enabled)
      return result?.tools ?? []
    },
    resetApprovals: async () => {
      await sdk.resetApprovals()
    }
  }
}
