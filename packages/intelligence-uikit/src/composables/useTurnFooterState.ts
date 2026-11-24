import type { ComputedRef } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

export interface TxAiFooterMessage { id: string; role: string; status: string }
const FOOTER_REVEAL_MS = 4500

function isSettledStatus(status: string): boolean {
  return status === 'complete' || status === 'done'
}

export function useTurnFooterState(messages: ComputedRef<TxAiFooterMessage[]>) {
  const activeFooterMessageIds = ref<Set<string>>(new Set())
  const footerTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function clearRevealTimer(messageId: string): void {
    const timer = footerTimers.get(messageId)
    if (timer !== undefined) {
      clearTimeout(timer)
      footerTimers.delete(messageId)
    }
    activeFooterMessageIds.value.delete(messageId)
  }

  function isLatestSettledAssistant(message: TxAiFooterMessage): boolean {
    const last = messages.value.at(-1)
    return Boolean(
      last &&
        last.id === message.id &&
        last.role === 'assistant' &&
        isSettledStatus(last.status)
    )
  }

  function revealTurnFooter(messageId: string): void {
    activeFooterMessageIds.value.add(messageId)
    clearTimeout(footerTimers.get(messageId))
    const timer = setTimeout(() => {
      activeFooterMessageIds.value.delete(messageId)
      footerTimers.delete(messageId)
    }, FOOTER_REVEAL_MS)
    footerTimers.set(messageId, timer)
  }

  function isTurnFooterResting(message: TxAiFooterMessage): boolean {
    if (isLatestSettledAssistant(message)) return false
    return !activeFooterMessageIds.value.has(message.id)
  }

  watch(
    () => messages.value.map((m) => `${m.id}:${m.status}`).join(';'),
    (_current, previous) => {
      if (!previous) return
      const prevMap = new Map(previous.split(';').map((s) => s.split(':') as [string, string]))
      for (const msg of messages.value) {
        if (
          msg.role === 'assistant' &&
          isSettledStatus(msg.status) &&
          !isSettledStatus(prevMap.get(msg.id) ?? '')
        ) {
          if (isLatestSettledAssistant(msg)) {
            clearRevealTimer(msg.id)
          } else {
            revealTurnFooter(msg.id)
          }
        }
      }
    }
  )

  onScopeDispose(() => {
    for (const timer of footerTimers.values()) clearTimeout(timer)
    footerTimers.clear()
  })

  return {
    isTurnFooterResting
  }
}
