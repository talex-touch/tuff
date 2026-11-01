import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import type { Ref, ShallowRef } from 'vue'
import { computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import type { ConversationRouting } from '~/modules/conversation/useHomeConversation'
import { HOME_FEED_MAX_ITEMS } from '~/modules/home-push/feed'
import type { HomeOpeningPhase, HomeOpeningSource } from '~/modules/home-push/opening'
import { useHomePush } from '~/modules/home-push/useHomePush'
import { appSetting } from '~/modules/storage/app-storage'

/** The opening as the greeting shows it while a send is taking the stage. */
export interface OpeningHold {
  phase: HomeOpeningPhase
  text: string
  source: HomeOpeningSource | null
}

export interface HomeOpeningOptions {
  /**
   * The opening as the greeting shows it. `submit` pins it for the one flush between taking the lead
   * and the greeting's leave: `takeLead` drops an opening still being written, and the greeting should
   * fade out with the words the reader saw rather than lose them a frame before it goes. Owned by the
   * page because the send path, declared long before this composable, reads and clears it.
   */
  openingHold: ShallowRef<OpeningHold | null>
  /** The browser landing page has no recommendations. */
  browserLanding: () => boolean
  isEmpty: Ref<boolean>
  conversationId: Ref<string | null>
  projectId: Ref<string | null>
  routing: () => ConversationRouting | undefined
  /** Resolves once the model list has loaded, so the pinned model is known. */
  routingReady: () => Promise<unknown>
  draft: Ref<string>
  input: Ref<HTMLTextAreaElement | null>
  autoGrow: () => void
  /** The ordinary send, lift included. */
  submit: () => Promise<void>
}

/**
 * The blank conversation's personal-assistant push (`modules/home-push`): a model-written opening
 * under the greeting, and a card under the composer — the two-page guide, or 「为你准备」 once there
 * is history.
 *
 * Set up after the thread watchers: its immediate watcher reads `conversationId`, and by then the
 * route watcher has claimed the blank conversation's project, so the first entry is already the
 * right one. Only plain `/home` counts — `/home/c/:id` is empty too while its thread loads, and
 * must not pay for an opening it is about to replace.
 */
export function useHomeOpening(options: HomeOpeningOptions) {
  const route = useRoute()

  /** Whether Home personal-assistant recommendations are enabled (`appSetting.tools.homeRecommendations`, off by default, Beta). */
  const homeRecommendationsEnabled = computed(
    () => !options.browserLanding() && appSetting.tools?.homeRecommendations === true
  )

  async function focusDraft(text: string): Promise<void> {
    options.draft.value = text
    await nextTick()
    options.autoGrow()
    options.input.value?.focus()
  }

  const push = useHomePush({
    active: () =>
      homeRecommendationsEnabled.value &&
      route.path === '/home' &&
      options.isEmpty.value &&
      options.conversationId.value === null,
    projectId: () => options.projectId.value,
    // The opening takes the route the chat turns take — a local CLI there answers in ten-odd seconds,
    // so the template stands in meanwhile (`modules/home-push/opening.ts`).
    routing: options.routing,
    // The pinned model resolves only once the model list has loaded, and the routing reads as auto
    // until then: the first opening after a launch waits for it.
    routingReady: options.routingReady,
    // Off unless the user turned it on in settings: each model-written opening costs their quota.
    aiOpening: () => appSetting.tools?.homeAiOpening === true,
    composer: {
      // The clipboard row: written and focused, never sent — the reader sees what would go out first.
      prefill: focusDraft,
      // A starter task: the ordinary send, lift included. Focused first, so the lift leaves from a
      // composer on screen and the keyboard stays where the conversation continues.
      send: async (text) => {
        await focusDraft(text)
        await options.submit()
      },
      // 「我自己说」
      focus: () => options.input.value?.focus()
    }
  })

  const {
    mode: pushMode,
    steps: pushSteps,
    step: pushStep,
    selected: pushSelected,
    loading: pushLoading,
    loadingRows: pushLoadingRows,
    labels: pushLabels,
    choose: choosePush
  } = push

  const { openingHold } = options
  const openingPhase = computed(() => openingHold.value?.phase ?? push.opening.phase.value)
  const openingText = computed(() => openingHold.value?.text ?? push.opening.text.value)
  /** Keys the text: the model's opening taking the template's place is a swap, not an edit. */
  const openingSource = computed(() =>
    openingHold.value ? openingHold.value.source : push.opening.source.value
  )
  /**
   * A screen reader waits out the skeleton and the stream, then reads what shows once it is whole:
   * the template as it stands in, and the model's opening again if it takes the template's place.
   */
  const openingBusy = computed(
    () => openingPhase.value === 'pending' || openingPhase.value === 'streaming'
  )

  /**
   * The card's skeleton, held back and held on (`useDeferredLoading`): local reads that land inside
   * its delay never show one. Until they land the card stays out of sight rather than show rows that
   * are not final yet — on a cold start that is the guide, about to become 「为你准备」. Its slot keeps
   * the room either way.
   */
  const pushSkeleton = useDeferredLoading(pushLoading)
  const pushSettling = computed(() => pushLoading.value && !pushSkeleton.value)

  /**
   * How many option rows the card's slot holds in the current mode: the guide's longest page, or a
   * full 「为你准备」. Paging the guide, the clipboard row arriving and rows replacing their skeleton
   * then never resize the slot — and the stage is centred on its whole height, so any of them would
   * otherwise move the composer. One- and two-column counts both, for `.HomePage-PushSlot`'s
   * container query to pick from.
   */
  const pushSlotStyle = computed(() => {
    const rows =
      pushMode.value === 'feed'
        ? HOME_FEED_MAX_ITEMS
        : Math.max(0, ...pushSteps.value.map((step) => step.options.length))
    return {
      '--home-push-rows-1': rows,
      '--home-push-rows-2': Math.ceil(rows / 2),
      '--home-push-pager': pushSteps.value.length > 1 ? 1 : 0
    }
  })

  return {
    push,
    homeRecommendationsEnabled,
    openingPhase,
    openingText,
    openingSource,
    openingBusy,
    pushSteps,
    pushStep,
    pushSelected,
    pushLoadingRows,
    pushLabels,
    choosePush,
    pushSkeleton,
    pushSettling,
    pushSlotStyle
  }
}
