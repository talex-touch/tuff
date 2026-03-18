<script setup lang="ts">
import type { IChatConversation, IChatInnerItem, IChatInnerItemMeta, IChatItem, IInnerItemMeta, ISendState } from '~/composables/api/base/v1/aigc/completion-types'
import EmptyGuide from '~/components/chat/EmptyGuide.vue'
import ShareSection from '~/components/chat/ShareSection.vue'
import ThChat from '~/components/chat/ThChat.vue'
import History from '~/components/history/index.vue'
import ThInput from '~/components/input/ThInput.vue'
import ModelSelector from '~/components/model/ModelSelector.vue'
import { useHotKeysHook } from '~/composables/aigc'
import { endHttp } from '~/composables/api/axios'
import { $endApi } from '~/composables/api/base'
import { $completion } from '~/composables/api/base/v1/aigc/completion'
import { IChatItemStatus, PersistStatus } from '~/composables/api/base/v1/aigc/completion-types'
import { calculateConversation } from '~/composables/api/base/v1/aigc/completion/entity'
import { $historyManager } from '~/composables/api/base/v1/aigc/history'
import { $event } from '~/composables/events'
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

interface PilotMemoryPolicy {
  enabledByDefault: boolean
  allowUserDisable: boolean
  allowUserClear: boolean
}

const memoryPolicy = reactive<PilotMemoryPolicy>({
  enabledByDefault: true,
  allowUserDisable: true,
  allowUserClear: true,
})
const memoryEnabled = ref(true)
const memoryLoading = ref(false)
const memorySubmitting = ref(false)
const memoryToggleDisabled = computed(() => memoryLoading.value || memorySubmitting.value || !memoryPolicy.allowUserDisable)
const memoryToggleDisabledTip = computed(() => {
  if (memoryLoading.value || memorySubmitting.value) {
    return '记忆系统状态同步中，请稍后再试。'
  }
  if (!memoryPolicy.allowUserDisable) {
    return '当前策略不允许用户切换记忆系统。'
  }
  return '记忆系统暂不可用。'
})

function applyMemorySettings(payload: any) {
  const data = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : payload

  const policy = data?.memoryPolicy && typeof data.memoryPolicy === 'object'
    ? data.memoryPolicy
    : {}
  memoryPolicy.enabledByDefault = policy.enabledByDefault !== false
  memoryPolicy.allowUserDisable = policy.allowUserDisable !== false
  memoryPolicy.allowUserClear = policy.allowUserClear !== false

  if (typeof data?.memoryEnabled === 'boolean') {
    memoryEnabled.value = data.memoryEnabled
    return
  }

  memoryEnabled.value = memoryPolicy.enabledByDefault
}

function extractResponseMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error || '')
  }
  const row = error as Record<string, any>
  const message = row?.message
    || row?.response?.data?.message
    || row?.data?.message
  return typeof message === 'string' ? message : ''
}

async function loadMemorySettings() {
  memoryLoading.value = true
  try {
    const res: any = await endHttp.get('v1/chat/memory/settings')
    applyMemorySettings(res)
  }
  catch {
    memoryEnabled.value = true
  }
  finally {
    memoryLoading.value = false
  }
}

async function handleMemorySwitchChange(value: unknown) {
  const nextEnabled = Boolean(value)
  if (memorySubmitting.value || memoryLoading.value) {
    return
  }
  if (!memoryPolicy.allowUserDisable) {
    memoryEnabled.value = memoryPolicy.enabledByDefault
    return
  }

  memorySubmitting.value = true
  try {
    const res: any = await endHttp.post('v1/chat/memory/settings', {
      memoryEnabled: nextEnabled,
    })
    if (Number(res?.code || 200) !== 200) {
      throw new Error(String(res?.message || '设置记忆开关失败'))
    }
    applyMemorySettings(res)
    ElMessage.success(memoryEnabled.value ? '已开启上下文记忆' : '已关闭上下文记忆')
  }
  catch (error) {
    await loadMemorySettings()
    ElMessage.error(extractResponseMessage(error) || '设置记忆开关失败')
  }
  finally {
    memorySubmitting.value = false
  }
}

function handleMemoryToggleFromInput() {
  if (memoryToggleDisabled.value) {
    ElMessage.warning(memoryToggleDisabledTip.value)
    return
  }
  void handleMemorySwitchChange(!memoryEnabled.value)
}

function resetConversationMessages(conversation: IChatConversation) {
  conversation.messages = []
  conversation.lastUpdate = Date.now()
  conversation.sync = PersistStatus.SUCCESS
}

