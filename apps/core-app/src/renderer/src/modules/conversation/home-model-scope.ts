import type {
  IntelligenceReasoningLevel,
  ReasoningEffortSetting
} from '@talex-touch/utils/intelligence/reasoning-effort'
import type { ComputedRef, InjectionKey } from 'vue'
import type { ModelRef } from './model-display'
import type { ReasoningRowState } from './reasoning-effort-display'
import type { ConversationModelSelection, ModelChoice } from './useModelOptions'
import { normalizeReasoningEffortSetting } from '@talex-touch/utils/intelligence/reasoning-effort'
import { computed, inject, provide } from 'vue'
import { toModelRef } from './conversation-settings'
import { sameModelRef } from './model-display'
import { resolveReasoningRow } from './reasoning-effort-display'
import { useModelOptions } from './useModelOptions'
import { useReasoningEffort } from './useReasoningEffort'

/**
 * Whose model and reasoning choice the Home pills read and write.
 *
 * Two owners exist. A blank `/home` has no conversation yet, so its pick is the global default in
 * `appSetting.conversation` — the value every new conversation starts from. A conversation Main
 * already holds keeps its own selection in its workspace settings; picking a model there must reach
 * that conversation only, never rewrite the default another conversation would inherit (A5).
 *
 * The option list, favourites and hotkeys stay global: they describe what can answer, not who chose.
 */
export interface HomeModelScope {
  /** `session` while the pills edit one conversation's own settings. */
  owner: ComputedRef<'global' | 'session'>
  /** The selection resolved against the loaded choices; undefined is auto routing. */
  resolvedChoice: ComputedRef<ModelChoice | undefined>
  routing: ComputedRef<ConversationModelSelection>
  isSelected: (choice: ModelRef) => boolean
  select: (choice: ModelChoice | ModelRef | null) => void
  effortSetting: ComputedRef<ReasoningEffortSetting>
  effortRow: ComputedRef<ReasoningRowState>
  pillLevel: ComputedRef<IntelligenceReasoningLevel | null>
  selectEffort: (value: ReasoningEffortSetting) => void
}

/** What a conversation's own settings say about routing; undefined fields mean auto. */
export interface SessionModelSettings {
  providerId?: string
  model?: string
  reasoningEffort?: ReasoningEffortSetting
}

export interface SessionModelScopeOptions {
  /** The active conversation's settings, or undefined while the global default is in charge. */
  settings: () => SessionModelSettings | undefined
  /** Writes a patch to the active conversation through Main. */
  configure: (patch: SessionModelSettings) => void
}

const HOME_MODEL_SCOPE: InjectionKey<HomeModelScope> = Symbol('HomeModelScope')

function createGlobalScope(): HomeModelScope {
  const models = useModelOptions()
  const effort = useReasoningEffort()
  return {
    owner: computed(() => 'global'),
    resolvedChoice: models.resolvedChoice,
    routing: models.routing,
    isSelected: models.isSelected,
    select: models.select,
    effortSetting: effort.setting,
    effortRow: effort.row,
    pillLevel: effort.pillLevel,
    selectEffort: effort.select
  }
}

/**
 * The scope HomePage provides: the active conversation's own settings when Main holds one, the
 * global default otherwise. Session reads resolve against the same loaded choices the global pin
 * does, so an unavailable model reads as auto here exactly as it would at send time — while the
 * stored session value is left alone for when its provider returns.
 */
export function provideHomeModelScope(options: SessionModelScopeOptions): HomeModelScope {
  const global = createGlobalScope()
  const { choices, loaded } = useModelOptions()

  const session = computed(() => options.settings())
  const owner = computed<'global' | 'session'>(() => (session.value ? 'session' : 'global'))

  const sessionRef = computed<ModelRef | null>(() => {
    const settings = session.value
    return settings?.providerId && settings.model
      ? { providerId: settings.providerId, model: settings.model }
      : null
  })

  const resolvedChoice = computed<ModelChoice | undefined>(() => {
    if (!session.value) return global.resolvedChoice.value
    const pinned = sessionRef.value
    if (!loaded.value || !pinned) return undefined
    return choices.value.find((choice) => sameModelRef(choice, pinned))
  })

  const routing = computed<ConversationModelSelection>(() => {
    const choice = resolvedChoice.value
    return choice ? toModelRef(choice) : {}
  })

  const effortSetting = computed<ReasoningEffortSetting>(() =>
    session.value
      ? normalizeReasoningEffortSetting(session.value.reasoningEffort)
      : global.effortSetting.value
  )

  const effortRow = computed<ReasoningRowState>(() =>
    session.value
      ? resolveReasoningRow(effortSetting.value, resolvedChoice.value)
      : global.effortRow.value
  )

  const scope: HomeModelScope = {
    owner,
    resolvedChoice,
    routing,
    isSelected: (choice) => {
      if (!session.value) return global.isSelected(choice)
      const pinned = sessionRef.value
      return pinned !== null && sameModelRef(pinned, choice)
    },
    select: (choice) => {
      if (!session.value) {
        global.select(choice)
        return
      }
      const next = choice ? toModelRef(choice) : null
      options.configure({ providerId: next?.providerId, model: next?.model })
    },
    effortSetting,
    effortRow,
    pillLevel: computed(() => effortRow.value.pillLevel),
    selectEffort: (value) => {
      if (!session.value) {
        global.selectEffort(value)
        return
      }
      options.configure({ reasoningEffort: normalizeReasoningEffortSetting(value) })
    }
  }
  provide(HOME_MODEL_SCOPE, scope)
  return scope
}

/** The scope provided by HomePage, or the global default for any other host of the menu. */
export function useHomeModelScope(): HomeModelScope {
  return inject(HOME_MODEL_SCOPE, null) ?? createGlobalScope()
}
