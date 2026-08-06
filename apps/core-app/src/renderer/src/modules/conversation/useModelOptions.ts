import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, ref, type ComputedRef, type Ref } from 'vue'

/** Same capability the home conversation streams through, so the list matches what can answer. */
const CHAT_CAPABILITY_ID = 'text.chat'

/**
 * The slice of `getProviderModelOptions`' result this picker reads, declared structurally rather
 * than imported: the transport barrel does not re-export the option type, and only these four
 * fields decide what the menu can render.
 */
export interface ProviderModelOption {
  providerId: string
  providerName: string
  models: string[]
  available: boolean
}

export interface ModelChoice {
  providerId: string
  providerName: string
  model: string
}

export interface ConversationModelSelection {
  providerId?: string
  model?: string
}

/**
 * Selection lives at module scope so the top bar pill and the composer pill are the same control
 * shown twice, rather than two independent pickers that can disagree about what will run.
 *
 * Session-scoped on purpose: there is no settings field for a conversation-level model yet, and
 * inventing a persisted one here would create a preference no settings page can manage.
 */
const selection = ref<ConversationModelSelection>({})
const options = ref<ProviderModelOption[]>([])
const loading = ref(false)
let loaded = false

export interface UseModelOptionsReturn {
  options: Ref<ProviderModelOption[]>
  choices: ComputedRef<ModelChoice[]>
  selection: Ref<ConversationModelSelection>
  /** What the pill shows: the chosen model, or the auto-routing label when nothing is pinned. */
  selectedModel: ComputedRef<string | undefined>
  loading: Ref<boolean>
  load: (force?: boolean) => Promise<void>
  select: (choice: ModelChoice | null) => void
  isSelected: (choice: ModelChoice) => boolean
}

export function useModelOptions(): UseModelOptionsReturn {
  const sdk = useIntelligenceSdk()

  async function load(force = false): Promise<void> {
    if (loading.value || (loaded && !force)) return
    loading.value = true
    try {
      options.value = await sdk.getProviderModelOptions({ capabilityId: CHAT_CAPABILITY_ID })
      loaded = true
    } catch {
      // A failed lookup leaves the pill on its auto label; the send path does not depend on this
      // list, so surfacing an error here would be noise about a control the user may never open.
      options.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Flattened to one row per model. Providers with no models still contribute nothing rather than
   * an unselectable header — a provider you cannot pick a model on cannot be routed to explicitly.
   */
  const choices = computed<ModelChoice[]>(() =>
    options.value
      .filter((option) => option.available)
      .flatMap((option) =>
        option.models.map((model) => ({
          providerId: option.providerId,
          providerName: option.providerName,
          model
        }))
      )
  )

  function select(choice: ModelChoice | null): void {
    selection.value = choice ? { providerId: choice.providerId, model: choice.model } : {}
  }

  function isSelected(choice: ModelChoice): boolean {
    return (
      selection.value.providerId === choice.providerId && selection.value.model === choice.model
    )
  }

  return {
    options,
    choices,
    selection,
    selectedModel: computed(() => selection.value.model),
    loading,
    load,
    select,
    isSelected
  }
}
