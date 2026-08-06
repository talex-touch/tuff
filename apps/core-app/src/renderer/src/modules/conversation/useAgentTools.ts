import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  AgentToolEvents,
  createAgentToolsSdk
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { getCurrentScope, onScopeDispose, ref } from 'vue'

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

  const dispose = transport.on(AgentToolEvents.confirmRequest, (request) => {
    if (pending.value) queued.value = [...queued.value, request]
    else pending.value = request
  })

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
    await sdk.decide({ requestId: request.requestId, approved, remember })
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
