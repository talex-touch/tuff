import type { ModelDisplayFields, ModelRef } from './model-display'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { appSettingStore } from '~/modules/storage/app-storage'
import { waitForHydrationSoftTimeout } from '~/modules/startup/hydration-timeout'
import {
  readPersistedModel,
  toModelRef,
  writableConversationSettings
} from './conversation-settings'
import { sameModelRef, splitModelId } from './model-display'

export type { ModelRef } from './model-display'

/** Same capability the home conversation streams through, so the list matches what can answer. */
const CHAT_CAPABILITY_ID = 'text.chat'

/**
 * Hydration normally finished before the renderer mounted (`main.ts` waits for it), so this only
 * matters when the storage transport is wedged. The wait is bounded so the options still load in
 * that case; the persisted selection is resolved reactively, so it catches up whenever hydration
 * does land.
 */
const HYDRATION_SOFT_TIMEOUT_MS = 3000

/**
 * The slice of `getProviderModelOptions`' result this picker reads, declared structurally rather
 * than imported: the transport barrel does not re-export the option type, and only these fields
 * decide what the menu can render.
 */
export interface ProviderModelOption {
  providerId: string
  providerName: string
  providerType: string
  models: string[]
  available: boolean
}

/** One row of the menu: identity, what to draw it with, and how to label it. */
export interface ModelChoice extends ModelDisplayFields {
  /** Picks the provider icon; see `providerIconFor`. */
  providerType: string
}

/** What the send path reads: empty when the next turn should be auto-routed. */
export interface ConversationModelSelection {
  providerId?: string
  model?: string
}

export interface EnsureLoadedOptions {
  /** Fetch again even though a load has already succeeded. */
  refresh?: boolean
}

/**
 * Module scope so the top bar pill and the composer pill are the same control shown twice, rather
 * than two independent pickers that can disagree about what will run. The selection itself lives
 * in `appSetting.conversation`; only the option list and its load state are held here.
 */
const options = ref<ProviderModelOption[]>([])
const loading = ref(false)
/** A load has finished, well or badly. Until then the persisted selection cannot be trusted to resolve. */
const loaded = ref(false)
/** A load has succeeded; a failed one leaves this false so the next `load()` tries again. */
let fetched = false
let inFlight: Promise<void> | null = null
let hydrationWait: Promise<unknown> | null = null

export interface UseModelOptionsReturn {
  options: Ref<ProviderModelOption[]>
  /** Available providers only, flattened one row per model, in the order the options arrived. */
  choices: ComputedRef<ModelChoice[]>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  load: (force?: boolean) => Promise<void>
  /**
   * Waits for settings hydration, then loads: once by default, or again with `refresh` so a
   * provider registered after the first load (a CLI installed while the app runs, a provider
   * enabled in settings) is picked up. A refresh joins a load already in flight rather than
   * queueing another, so the mount-time load and a quick first open cost one round trip.
   */
  ensureLoaded: (options?: EnsureLoadedOptions) => Promise<void>
  /** `appSetting.conversation.model` as stored, whether or not it resolves to a current option. */
  persistedSelection: ComputedRef<ModelRef | null>
  /**
   * The persisted selection resolved against the loaded choices. Undefined before the first load
   * finishes and whenever the stored model is not on offer — the pill and routing then fall back
   * to auto, but the stored value is left alone so it comes back with its provider.
   */
  resolvedChoice: ComputedRef<ModelChoice | undefined>
  /** What the next send pins: the resolved choice, or nothing. */
  routing: ComputedRef<ConversationModelSelection>
  /** Persists the choice, or `null` for auto. Only the two identifying fields are written. */
  select: (choice: ModelChoice | ModelRef | null) => void
  /** Whether the row is the persisted selection. */
  isSelected: (choice: ModelRef) => boolean
}

function toChoice(option: ProviderModelOption, model: string): ModelChoice {
  const { source, name } = splitModelId(model)
  return {
    providerId: option.providerId,
    providerName: option.providerName,
    providerType: option.providerType,
    model,
    source,
    displayName: name
  }
}

export function useModelOptions(): UseModelOptionsReturn {
  const sdk = useIntelligenceSdk()

  function load(force = false): Promise<void> {
    if (inFlight) return inFlight
    if (fetched && !force) return Promise.resolve()
    inFlight = (async () => {
      loading.value = true
      try {
        options.value = await sdk.getProviderModelOptions({ capabilityId: CHAT_CAPABILITY_ID })
        fetched = true
      } catch {
        // The list is left as it was: still empty on a first load, so the pill keeps its auto
        // label; the previous list on a refresh, which is better than blanking a menu the user
        // is looking at. The send path does not depend on this list, so surfacing an error here
        // would be noise about a control the user may never open.
      } finally {
        loaded.value = true
        loading.value = false
        inFlight = null
      }
    })()
    return inFlight
  }

  function ensureLoaded({ refresh = false }: EnsureLoadedOptions = {}): Promise<void> {
    hydrationWait ??= waitForHydrationSoftTimeout(appSettingStore, {
      timeoutMs: HYDRATION_SOFT_TIMEOUT_MS
    })
    return hydrationWait.then(() => load(refresh))
  }

  /**
   * Flattened to one row per model. Providers with no models still contribute nothing rather than
   * an unselectable header — a provider you cannot pick a model on cannot be routed to explicitly.
   */
  const choices = computed<ModelChoice[]>(() =>
    options.value
      .filter((option) => option.available)
      .flatMap((option) => option.models.map((model) => toChoice(option, model)))
  )

  const persistedSelection = computed<ModelRef | null>(() => readPersistedModel())

  const resolvedChoice = computed<ModelChoice | undefined>(() => {
    if (!loaded.value) return undefined
    const persisted = persistedSelection.value
    if (!persisted) return undefined
    return choices.value.find((choice) => sameModelRef(choice, persisted))
  })

  const routing = computed<ConversationModelSelection>(() => {
    const choice = resolvedChoice.value
    return choice ? toModelRef(choice) : {}
  })

  function select(choice: ModelChoice | ModelRef | null): void {
    writableConversationSettings().model = choice ? toModelRef(choice) : null
  }

  function isSelected(choice: ModelRef): boolean {
    const persisted = persistedSelection.value
    return persisted !== null && sameModelRef(persisted, choice)
  }

  return {
    options,
    choices,
    loading,
    loaded,
    load,
    ensureLoaded,
    persistedSelection,
    resolvedChoice,
    routing,
    select,
    isSelected
  }
}
