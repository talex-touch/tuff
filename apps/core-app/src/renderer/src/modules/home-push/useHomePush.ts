import type { ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import type { ClipboardItem } from '@talex-touch/utils/transport/events'
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { ComputedRef, Ref } from 'vue'
import type { LocalAiSessionTarget } from '~/modules/conversation/local-ai-session-entry'
import type { ConversationRouting } from '~/modules/conversation/useHomeConversation'
import type { Translate } from '~/modules/lang/useI18nText'
import type { HomeFeedItem } from './feed'
import type {
  HomeOpeningCache,
  HomeOpeningPhase,
  HomeOpeningSdk,
  HomeOpeningSource
} from './opening'
import type { HomeGuideCategoryId, HomePushAction, HomePushMode, HomePushStep } from './types'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { continueLocalAiSession } from '~/modules/conversation/local-ai-session-entry'
import { useConversationEntry } from '~/modules/conversation/useConversationEntry'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useProjectStore } from '~/stores/projects'
import { createRendererLogger } from '~/utils/renderer-log'
import { buildHomeFeed, buildHomeFeedStep, HOME_FEED_MAX_ITEMS, resolveHomePushMode } from './feed'
import { buildHomeGuideSteps, guideCategoryOptionId } from './guide'
import { buildHomeOpeningRequest, createHomeOpening, createOpeningLeadNote } from './opening'
import { collectHomeSignals } from './signals'

/**
 * How long entering the blank state waits on the local reads (the stores' first load, the
 * clipboard, the composer's route) before going ahead with whatever they already hold. They are
 * SQLite and in-memory reads that normally land in milliseconds; the cap only keeps a stuck
 * channel from holding the skeleton up.
 */
export const HOME_PUSH_SOURCE_BUDGET_MS = 800

const pushLog = createRendererLogger('HomePush')

/** The composer, which HomePage owns: the card only ever asks it to do one of three things. */
export interface HomePushComposer {
  /** Writes `text` into the composer and focuses it. Must not send. */
  prefill: (text: string) => void | Promise<void>
  /** Writes `text` into the composer and sends it through the ordinary send path. */
  send: (text: string) => void | Promise<void>
  /** Focuses the composer. */
  focus: () => void
}

export interface HomePushNavigation {
  openConversation: (conversationId: string) => void | Promise<void>
  enterProject: (projectId: string) => void | Promise<void>
  continueSession: (session: LocalAiSessionTarget) => void | Promise<void>
}

/** The renderer state Home push reads. The defaults are the shared history and project stores. */
export interface HomePushDataSource {
  conversations: () => readonly ConversationRecord[]
  projects: () => readonly ProjectRecord[]
  sessions: () => readonly LocalAiCliSessionSummary[]
  /**
   * The stores' first load. Called once per `useHomePush`, on the first entry, and awaited (within
   * the budget) before that entry's summary is written — a cold start would otherwise greet the
   * user with an empty one. After it the stores keep themselves current (history re-reads after
   * every save and delete and on sync; projects and sessions on their change events), so a later
   * entry reads them as they stand instead of paying for another round trip.
   */
  load: () => Promise<void>
  /**
   * The newest text row of clipboard *history* — a database read. Never a live system clipboard
   * read: `getLatest({ refresh: true })` reads the OS clipboard synchronously on main's thread.
   */
  latestClipboardText: () => Promise<ClipboardItem | null>
}

export interface UseHomePushOptions {
  /**
   * Whether a blank new conversation is on screen: the plain `/home` route visible, no messages,
   * no conversation id yet. Read reactively; everything here is idle while it is false.
   */
  active: () => boolean
  /** Owner of the blank conversation, null for plain Home. A change starts a fresh entry. */
  projectId: () => string | null
  /** The composer's route, which the opening takes like every chat turn. Absent is auto. */
  routing?: () => ConversationRouting | undefined
  /**
   * Settles once `routing` can be trusted: the composer's pinned model resolves only after its
   * model list has loaded, and reads as auto until then. Awaited within the local reads' budget, so
   * the first opening after a launch does not go out on auto while the chat turns go to the pin.
   */
  routingReady?: () => Promise<unknown>
  composer: HomePushComposer
  t?: Translate
  sdk?: HomeOpeningSdk
  data?: HomePushDataSource
  navigation?: HomePushNavigation
  /** Defaults to the module-wide reuse cache. */
  cache?: HomeOpeningCache
  now?: () => number
}

export interface HomePushOpeningView {
  /** `pending` from the moment the blank state is entered, local reads included. */
  phase: ComputedRef<HomeOpeningPhase>
  text: ComputedRef<string>
  source: ComputedRef<HomeOpeningSource | null>
}

