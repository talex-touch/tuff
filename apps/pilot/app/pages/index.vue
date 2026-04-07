<script setup lang="ts">
import type { IChatConversation, IChatInnerItem, IChatInnerItemMeta, IChatItem, IInnerItemMeta, ISendState } from '~/composables/api/base/v1/aigc/completion-types'
import EmptyGuide from '~/components/chat/EmptyGuide.vue'
import ShareSection from '~/components/chat/ShareSection.vue'
import ThChat from '~/components/chat/ThChat.vue'
import History from '~/components/history/index.vue'
import ThInput from '~/components/input/ThInput.vue'
import ModelSelector from '~/components/model/ModelSelector.vue'
import { useHotKeysHook } from '~/composables/aigc'
import { $endApi } from '~/composables/api/base'
import { $completion } from '~/composables/api/base/v1/aigc/completion'
import { IChatItemStatus, PersistStatus } from '~/composables/api/base/v1/aigc/completion-types'
import { calculateConversation } from '~/composables/api/base/v1/aigc/completion/entity'
import { $historyManager, IHistoryStatus } from '~/composables/api/base/v1/aigc/history'
import { $event } from '~/composables/events'
import { usePilotMemorySettings } from '~/composables/usePilotMemorySettings'
import { usePilotRuntimeModels } from '~/composables/usePilotRuntimeModels'
import { globalConfigModel } from '~/composables/user'
import '~/composables/index.d.ts'

definePageMeta({
  layout: 'default',
  scope: 'chat',
})

const chatRef = ref()
const route = useRoute()
const router = useRouter()
const {
  ensureLoaded: ensureRuntimeModelsLoaded,
  defaultModelId,
  findModel,
} = usePilotRuntimeModels()
const viewMode = computed(() => route.query?.share)
const STREAM_SCROLL_THROTTLE_MS = 120
const initConversation = $completion.emptyHistory()
const pageOptions = reactive<{
  select: string
  conversation: IChatConversation
  share: any
  status: IChatItemStatus
  sendState: ISendState
  feedback: any
  view: any
}>({
  feedback: {
    visible: false,
  },
  select: '',
  conversation: initConversation,
  share: {
    enable: false,
    selected: new Array<number>(),
    getMessages() {
      const msgList = ref(pageOptions.conversation.messages)

      const res = calculateConversation(msgList)

      return [res.filter((_, index) => pageOptions.share.selected.includes(index)), pageOptions.conversation.topic]
    },
  },
  view: null,
  status: IChatItemStatus.AVAILABLE,
  sendState: 'idle',
})
const pilotModeLabel = computed(() => pageOptions.conversation.pilotMode === true ? 'PILOT' : '普通模式')
const pilotModeTagClass = computed(() => pageOptions.conversation.pilotMode === true ? 'pilot' : 'normal')
const {
  memoryEnabled,
  loadMemorySettings,
} = usePilotMemorySettings()

const DEFAULT_CONVERSATION_TOPIC = '新的聊天'

const expand = computed({
  set(val: boolean) {
    userConfig.value.pri_info.appearance.expand = val
  },
  get() {
    if (viewMode.value)
      return false

    return userConfig.value.pri_info.appearance.expand
  },
})

const historyReady = ref(false)
const routeResolvePending = ref(false)
const selectionLoading = ref(false)
let selectionToken = 0
let mountedFinished = false
let mounterPromise: Promise<void> | null = null
let scopedEventCleanup: (() => void) | null = null

const conversationReady = computed(() => {
  if (viewMode.value) {
    return true
  }
  if (!historyReady.value || routeResolvePending.value || selectionLoading.value) {
    return false
  }
  const currentConversationId = String(pageOptions.conversation?.id || '').trim()
  if (!currentConversationId) {
    return false
  }
  if (!pageOptions.select) {
    return true
  }
  if ($historyManager.options.list.size <= 0) {
    return true
  }
  return $historyManager.options.list.has(pageOptions.select)
})

function isSummaryConversation(conversation: IChatConversation | undefined): boolean {
  return Boolean((conversation as any)?.__summaryOnly)
}

async function ensureConversationHydrated(conversation: IChatConversation): Promise<IChatConversation | null> {
  if (!isSummaryConversation(conversation)) {
    return conversation
  }

  const synced = await $historyManager.syncHistory(conversation).catch(() => false)
  if (!synced) {
    return null
  }

  const refreshed = $historyManager.options.list.get(conversation.id)
  if (!refreshed) {
    return null
  }
  ;(refreshed as any).__summaryOnly = false
  ;(refreshed as any).__hydrated = true
  return refreshed
}

