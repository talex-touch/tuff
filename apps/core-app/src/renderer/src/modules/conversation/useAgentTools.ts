import type {
  AgentToolConfirmRequest,
  AgentToolPermissionMode
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  AgentToolEvents,
  createAgentToolsSdk
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { getCurrentScope, onScopeDispose, ref } from 'vue'

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
