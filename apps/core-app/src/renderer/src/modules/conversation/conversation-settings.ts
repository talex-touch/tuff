import type { ReasoningEffortSetting } from '@talex-touch/utils/intelligence/reasoning-effort'
import type { ModelRef } from './model-display'
import {
  DEFAULT_REASONING_EFFORT_SETTING,
  normalizeReasoningEffortSetting
} from '@talex-touch/utils/intelligence/reasoning-effort'
import { appSetting } from '~/modules/storage/app-storage'
import { sameModelRef } from './model-display'

/**
 * The `conversation` block of `AppSetting` as the renderer reads and writes it. Both the model
 * picker and the favourites go through here so there is one place that knows the block can be
 * missing: hydration is a top-level shallow merge, so a profile written before the block existed,
 * or one whose block a hand edit mangled, reaches the renderer without it.
 */
export interface ConversationSettings {
  model: ModelRef | null
  favoriteModels: ModelRef[]
  /**
   * Optional here although the defaults carry it: the same shallow merge leaves it out of every
   * block written before it existed, and absent reads as `auto`.
   */
  reasoningEffort?: ReasoningEffortSetting
}

export function isModelRef(value: unknown): value is ModelRef {
  if (!value || typeof value !== 'object') return false
  const { providerId, model } = value as Record<string, unknown>
  return (
    typeof providerId === 'string' &&
    providerId.length > 0 &&
    typeof model === 'string' &&
    model.length > 0
  )
}

/** The two identifying fields and nothing else, so a `ModelChoice` never leaks its display fields into storage. */
export function toModelRef(ref: ModelRef): ModelRef {
  return { providerId: ref.providerId, model: ref.model }
}

function currentBlock(): Partial<ConversationSettings> | null {
  const block: unknown = appSetting.conversation
  return block && typeof block === 'object' ? (block as Partial<ConversationSettings>) : null
}

/** The persisted selection, or `null` when there is none or the stored value is not a model ref. */
export function readPersistedModel(): ModelRef | null {
  const model = currentBlock()?.model
  return isModelRef(model) ? toModelRef(model) : null
}

/** The persisted favourites, minus entries that are not model refs and later duplicates. */
export function readFavoriteModels(): ModelRef[] {
  const stored = currentBlock()?.favoriteModels
  if (!Array.isArray(stored)) return []
  const favorites: ModelRef[] = []
  for (const entry of stored) {
    if (isModelRef(entry) && !favorites.some((known) => sameModelRef(known, entry))) {
      favorites.push(toModelRef(entry))
    }
  }
  return favorites
}

/**
 * The reasoning effort the composer asks for, `auto` when missing or unrecognised. Never adjusted
 * to the pinned model: a level a model cannot take is simply not sent to it, and comes back with
 * the next model that can.
 */
export function readReasoningEffortSetting(): ReasoningEffortSetting {
  return normalizeReasoningEffortSetting(currentBlock()?.reasoningEffort)
}

/**
 * The live block for writes, created on first use when the profile lacks it. Returned through
 * the settings proxy rather than as the literal that was assigned, so writes land on the
 * reactive object the auto-save watcher observes.
 */
export function writableConversationSettings(): ConversationSettings {
  if (!currentBlock()) {
    // The block the defaults would have written, so a profile that lacked it matches a fresh one.
    const created: Required<ConversationSettings> = {
      model: null,
      favoriteModels: [],
      reasoningEffort: DEFAULT_REASONING_EFFORT_SETTING
    }
    appSetting.conversation = created
  }
  return appSetting.conversation as ConversationSettings
}
