<script setup lang="ts">
import ThChat from '~/components/chat/ThChat.vue'
import ThInput from '~/components/input/ThInput.vue'
import History from '~/components/history/index.vue'
import ShareSection from '~/components/chat/ShareSection.vue'
import ModelSelector from '~/components/model/ModelSelector.vue'
import { getTargetPrompt } from '~/composables/api/chat'
import { $completion } from '~/composables/api/base/v1/aigc/completion'
import { type IChatConversation, type IChatInnerItem, type IChatInnerItemMeta, type IChatItem, IChatItemStatus, type IInnerItemMeta, PersistStatus, QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'
import { $historyManager } from '~/composables/api/base/v1/aigc/history'
import { $endApi } from '~/composables/api/base'
import { $event } from '~/composables/events'
import EmptyGuide from '~/components/chat/EmptyGuide.vue'
import { useHotKeysHook } from '~/composables/aigc'
import { calculateConversation } from '~/composables/api/base/v1/aigc/completion/entity'
import '~/composables/index.d.ts'
import { globalConfigModel } from '~/composables/user'

definePageMeta({
  layout: 'default',
  scope: 'chat',
})

const chatRef = ref()
const route = useRoute()
const router = useRouter()
const viewMode = computed(() => route.query?.share)
const initConversation = $completion.emptyHistory()
const pageOptions = reactive<{
  select: string
  conversation: IChatConversation
  share: any
  status: IChatItemStatus
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
})

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
    handleCreate()

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

        globalConfigModel.value = content?.model || QuotaModel.QUOTA_THIS_NORMAL
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

function handleCreate() {
  if (!pageOptions.conversation.messages.length)
    return

  const conversation = $completion.emptyHistory()

  $historyManager.options.list.set(conversation.id, conversation)

  Object.assign(pageOptions, {
    conversation,
    select: conversation.id,
  })

  pageOptions.share.enable = false

  useVibrate('medium')

  return true
}

let curController: AbortController | null = null

async function innerSend(conversation: IChatConversation, chatItem: IChatItem, index: number) {
  // 判断如果 conversation 是2条消息
  if (userConfig.value.pri_info.appearance.immersive && conversation.messages.length <= 2)
    userConfig.value.pri_info.appearance.expand = false

  conversation.sync = PersistStatus.MODIFIED

  const chatCompletion = $completion.createCompletion(conversation, chatItem, index)

  chatCompletion.registerHandler({
    onCompletion: () => {
      chatRef.value?.generateScroll()

      return true
    },
    onTriggerStatus(status) {
      pageOptions.status = status

      chatRef.value?.generateScroll()
    },
    async onReqCompleted() {
      // 判断如果是第一条消息那么就要生成title
      if (conversation.messages.length === 2) {
        const shiftItem = [...conversation.messages].shift()
        if (shiftItem?.content.length === 1)
          await chatCompletion.getTitle()
      }
      // await genTitle(pageOptions.select)

      chatRef.value?.generateScroll()

      await $historyManager.syncHistory(conversation)

      setTimeout(() => chatRef.value?.generateScroll(), 800)

      useVibrate('medium')

      setTimeout(() => {
        chatRef.value?.generateScroll()
      }, 200)
    },
    onFrequentLimit() {
      // chatManager.cancelCurrentReq()
    },
  })

  useVibrate('light')

  return chatCompletion
}

function handleSync() {
  $historyManager.syncHistory(pageOptions.conversation)
}

// 重新生成某条消息 只需要给消息索引即可 还需要传入目标inner 如果有新的参数赋值则传options替换
async function handleRetry(index: number, page: number, innerItem: IChatInnerItem) {
  handleCancelReq()

  const conversation = pageOptions.conversation

  const chatItem = conversation.messages[index]
  const _innerItem = $completion.emptyChatInnerItem({
    model: innerItem.model,
    value: [],
    meta: innerItem.meta,
    timestamp: Date.now(),
    page,
    status: IChatItemStatus.AVAILABLE,
  })

  chatItem.content.push(_innerItem)

  const completion = await innerSend(conversation, chatItem, page)

  curController = completion.send()

  globalConfigModel.value = innerItem.model

  chatRef.value?.handleBackToBottom()
}

async function handleSend(query: IInnerItemMeta[], meta: IChatInnerItemMeta) {
  handleCancelReq()

  const conversation = pageOptions.conversation

  if (!$historyManager.options.list.get(conversation.id))
    $historyManager.options.list.set(conversation.id, conversation)

  const messages = ref(conversation.messages)
  messages.value = calculateConversation(messages)

  const shiftItem = messages.value.at(-1)

  // console.log('shiftItem', shiftItem, shiftItem?.page)

  function getModel() {
    if (!shiftItem)
      return globalConfigModel.value

    const inner = shiftItem.content[shiftItem.page]

    return inner?.model || globalConfigModel.value
  }

  const chatItem = $completion.emptyChatItem()
  const innerItem = $completion.emptyChatInnerItem({
    model: getModel(),
    value: query,
    meta,
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
  if (curController)
    curController.abort()
}

const mount = ref(false)

async function mounter() {
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
  eventScope.on('USER_LOGOUT_SUCCESS', () => { pageOptions.conversation = $completion.emptyHistory() })
  eventScope.on('REQUEST_CREATE_NEW_CONVERSATION', () => {
    handleCreate()
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
            :hide="pageOptions.share.enable" :center="pageOptions.conversation.messages?.length < 1" :tip="tip"
            @send="handleSend" @select-template="handleSelectTemplate"
          />
        </template>
      </EmptyGuide>

      <AigcChatStatusBar>
        <template #start>
          <span v-if="!viewMode && !userStore.isLogin" class="tag warning shining">
            未登录无法使用
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