function isConversationBusy(): boolean {
  if (pageOptions.sendState === 'sending_until_accepted') {
    return true
  }
  return pageOptions.status === IChatItemStatus.WAITING
    || pageOptions.status === IChatItemStatus.GENERATING
    || pageOptions.status === IChatItemStatus.TOOL_CALLING
    || pageOptions.status === IChatItemStatus.TOOL_RESULT
}

async function handleClearCurrentMemory() {
  if (!memoryPolicy.allowUserClear || memorySubmitting.value) {
    return
  }
  if (isConversationBusy()) {
    ElMessage.warning('当前会话仍在执行中，请稍后再清空记忆')
    return
  }

  const chatId = String(pageOptions.conversation?.id || '').trim()
  if (!chatId) {
    ElMessage.warning('当前会话不可用')
    return
  }

  await ElMessageBox.confirm(
    '将清空当前会话的上下文记忆（消息上下文与运行态记忆），是否继续？',
    '清空当前记忆',
    {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
    },
  )

  memorySubmitting.value = true
  try {
    const res: any = await endHttp.post('v1/chat/memory/clear', {
      scope: 'session',
      chatId,
    })
    if (Number(res?.code || 200) !== 200) {
      throw new Error(String(res?.message || '清空当前会话记忆失败'))
    }

    resetConversationMessages(pageOptions.conversation)
    pageOptions.status = IChatItemStatus.AVAILABLE
    pageOptions.sendState = 'idle'
    pageOptions.share.enable = false
    pageOptions.share.selected = []
    chatRef.value?.handleBackToBottom(false)

    ElMessage.success('当前会话记忆已清空')
  }
  catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }
    ElMessage.error(extractResponseMessage(error) || '清空当前会话记忆失败')
  }
  finally {
    memorySubmitting.value = false
  }
}

async function handleClearAllMemory() {
  if (!memoryPolicy.allowUserClear || memorySubmitting.value) {
    return
  }
  if (isConversationBusy()) {
    ElMessage.warning('会话仍在执行中，请稍后再清空全部记忆')
    return
  }

  await ElMessageBox.confirm(
    '将清空全部会话的上下文记忆，此操作不可撤销，是否继续？',
    '清空全部记忆',
    {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
    },
  )

  memorySubmitting.value = true
  try {
    const res: any = await endHttp.post('v1/chat/memory/clear', {
      scope: 'all',
    })
    if (Number(res?.code || 200) !== 200) {
      throw new Error(String(res?.message || '清空全部会话记忆失败'))
    }

    $historyManager.options.list.forEach((conversation: IChatConversation) => {
      resetConversationMessages(conversation)
    })
    resetConversationMessages(pageOptions.conversation)
    pageOptions.status = IChatItemStatus.AVAILABLE
    pageOptions.sendState = 'idle'
    pageOptions.share.enable = false
    pageOptions.share.selected = []
    chatRef.value?.handleBackToBottom(false)

    const clearedCount = Number(res?.data?.clearedCount || 0)
    ElMessage.success(clearedCount > 0 ? `已清空 ${clearedCount} 个会话记忆` : '已清空全部会话记忆')
  }
  catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }
    ElMessage.error(extractResponseMessage(error) || '清空全部会话记忆失败')
  }
  finally {
    memorySubmitting.value = false
  }
}

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
    await createConversation({ skipModeSelection: true })

  $historyManager.options.list.delete(id)
}

function handleSelectTemplate(data: any) {
  if (!pageOptions.conversation.template)
    pageOptions.conversation.template = data
}

watch(
  () => pageOptions.select,
  (select) => {
    if (!select)
      return

    const historyList = $historyManager.options.list

    const conversation = historyList.get(select)
    if (!conversation) {
      // pageOptions.select = ''
      return
    }

    setTimeout(async () => {
      router.replace({
        query: {
          ...route.query,
          id: select,
        },
      })

      pageOptions.conversation = conversation

      // get last msg
      if (conversation?.messages.length) {
        const lastMsg = conversation.messages.at(-1)

        const content = lastMsg?.content[lastMsg.page]
        const runtimeState = String((conversation as any)?.runtimeState || '').trim().toLowerCase()

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
      }
      else {
        pageOptions.status = IChatItemStatus.AVAILABLE
      }

      pageOptions.share.enable = false
      pageOptions.share.selected = []
      chatRef.value?.handleBackToBottom(false)

      if (document.body.classList.contains('mobile'))
        expand.value = false
    }, 200)
  },
  { deep: true },
)

interface CreateConversationOptions {
  skipModeSelection?: boolean
}