function applyConversationStatus(conversation: IChatConversation) {
  const runtimeState = String((conversation as any)?.runtimeState || '').trim().toLowerCase()

  if (!conversation?.messages.length) {
    pageOptions.status = IChatItemStatus.AVAILABLE
    return runtimeState
  }

  const lastMsg = conversation.messages.at(-1)
  const content = lastMsg?.content[lastMsg.page]

  globalConfigModel.value = content?.model || defaultModelId.value
  if (!findModel(globalConfigModel.value)) {
    globalConfigModel.value = defaultModelId.value
  }
  if (runtimeState === 'queued')
    pageOptions.status = IChatItemStatus.WAITING
  else if (runtimeState === 'executing' || runtimeState === 'title')
    pageOptions.status = IChatItemStatus.GENERATING
  else
    pageOptions.status = content?.status || IChatItemStatus.AVAILABLE

  return runtimeState
}

async function handleDelete(id: string) {
  const res: any = await $endApi.v1.aigc.deleteConversation(id)
  if (res.code !== 200) {
    return ElMessage({
      message: `删除失败(${res.message})！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
  }

  if (id === pageOptions.select)
    await createConversation()

  $historyManager.options.list.delete(id)
}

function handleSelectTemplate(data: any) {
  if (!pageOptions.conversation.template)
    pageOptions.conversation.template = data
}

watch(
  () => pageOptions.select,
  async (select) => {
    if (!select)
      return

    const currentToken = ++selectionToken
    selectionLoading.value = true

    let conversation = $historyManager.options.list.get(select)
    if (!conversation) {
      if (currentToken === selectionToken) {
        selectionLoading.value = false
      }
      return
    }

    try {
      const hydratedConversation = await ensureConversationHydrated(conversation)
      if (!hydratedConversation) {
        ElMessage.warning('会话加载失败，请稍后重试。')
        return
      }
      conversation = hydratedConversation
      if (currentToken !== selectionToken) {
        return
      }

      if (String(route.query.id || '').trim() !== select) {
        void router.replace({
          query: {
            ...route.query,
            id: select,
          },
        })
      }

      pageOptions.conversation = conversation
      const runtimeState = applyConversationStatus(conversation)
      pageOptions.share.enable = false
      pageOptions.share.selected = []
      chatRef.value?.handleBackToBottom(false)

      if (runtimeState === 'executing' || runtimeState === 'planning') {
        void resumeConversationStreamIfNeeded(conversation)
      }

      if (document.body.classList.contains('mobile'))
        expand.value = false
    }
    finally {
      if (currentToken === selectionToken) {
        selectionLoading.value = false
      }
    }
  },
)

async function createConversation() {
  if (!pageOptions.conversation.messages.length) {
    pageOptions.conversation.pilotMode = false
    pageOptions.conversation.lastUpdate = Date.now()
    return true
  }

  const conversation = $completion.emptyHistory()
  conversation.pilotMode = false

  $historyManager.options.list.set(conversation.id, conversation)

  Object.assign(pageOptions, {
    conversation,
    select: conversation.id,
  })

  pageOptions.share.enable = false

  useVibrate('medium')

  return true
}

async function handleCreate() {
  return createConversation()
}

let curController: AbortController | null = null
let streamScrollTimer: ReturnType<typeof setTimeout> | null = null
let streamScrollPending = false

function clearStreamScrollTimer() {
  if (!streamScrollTimer) {
    return
  }
  clearTimeout(streamScrollTimer)
  streamScrollTimer = null
}

function flushStreamScroll(mode: 'stream' | 'final' = 'stream') {
  clearStreamScrollTimer()
  if (mode === 'stream' && !streamScrollPending) {
    return
  }
  streamScrollPending = false
  chatRef.value?.generateScroll(mode)
}

function scheduleStreamScroll() {
  streamScrollPending = true
  if (streamScrollTimer) {
    return
  }
  streamScrollTimer = setTimeout(() => {
    streamScrollTimer = null
    flushStreamScroll('stream')
  }, STREAM_SCROLL_THROTTLE_MS)
}

function resolveConversationSyncStatus(status: IChatItemStatus) {
  if (
    status === IChatItemStatus.ERROR
    || status === IChatItemStatus.BANNED
    || status === IChatItemStatus.REJECTED
  ) {
    return PersistStatus.FAILED
  }

  return PersistStatus.SUCCESS
}

function saveConversationLocalSnapshot(conversation: IChatConversation, syncStatus: PersistStatus = PersistStatus.SUCCESS) {
  if (!conversation?.id?.length) {
    return
  }

  conversation.lastUpdate = Date.now()
  conversation.sync = syncStatus
  $historyManager.options.list.set(conversation.id, conversation)
}

function normalizeTopicText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function toTopicPreview(value: unknown): string {
  const normalized = normalizeTopicText(value)
  if (!normalized) {
    return ''
  }
  return normalized.slice(0, 24)
}

function resolveTopicFromQuery(query: IInnerItemMeta[]): string {
  if (!Array.isArray(query) || query.length <= 0) {
    return ''
  }
  const merged = query
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }
      if (item.type !== 'text' && item.type !== 'markdown') {
        return ''
      }
      return String(item.value || '')
    })
    .join(' ')
  return toTopicPreview(merged)
}

function applyInitialTopicIfNeeded(conversation: IChatConversation, topic: string) {
  if (!topic) {
    return
  }
  const current = normalizeTopicText(conversation.topic)
  if (!current || current === DEFAULT_CONVERSATION_TOPIC) {
    conversation.topic = topic
  }
}

function syncConversationRoute(conversationId: string) {
  if (!conversationId) {
    return
  }
  const currentRouteId = String(route.query.id || '').trim()
  if (currentRouteId === conversationId) {
    return
  }
  if (import.meta.client) {
    const url = new URL(window.location.href)
    url.searchParams.set('id', conversationId)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  void router.replace({
    query: {
      ...route.query,
      id: conversationId,
    },
  })
}

function resolveConversationSeqCursor(conversation: IChatConversation): number {
  let maxSeq = 0
  for (const message of conversation.messages || []) {
    if (!message || !Array.isArray(message.content)) {
      continue
    }
    for (const inner of message.content) {
      if (!inner || !Array.isArray(inner.value)) {
        continue
      }
      for (const block of inner.value) {
        if (!block || typeof block !== 'object') {
          continue
        }
        const blockRow = block as IInnerItemMeta
        const extra = blockRow.extra && typeof blockRow.extra === 'object'
          ? blockRow.extra as Record<string, unknown>
          : {}
        const extraSeq = Number(extra.seq)
        if (Number.isFinite(extraSeq) && extraSeq > maxSeq) {
          maxSeq = Math.floor(extraSeq)
        }
        if (blockRow.type !== 'card') {
          continue
        }
        const parsed = decodeObject(String(blockRow.data || ''))
        const cardSeq = Number((parsed as Record<string, unknown>)?.seq)
        if (Number.isFinite(cardSeq) && cardSeq > maxSeq) {
          maxSeq = Math.floor(cardSeq)
        }
      }
    }
  }
  return Math.max(0, maxSeq)
}

async function innerSend(conversation: IChatConversation, chatItem: IChatItem, index: number) {
  // 判断如果 conversation 是2条消息
  if (userConfig.value.pri_info.appearance.immersive && conversation.messages.length <= 2)
    userConfig.value.pri_info.appearance.expand = false

  conversation.sync = PersistStatus.PENDING

  const chatCompletion = $completion.createCompletion(conversation, chatItem, index)

  chatCompletion.registerHandler({
    onAccepted() {
      pageOptions.sendState = 'idle'
    },
    onCompletion: () => {
      scheduleStreamScroll()

      return true
    },
    onTriggerStatus(status) {
      pageOptions.status = status
      if (pageOptions.sendState === 'sending_until_accepted' && status !== IChatItemStatus.WAITING)
        pageOptions.sendState = 'idle'

      if (
        status === IChatItemStatus.GENERATING
        || status === IChatItemStatus.WAITING
        || status === IChatItemStatus.TOOL_CALLING
        || status === IChatItemStatus.TOOL_RESULT
      ) {
        scheduleStreamScroll()
        return
      }

      flushStreamScroll('final')
    },
    onReqCompleted() {
      pageOptions.sendState = 'idle'
      flushStreamScroll('stream')
      chatRef.value?.generateScroll('final')

      saveConversationLocalSnapshot(
        conversation,
        resolveConversationSyncStatus(pageOptions.status),
      )

      useVibrate('medium')

      setTimeout(() => {
        chatRef.value?.generateScroll('final')
      }, 200)
    },
    onReqCheckpoint(reason) {
      if (reason !== 'approval_required') {
        return
      }
      pageOptions.sendState = 'idle'
      saveConversationLocalSnapshot(
        conversation,
        PersistStatus.SUCCESS,
      )
    },
    onFrequentLimit() {
      // chatManager.cancelCurrentReq()
    },
    onError() {
      pageOptions.sendState = 'idle'
      saveConversationLocalSnapshot(conversation, PersistStatus.FAILED)
    },
  })

  useVibrate('light')

  return chatCompletion
}

const autoResumeSessionInFlight = new Set<string>()

async function resumeConversationStreamIfNeeded(conversation: IChatConversation) {
  if (!conversation?.id) {
    return
  }
  const runtimeState = String((conversation as any).runtimeState || '').trim().toLowerCase()
  if (runtimeState !== 'executing' && runtimeState !== 'planning') {
    return
  }
  if (curController || pageOptions.sendState !== 'idle') {
    return
  }
  if (autoResumeSessionInFlight.has(conversation.id)) {
    return
  }

  let targetConversation = conversation
  let lastMessage = targetConversation.messages.at(-1)
  if (!lastMessage) {
    const synced = await $historyManager.syncHistory(targetConversation).catch(() => false)
    if (synced) {
      const refreshed = $historyManager.options.list.get(targetConversation.id)
      if (refreshed) {
        targetConversation = refreshed
        pageOptions.conversation = refreshed
        const refreshedRuntimeState = String((refreshed as any).runtimeState || '').trim().toLowerCase()
        if (refreshedRuntimeState !== 'executing' && refreshedRuntimeState !== 'planning') {
          return
        }
        lastMessage = refreshed.messages.at(-1)
      }
    }
  }

  if (!lastMessage) {
    return
  }

  autoResumeSessionInFlight.add(targetConversation.id)
  try {
    const targetPage = Number.isFinite(Number(lastMessage.page))
      ? Math.max(0, Math.floor(Number(lastMessage.page)))
      : 0
    const completion = await innerSend(targetConversation, lastMessage, targetPage)
    pageOptions.sendState = 'sending_until_accepted'
    const fromSeq = Math.max(1, resolveConversationSeqCursor(targetConversation) + 1)
    curController = completion.send({
      fromSeq,
      follow: true,
    })
  }
  finally {
    autoResumeSessionInFlight.delete(targetConversation.id)
  }
}

function handleSync() {
  saveConversationLocalSnapshot(pageOptions.conversation, PersistStatus.SUCCESS)
}

// 重新生成某条消息 只需要给消息索引即可 还需要传入目标inner 如果有新的参数赋值则传options替换
async function handleRetry(index: number, page: number, innerItem: IChatInnerItem) {
  const conversation = pageOptions.conversation
  pageOptions.select = conversation.id
  syncConversationRoute(conversation.id)
  saveConversationLocalSnapshot(conversation, PersistStatus.PENDING)

  const chatItem = conversation.messages[index]
  if (!chatItem) {
    console.warn('[index] retry target missing', { index, total: conversation.messages.length })
    return
  }

  const nextPage = Number.isFinite(page) ? Number(page) : ((typeof chatItem.page === 'number' ? chatItem.page : 0) + 1)
  const _innerItem = $completion.emptyChatInnerItem({
    model: innerItem.model,
    value: [],
    meta: {
      ...innerItem.meta,
      memoryEnabled: memoryEnabled.value,
    },
    timestamp: Date.now(),
    page: nextPage,
    status: IChatItemStatus.AVAILABLE,
  })

  chatItem.content.push(_innerItem)

  const completion = await innerSend(conversation, chatItem, nextPage)

  pageOptions.sendState = 'sending_until_accepted'
  curController = completion.send()

  globalConfigModel.value = innerItem.model

  chatRef.value?.handleBackToBottom()
}

async function handleSend(query: IInnerItemMeta[], meta: IChatInnerItemMeta) {
  if (!conversationReady.value) {
    ElMessage.warning('会话正在加载中，请稍后再发送。')
    return
  }

  const conversation = pageOptions.conversation
  applyInitialTopicIfNeeded(conversation, resolveTopicFromQuery(query))
  const resolvedPilotMode = typeof meta.pilotMode === 'boolean'
    ? meta.pilotMode
    : conversation.pilotMode === true
  const resolvedMeta: IChatInnerItemMeta = {
    ...meta,
    memoryEnabled: memoryEnabled.value,
    pilotMode: resolvedPilotMode,
  }
  conversation.pilotMode = resolvedPilotMode

  if (!$historyManager.options.list.get(conversation.id))
    $historyManager.options.list.set(conversation.id, conversation)
  pageOptions.select = conversation.id
  syncConversationRoute(conversation.id)

  const messages = ref(conversation.messages)
  messages.value = calculateConversation(messages)

  const shiftItem = messages.value.at(-1)

  // console.log('shiftItem', shiftItem, shiftItem?.page)

  function getModel() {
    if (!shiftItem)
      return findModel(globalConfigModel.value) ? globalConfigModel.value : defaultModelId.value

    const inner = shiftItem.content[shiftItem.page]
    const modelId = String(inner?.model || globalConfigModel.value || '').trim()
    return findModel(modelId) ? modelId : defaultModelId.value
  }

  const chatItem = $completion.emptyChatItem()
  const innerItem = $completion.emptyChatInnerItem({
    model: getModel(),
    value: query,
    meta: resolvedMeta,
    page: shiftItem?.page || 0,
    timestamp: Date.now(),
    status: IChatItemStatus.AVAILABLE,
  })

  chatItem.page = innerItem.page
  chatItem.content.push(innerItem)
  conversation.messages.push(chatItem)
  saveConversationLocalSnapshot(conversation, PersistStatus.PENDING)

  // console.log('hs', shiftItem, conversation, innerItem)

  const completion = await innerSend(conversation, chatItem, chatItem.page)

  completion.innerMsg.model = globalConfigModel.value

  pageOptions.sendState = 'sending_until_accepted'
  curController = completion.send()

  chatRef.value?.handleBackToBottom()
}

function handleSuggest(suggestion: string) {
  void handleSend([$completion.initInnerMeta('text', suggestion)], {})
}

provide('pageOptions', pageOptions)

function handleShare() {
  pageOptions.share.selected.length = 0
  pageOptions.share.enable = !pageOptions.share.enable
}

function handleCancelReq() {
  clearStreamScrollTimer()
  streamScrollPending = false
  pageOptions.sendState = 'idle'
  if (curController)
    curController.abort()
}

const mount = ref(false)

function ensureScopedEventsRegistered() {
  if (scopedEventCleanup || viewMode.value) {
    return
  }

  const eventScope = $event.startScope()
  const hotKeyScope = useHotKeysHook()

  eventScope.on('REQUEST_TOGGLE_SIDEBAR', (visible?: boolean) => {
    expand.value = visible !== undefined ? visible : !expand.value
  })
  eventScope.on('USER_LOGOUT_SUCCESS', () => {
    pageOptions.conversation = $completion.emptyHistory()
  })
  eventScope.on('REQUEST_CREATE_NEW_CONVERSATION', () => {
    void handleCreate()
  })
  eventScope.on('REQUEST_SAVE_CURRENT_CONVERSATION', handleSync)

  scopedEventCleanup = () => {
    eventScope.endScope()
    hotKeyScope()
    scopedEventCleanup = null
  }
}

async function mounter() {
  if (mountedFinished) {
    return
  }
  if (mounterPromise) {
    await mounterPromise
    return
  }

  mounterPromise = (async () => {
    historyReady.value = false
    routeResolvePending.value = false
    await ensureRuntimeModelsLoaded()
    await loadMemorySettings()
    if ($historyManager.options.status === IHistoryStatus.DONE && $historyManager.options.list.size <= 0) {
      await $historyManager.loadHistories().catch(() => {})
    }
    if (!findModel(globalConfigModel.value)) {
      globalConfigModel.value = defaultModelId.value
    }

    setTimeout(() => {
      mount.value = true
    }, 200)

    if (viewMode.value) {
      const res = await $endApi.v1.aigc.getShareMessage(route.query.share as string)
      const chat = pageOptions.view = res.data
      const conversation = decodeObject(chat.value)
      pageOptions.conversation = conversation
      historyReady.value = true
      mountedFinished = true
      return
    }

    ensureScopedEventsRegistered()

    if (userStore.value.isAdmin) {
      window.$chat = {
        pageOptions,
      }
    }

    const routeConversationId = String(route.query.id || '').trim()
    if (routeConversationId) {
      routeResolvePending.value = true
      try {
        if (!$historyManager.options.list.get(routeConversationId)) {
          const probe = $completion.emptyHistory()
          probe.id = routeConversationId
          probe.topic = DEFAULT_CONVERSATION_TOPIC
          probe.messages = []
          await $historyManager.syncHistory(probe).catch(() => false)
        }
        if ($historyManager.options.list.get(routeConversationId)) {
          pageOptions.select = routeConversationId
        }
        else {
          ElMessage.warning('目标会话不存在或加载失败，请手动选择历史会话。')
        }
      }
      finally {
        routeResolvePending.value = false
      }
    }
    else {
      routeResolvePending.value = false
    }

    if (!routeConversationId && !pageOptions.select && $historyManager.options.list.size > 0) {
      const latest = [...$historyManager.options.list.values()]
        .sort((left, right) => Number(right.lastUpdate || 0) - Number(left.lastUpdate || 0))
        .at(0)
      if (latest?.id) {
        pageOptions.select = latest.id
      }
    }

    if (route.query.id)
      expand.value = true

    historyReady.value = true
    mountedFinished = true
  })()
    .finally(() => {
      mounterPromise = null
    })

  await mounterPromise
}

function handleMountLifecycle() {
  void mounter().catch((error) => {
    const message = error instanceof Error ? error.message : '初始化失败'
    ElMessage.error(message)
  })
}
onActivated(handleMountLifecycle)
onMounted(handleMountLifecycle)

onUnmounted(() => {
  clearStreamScrollTimer()
  streamScrollPending = false
  selectionToken += 1
  scopedEventCleanup?.()
  scopedEventCleanup = null
})

const appOptions: any = inject('appOptions')!
function handleLogin() {
  appOptions.model.login = true
}
</script>

<template>
  <div :class="{ expand, empty: !pageOptions.conversation?.messages.length, view: viewMode }" class="PageContainer">
    <History
      v-if="!viewMode" v-model:select="pageOptions.select" class="PageContainer-History" @create="handleCreate"
      @delete="handleDelete"
    />

    <div class="PageContainer-Main">
      <div v-if="viewMode" class="ViewModeBar">
        <div class="ViewModeBar-User">
          <PersonalUserAvatar :avatar="pageOptions.view?.user?.avatar" />
          <span class="name">{{ pageOptions.view?.user?.nickname }}分享</span>
        </div>

        <div class="ViewModeBar-Addon">
          <el-button>举报内容</el-button>
          <el-button>使用条款</el-button>
          <el-button>隐私政策</el-button>
        </div>
      </div>

      <ThChat
        ref="chatRef" v-model:messages="pageOptions.conversation" :status="pageOptions.status"
        @cancel="handleCancelReq" @retry="handleRetry" @suggest="handleSuggest"
      >
        <template v-if="!viewMode" #model>
          <ModelSelector v-if="mount" v-model="globalConfigModel" />
        </template>
        <template v-if="!viewMode" #header>
          <CheckboxSwanCheckBox v-model="expand" />
          <!-- <div i-carbon:text-short-paragraph @click="userConfig.pri_info.appearance.expand = true" /> -->

          <span class="pilot-top-badge" :class="pilotModeTagClass">{{ pilotModeLabel }}</span>

          <ModelSelector v-if="mount" v-model="globalConfigModel" />

          <div v-if="userStore.isLogin" style="font-size: 16px" i-carbon:edit @click="handleCreate" />
          <div v-else class="login-tag" @click="handleLogin">
            登录
          </div>
        </template>
      </ThChat>

      <EmptyGuide v-if="!viewMode" :show="!!pageOptions.conversation?.messages.length">
        <template #default="{ tip }">
          <ThInput
            :template-enable="!pageOptions.conversation.messages.length" :status="pageOptions.status"
            :send-state="pageOptions.sendState"
            :session-id="pageOptions.conversation.id"
            :pilot-mode-default="pageOptions.conversation.pilotMode === true"
            :hide="pageOptions.share.enable" :center="pageOptions.conversation.messages?.length < 1" :tip="tip"
            @send="handleSend" @select-template="handleSelectTemplate"
          />
        </template>
      </EmptyGuide>

      <AigcChatStatusBar>
        <template #start>
          <span v-if="!viewMode" class="tag" :class="pilotModeTagClass">
            {{ pilotModeLabel }}
          </span>

          <span v-if="!viewMode && !userStore.isLogin" class="tag warning shining">
            访客模式（部分功能受限）
          </span>

          <!-- <span v-if="pageOptions.inputProperty.internet" class="tag success">
            联网模式
          </span>
          <span v-else class="tag warning">
            离线模式
          </span> -->

          <span
            v-if="!viewMode && !!pageOptions.conversation?.messages.length"
            :class="pageOptions.share.enable ? 'warning shining' : ''" cursor-pointer class="tag" @click="handleShare"
          >
            <i i-carbon:share />分享对话
          </span>

          <span class="tag"> <i i-carbon:time />0 mins </span>
        </template>
        <template #end>
          <ChatHeadTrSyncStatus
            v-if="!!pageOptions.conversation?.messages.length"
            :status="pageOptions.conversation.sync" @upload="handleSync"
          />
        </template>
      </AigcChatStatusBar>

      <ShareSection
        v-if="pageOptions.conversation" :length="pageOptions.conversation?.messages.length"
        :show="pageOptions.share.enable" :selected="pageOptions.share.selected"
      />

      <!-- 根据 发送消息超过10次 控制弹窗的显示 -->
      <FeedBack v-if="!viewMode" v-model:show="pageOptions.feedback.visible" />

      <ChatAddonBrandSupporter />
    </div>
  </div>
</template>

<style lang="scss">
.login-tag {
  padding: 0.02rem 0.75rem;

  font-size: 12px;

  border-radius: 12px;
  background-color: var(--el-bg-color-page);
}

.pilot-top-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.08rem 0.55rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #115e59, #164e63);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tag.pilot {
  color: #ecfeff;
  background: linear-gradient(135deg, #115e59, #164e63);
}

.pilot-top-badge.normal,
.tag.normal {
  color: #e2e8f0;
  background: linear-gradient(135deg, #334155, #475569);
}

.ViewModeBar {
  &-Addon {
    position: absolute;
    display: flex;

    top: 70px;

    width: 100%;

    justify-content: center;
  }

  &:hover {
    width: 380px;
    height: 120px;
  }

  &-User {
    gap: 0.5rem;

    display: flex;
    align-items: center;
    justify-content: center;
  }

  z-index: 3;
  position: absolute;

  padding: 0.5rem 1rem;

  top: 1rem;
  left: 50%;

  width: 165px;
  height: 56px;

  transform: translateX(-50%);

  overflow: hidden;
  border-radius: 18px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color-page);
  transition: 0.25s;

  .name {
    font-size: 14px;
    font-weight: 600;
  }
}

.view-none-display {
  .view & {
    display: none !important;
  }
}

// .ModelSelector {
//   z-index: 10;
//   position: absolute;

//   top: 0.5rem;
//   right: 0.5rem;
// }

.PageContainer {
  &::before {
    z-index: -2;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    filter: blur(58px) saturate(180%);
    transition: 0.35s;
    transform: scale(1.05);
    background-size: cover;
    animation: wallpaperEnter 0.35s ease-out;
    background-image: var(--wallpaper);
  }

  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    transition: 0.35s;
    // filter: blur(18px);
    background-color: var(--el-bg-color);
  }

  &.empty {
    &::before {
      opacity: 0.75;

      filter: blur(0px) saturate(100%);
    }

    &::after {
      opacity: 0;
    }
  }

  &-Main {
    .mobile .expand & {
      left: calc(100% - 48px);

      background-color: var(--el-overlay-color);
      transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
    }

    // z-index: 2;
    position: relative;

    left: 0;

    // flex: 1;
    width: 100%;
    max-width: 100%;
    height: 100%;

    overflow: hidden;

    transition: 0.75s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }

  &-History {
    &::before {
      z-index: -2;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.5;
      filter: blur(18px);
      background-size: cover;
      background-image: var(--wallpaper);
    }

    &::after {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.75;
      // filter: blur(18px);
      background-color: var(--el-bg-color-page);
    }

    flex-shrink: 0;
  }

  position: absolute;
  display: flex;

  width: 100%;
  height: 100%;

  top: 0;
  left: 0;

  overflow: hidden;

  // background-color: red;
}

@keyframes wallpaperEnter {
  from {
    transform: scale(1.125);
  }

  to {
    transform: scale(1.05);
  }
}
</style>