export interface UseHomePushReturn {
  mode: ComputedRef<HomePushMode>
  /** For `TxChoiceCard`'s `steps`: plain options, no actions attached. */
  steps: ComputedRef<ChoiceStep[]>
  /** For `v-model:step`. Reset to the first page on every entry and every mode change. */
  step: Ref<number>
  /** For `selected`: the category page 1 chose, so paging back shows it. */
  selected: ComputedRef<string | undefined>
  /** For `loading`: this entry's local reads have not landed, so the rows are not final yet. */
  loading: ComputedRef<boolean>
  /** For `loadingRows`: as many skeleton rows as the page on screen would draw. */
  loadingRows: ComputedRef<number>
  /** 「为你准备」's rows with their actions, whichever mode is showing. */
  feed: ComputedRef<HomeFeedItem[]>
  opening: HomePushOpeningView
  labels: ComputedRef<{ prev: string; next: string; openingLoading: string }>
  /** `TxChoiceCard`'s `select` handler. Runs the chosen row's action; never throws. */
  choose: (payload: ChoiceSelectPayload) => Promise<void>
  /** See `HomeOpening.takeLead`. Call it as the first message is sent, before the send. */
  takeLead: () => string | null
  /** For `useHomeConversation`'s `leadNote`. */
  leadNote: (text: string) => string
}

function settleWithin<T>(work: () => Promise<T>, budgetMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), budgetMs)
    const finish = (value: T): void => {
      clearTimeout(timer)
      resolve(value)
    }
    let pending: Promise<T>
    try {
      pending = work()
    } catch {
      finish(fallback)
      return
    }
    pending.then(finish, () => finish(fallback))
  })
}

function createDefaultDataSource(): HomePushDataSource {
  const history = useConversationHistory()
  const projectStore = useProjectStore()
  const transport = useTuffTransport()
  return {
    conversations: () => history.conversations.value,
    projects: () => projectStore.projects,
    sessions: () => projectStore.localAiSessions,
    load: async () => {
      await Promise.all([history.refresh(), projectStore.initialize()])
    },
    latestClipboardText: async () => {
      const response = await transport.send(ClipboardEvents.getHistory, { limit: 1, type: 'text' })
      return Array.isArray(response?.items) ? (response.items[0] ?? null) : null
    }
  }
}

function createDefaultNavigation(): HomePushNavigation {
  const router = useRouter()
  const { enterConversation } = useConversationEntry()
  const transport = useTuffTransport()
  return {
    openConversation: async (conversationId) => {
      await router.push(`/home/c/${conversationId}`)
    },
    enterProject: (projectId) => enterConversation(projectId),
    // The sidebar's own resume path, so the two entry points cannot disagree.
    continueSession: async (session) => {
      await continueLocalAiSession(transport, session)
    }
  }
}

function toChoiceStep(step: HomePushStep): ChoiceStep {
  return {
    id: step.id,
    title: step.title,
    options: step.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
      ...(option.icon ? { icon: option.icon } : {}),
      ...(option.disabled ? { disabled: true } : {})
    }))
  }
}

/**
 * Home's personal-assistant push: the model-written opening line and the card under the composer
 * (the two-page guide, or 「为你准备」 once there is history).
 *
 * Works only while `active()` holds. Each entry into the blank state — and each change of its
 * project — reads the newest clipboard history row and starts one opening (replayed from the cache
 * when the summary has not changed in ten minutes); the first entry also waits for the stores'
 * first load. Leaving drops an opening still in flight; nothing here outlives the blank state it
 * was started for.
 */