async function resolvePilotModeSelection(skipModeSelection = false): Promise<boolean | null> {
  if (skipModeSelection) {
    return false
  }
  try {
    await ElMessageBox.confirm(
      '启用 Pilot 模式后，该会话将优先走 Graph 编排；当 Graph 不可用时会自动回退到 DeepAgent。是否启用？',
      '新建会话模式',
      {
        type: 'info',
        distinguishCancelAndClose: true,
        confirmButtonText: '启用 Pilot 模式',
        cancelButtonText: '普通模式',
      },
    )
    return true
  }
  catch (error) {
    if (error === 'cancel') {
      return false
    }
    if (error === 'close') {
      return null
    }
    throw error
  }
}

async function createConversation(options: CreateConversationOptions = {}) {
  const selectedPilotMode = await resolvePilotModeSelection(options.skipModeSelection === true)
  if (selectedPilotMode === null) {
    return false
  }

  if (!pageOptions.conversation.messages.length) {
    pageOptions.conversation.pilotMode = selectedPilotMode
    pageOptions.conversation.lastUpdate = Date.now()
    return true
  }

  const conversation = $completion.emptyHistory()
  conversation.pilotMode = selectedPilotMode

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
    async onReqCompleted() {
      pageOptions.sendState = 'idle'
      flushStreamScroll('stream')
      chatRef.value?.generateScroll('final')

      await $historyManager.syncHistory(conversation)

      useVibrate('medium')

      setTimeout(() => {
        chatRef.value?.generateScroll('final')
      }, 200)
    },
    onFrequentLimit() {
      // chatManager.cancelCurrentReq()
    },
    onError() {
      pageOptions.sendState = 'idle'
    },
  })

  useVibrate('light')

  return chatCompletion
}

async function handleSync() {
  await $historyManager.syncHistory(pageOptions.conversation)
}

// 重新生成某条消息 只需要给消息索引即可 还需要传入目标inner 如果有新的参数赋值则传options替换
async function handleRetry(index: number, page: number, innerItem: IChatInnerItem) {
  const conversation = pageOptions.conversation

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
  const conversation = pageOptions.conversation
  const resolvedMeta: IChatInnerItemMeta = {
    ...meta,
    memoryEnabled: memoryEnabled.value,
  }

  if (!$historyManager.options.list.get(conversation.id))
    $historyManager.options.list.set(conversation.id, conversation)

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

  // console.log('hs', shiftItem, conversation, innerItem)

  const completion = await innerSend(conversation, chatItem, chatItem.page)

  completion.innerMsg.model = globalConfigModel.value

  pageOptions.sendState = 'sending_until_accepted'
  curController = completion.send()

  chatRef.value?.handleBackToBottom()
}

function handleSuggest(suggestion: string) {
  handleSend([$completion.initInnerMeta('text', suggestion)], {})
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

async function mounter() {
  await ensureRuntimeModelsLoaded()
  await loadMemorySettings()
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

  if (userStore.value.isAdmin) {
    window.$chat = {
      pageOptions,
    }
  }

  if (route.query.id)
    expand.value = true

  onUnmounted(() => {
    clearStreamScrollTimer()
    streamScrollPending = false
    eventScope.endScope()
    hotKeyScope()
  })
}
onActivated(mounter)
onMounted(mounter)

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

          <ModelSelector v-if="mount" v-model="globalConfigModel" />

          <el-tag class="pilot-mode-tag" size="small" effect="plain" :type="pageOptions.conversation.pilotMode ? 'success' : 'info'">
            {{ pageOptions.conversation.pilotMode ? 'Pilot 模式' : '普通模式' }}
          </el-tag>

          <div class="memory-tools">
            <el-switch
              :model-value="memoryEnabled"
              :disabled="memoryLoading || memorySubmitting || !memoryPolicy.allowUserDisable"
              size="small"
              inline-prompt
              active-text="记忆开"
              inactive-text="记忆关"
              @change="handleMemorySwitchChange"
            />
            <el-button
              text
              size="small"
              :disabled="memorySubmitting || !memoryPolicy.allowUserClear"
              @click="handleClearCurrentMemory"
            >
              清空当前
            </el-button>
            <el-button
              text
              size="small"
              :disabled="memorySubmitting || !memoryPolicy.allowUserClear"
              @click="handleClearAllMemory"
            >
              清空全部
            </el-button>
          </div>

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
            :memory-enabled="memoryEnabled"
            :memory-toggle-disabled="memoryToggleDisabled"
            :memory-disabled-tip="memoryToggleDisabledTip"
            :hide="pageOptions.share.enable" :center="pageOptions.conversation.messages?.length < 1" :tip="tip"
            @send="handleSend" @select-template="handleSelectTemplate" @toggle-memory="handleMemoryToggleFromInput"
          />
        </template>
      </EmptyGuide>

      <AigcChatStatusBar>
        <template #start>
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

.memory-tools {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
}

.pilot-mode-tag {
  margin-left: 0.5rem;
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
