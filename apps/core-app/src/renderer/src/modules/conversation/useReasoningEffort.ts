import type {
  IntelligenceReasoningLevel,
  ReasoningEffortSetting
} from '@talex-touch/utils/intelligence/reasoning-effort'
import type { ComputedRef } from 'vue'
import type { ReasoningRowState } from './reasoning-effort-display'
import { normalizeReasoningEffortSetting } from '@talex-touch/utils/intelligence/reasoning-effort'
import { computed } from 'vue'
import { readReasoningEffortSetting, writableConversationSettings } from './conversation-settings'
import { resolveReasoningRow } from './reasoning-effort-display'
import { useModelOptions } from './useModelOptions'

export interface UseReasoningEffortReturn {
  /** `appSetting.conversation.reasoningEffort`, `auto` when unset. */
  setting: ComputedRef<ReasoningEffortSetting>
  /** The model menu's effort row for the model the next send pins, or for auto routing. */
  row: ComputedRef<ReasoningRowState>
  /** The composer pill's suffix; `null` shows none. */
  pillLevel: ComputedRef<IntelligenceReasoningLevel | null>
  /** Persists the choice. Only this one key of the block is written. */
  select: (value: ReasoningEffortSetting) => void
}

/**
 * The composer's reasoning effort: one global setting, read at send time and shown against the
 * model the next send will pin.
 *
 * Global like the model pin, and like it never rewritten by a model switch — a model that cannot
 * take the chosen level is simply not sent it (the row says so), and the next model that can gets it
 * back. The row resolves against `resolvedChoice`, the same pin `routing` sends, so an unresolvable
 * stored model reads as auto routing here exactly as it does at send time.
 */
export function useReasoningEffort(): UseReasoningEffortReturn {
  const { resolvedChoice } = useModelOptions()

  const setting = computed<ReasoningEffortSetting>(() => readReasoningEffortSetting())
  const row = computed<ReasoningRowState>(() =>
    resolveReasoningRow(setting.value, resolvedChoice.value)
  )

  function select(value: ReasoningEffortSetting): void {
    writableConversationSettings().reasoningEffort = normalizeReasoningEffortSetting(value)
  }

  return {
    setting,
    row,
    pillLevel: computed(() => row.value.pillLevel),
    select
  }
}