export function useHomePush(options: UseHomePushOptions): UseHomePushReturn {
  const t: Translate = options.t ?? useI18n().t
  const data = options.data ?? createDefaultDataSource()
  const navigation = options.navigation ?? createDefaultNavigation()
  const now = options.now ?? (() => Date.now())
  const opening = createHomeOpening({
    sdk: options.sdk ?? useIntelligenceSdk(),
    routing: options.routing,
    cache: options.cache,
    now
  })

  /** Recency windows are measured from the entry, so the card does not shift while it is read. */
  const enteredAt = ref(now())
  const clipboard = shallowRef<ClipboardItem | null>(null)
  /** This entry's local reads are still out; the rows may yet change. */
  const settling = ref(false)
  /** The summary is not written yet; the opening shows its skeleton meanwhile. */
  const preparing = ref(false)
  const category = ref<HomeGuideCategoryId | null>(null)
  const step = ref(0)

  const signals = computed(() =>
    collectHomeSignals({
      conversations: data.conversations(),
      projects: data.projects(),
      sessions: data.sessions(),
      clipboard: clipboard.value,
      activeProjectId: options.projectId(),
      now: enteredAt.value
    })
  )
  const feed = computed(() => buildHomeFeed(signals.value, t))
  const mode = computed(() => resolveHomePushMode(signals.value, feed.value))
  const pushSteps = computed<HomePushStep[]>(() =>
    mode.value === 'feed'
      ? [buildHomeFeedStep(feed.value, t)]
      : buildHomeGuideSteps(signals.value, category.value, t)
  )
  const steps = computed(() => pushSteps.value.map(toChoiceStep))
  const actions = computed(() => {
    const byId = new Map<string, HomePushAction>()
    for (const page of pushSteps.value) {
      for (const option of page.options) byId.set(option.id, option.action)
    }
    return byId
  })
  const selected = computed(() =>
    mode.value === 'guide' && category.value ? guideCategoryOptionId(category.value) : undefined
  )
  const loadingRows = computed(
    () => pushSteps.value[step.value]?.options.length || HOME_FEED_MAX_ITEMS
  )

  watch(mode, () => {
    category.value = null
    step.value = 0
  })

  let entry = 0
  /** Shared by every entry: one entered while the first load is still out waits on the same read. */
  let storesLoaded: Promise<void> | null = null

  async function enter(): Promise<void> {
    const sequence = ++entry
    const startedAt = now()
    enteredAt.value = startedAt
    clipboard.value = null
    category.value = null
    step.value = 0
    settling.value = true
    preparing.value = true
    opening.cancel()

    const loaded = settleWithin(
      () => (storesLoaded ??= data.load()).then(() => true),
      HOME_PUSH_SOURCE_BUDGET_MS,
      false
    )
    const routed = settleWithin(
      () => Promise.resolve(options.routingReady?.()).then(() => true),
      HOME_PUSH_SOURCE_BUDGET_MS,
      false
    )
    const copied = settleWithin(() => data.latestClipboardText(), HOME_PUSH_SOURCE_BUDGET_MS, null)

    await Promise.all([loaded, routed])
    if (sequence !== entry) return
    preparing.value = false
    // Built after the first load, so a cold start does not greet the user with an empty summary.
    // The opening's waits still count from the entry.
    opening.start(buildHomeOpeningRequest(signals.value, t), { startedAt })

    const item = await copied
    if (sequence !== entry) return
    clipboard.value = item
    settling.value = false
  }

  function leave(): void {
    entry += 1
    settling.value = false
    preparing.value = false
    opening.cancel()
  }

  const blankKey = computed(() => (options.active() ? `blank:${options.projectId() ?? ''}` : null))
  watch(
    blankKey,
    (key, previous) => {
      if (key === null) leave()
      else if (key !== previous) void enter()
    },
    { immediate: true }
  )

  if (getCurrentScope()) {
    onScopeDispose(() => {
      entry += 1
      opening.dispose()
    })
  }

  async function run(action: HomePushAction): Promise<void> {
    switch (action.kind) {
      case 'choose-category':
        category.value = action.category
        step.value = 1
        return
      case 'send':
        await options.composer.send(action.text)
        return
      case 'focus-composer':
        options.composer.focus()
        return
      case 'prefill':
        await options.composer.prefill(action.text)
        return
      case 'open-conversation':
        await navigation.openConversation(action.conversationId)
        return
      case 'continue-session':
        await navigation.continueSession(action.session)
        return
      case 'enter-project':
        await navigation.enterProject(action.projectId)
    }
  }

  async function choose(payload: ChoiceSelectPayload): Promise<void> {
    const action = actions.value.get(payload.option.id)
    if (!action) return
    try {
      await run(action)
    } catch (error) {
      // The kind and the error's class only: a prefill or send carries the user's text.
      pushLog.warn('Home push action failed', action.kind, error instanceof Error ? error.name : '')
    }
  }

  function takeLead(): string | null {
    // Sent before the summary was even written: no opening will start for this entry.
    if (preparing.value) {
      leave()
      return null
    }
    return opening.takeLead()
  }

  return {
    mode,
    steps,
    step,
    selected,
    loading: computed(() => settling.value),
    loadingRows,
    feed,
    opening: {
      phase: computed(() => (preparing.value ? 'pending' : opening.phase.value)),
      text: computed(() => (preparing.value ? '' : opening.text.value)),
      source: computed(() => (preparing.value ? null : opening.source.value))
    },
    labels: computed(() => ({
      prev: t('home.push.card.prev'),
      next: t('home.push.card.next'),
      openingLoading: t('home.opening.loading')
    })),
    choose,
    takeLead,
    leadNote: createOpeningLeadNote(t)
  }
}
