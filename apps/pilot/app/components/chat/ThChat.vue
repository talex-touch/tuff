<script setup lang="ts">
import ChatSetting from '../setting/ChatSetting.vue'
import ChatItem from './ChatItem.vue'
import EmptyGuide from './EmptyGuide.vue'
import TrChatTitle from './head/TrChatTitle.vue'
import TrSyncStatus from './head/TrSyncStatus.vue'
import AccountAvatar from '~/components/personal/AccountAvatar.vue'
import IconButton from '~/components/button/IconButton.vue'
import { type IChatConversation, type IChatInnerItem, type IChatItem, IChatItemStatus } from '~/composables/api/base/v1/aigc/completion-types'
import { calculateConversation } from '~/composables/api/base/v1/aigc/completion/entity'

const props = defineProps<{
  messages: IChatConversation
  status: IChatItemStatus
}>()

const emits = defineEmits<{
  (e: 'update:messages', messages: IChatConversation): void
  (e: 'cancel'): void
  (e: 'retry', index: number, page: number, innerItem: IChatInnerItem): Promise<void>
  (e: 'suggest', content: string): void
}>()

const scrollbar = ref()
const route = useRoute()
const viewMode = computed(() => route.query?.share)
const share: any = (inject('pageOptions')! as any).share
const options = reactive({
  backToTop: false,
  backToBottom: false,
  share,
})

const messagesModel = useVModel(props, 'messages', emits)

function handleCancel() {
  emits('cancel')
}

watch(
  () => props.messages?.messages,
  () => {
    nextTick(() => {
      handleScroll()

      setTimeout(() => {
        handleBackToBottom()
      }, 10)
    })
  },
)

function handleSelectShareItem(index: number, check: boolean) {
  if (!check)
    options.share.selected = options.share.selected.filter((_index: any) => _index !== index)
  else
    options.share.selected = [...new Set([...options.share.selected, index])]
}

onMounted(() => {
  handleBackToBottom(false)

  setTimeout(() => {
    handleScroll()
  }, 200)
})

function handleScroll() {
  const scrollbarEl = scrollbar.value?.wrapRef
  if (!scrollbarEl)
    return

  const { scrollTop, scrollHeight, clientHeight } = scrollbarEl

  // 如果滚动距离超过了一个3/4屏幕
  options.backToTop = false
  if (scrollTop > window.innerWidth * 0.75)
    options.backToTop = true

  if (Math.abs(clientHeight - scrollHeight) < 10) {
    options.backToBottom = false
    return
  }

  const diff = scrollHeight - scrollTop - document.body.clientHeight
  options.backToBottom = diff >= scrollHeight * 0.1
}

function handleBackToBottom(animation: boolean = true) {
  const el: HTMLElement = scrollbar.value.wrapRef

  el.scrollTo({
    top: el.scrollHeight,
    behavior: animation ? 'smooth' : 'auto',
  })
}

function handleBackToTop() {
  const el: HTMLElement = scrollbar.value.wrapRef

  el.scrollTo({
    top: 0,
    behavior: 'smooth',
  })
}

const stop = computed(() =>
  props.status === IChatItemStatus.GENERATING || props.status === IChatItemStatus.WAITING || props.status === IChatItemStatus.TOOL_CALLING || props.status === IChatItemStatus.TOOL_RESULT,
)

defineExpose({
  handleBackToBottom,
  generateScroll: (mode: 'stream' | 'final' = 'stream') => {
    handleScroll()

    if (!options.backToBottom)
      handleBackToBottom(mode === 'final')
  },
  // getDictMeta: () => msgMeta,
})

function handleRetry(ind: number, item: IChatInnerItem) {
  const chat = messagesModel.value.messages[ind]

  emits('retry', ind, chat.page + 1, item)
}

async function handleSuggest(content: string) {
  // animation duration

  await sleep(400)

  emits('suggest', content)
}

const processedMessageList = computed(() => {
  const messageList = ref(messagesModel.value.messages)

  return calculateConversation(messageList)
})
</script>

<template>
  <div class="ThChat">
    <div v-if="messages" :class="{ show: messages.messages?.length > 1 }" class="ThChat-Title">
      <span class="model only-pc-display">
        <slot name="model" />
      </span>
      <div w-full flex items-center justify-between px-2 text-lg class="only-pe-display">
        <slot name="header" />
      </div>
    </div>

    <div class="ThChat-Container" :class="{ stop, backToBottom: options.backToBottom }">
      <!-- {{ messagesModel }} -->
      <div :class="{ in: options.backToTop }" class="ToTop only-pc-display" @click="handleBackToTop">
        <div i-carbon:arrow-up />
        查看{{ messagesModel.messages.length }}条历史消息
      </div>

      <el-scrollbar ref="scrollbar" @scroll="handleScroll">
        <div v-if="messages" class="ThChat-Container-Wrapper">
          <!-- v-model:meta="msgMeta[ind]" -->
          <!-- {{ processedMessageList }} -->
          <ChatItem
            v-for="(message, index) in processedMessageList" :key="message.id"
            v-model:item="messagesModel.messages[message.$index]" :index="index" :ind="message.$index"
            :total="processedMessageList.length" :share="options.share.enable" :select="options.share.selected"
            :template="messages.template"
            @select="handleSelectShareItem" @retry="handleRetry(message.$index, $event)"
            @suggest="handleSuggest($event)"
          />

          <!-- 统一 error / warning mention -->
          <!-- v-if="!options.share.enable" -->

          <br v-for="i in 10" :key="i">

          <div v-if="viewMode" class="ThChat-RateLimit">
            <div v-if="viewMode">
              <p>
                此对话为分享对话，你无法做任何修改。
              </p>
              <p>
                当前对话涵盖分享者主观信息，科塔智爱不对此负责。
              </p>
            </div>
            <!-- 为了避免恶意使用，你需要登录来解锁聊天限制！ -->
          </div>
        </div>
      </el-scrollbar>

      <div class="ThChat-BackToBottom" @click="handleBackToBottom()">
        <div i-carbon-down-to-bottom />
      </div>
      <div class="ThChat-StopGenerating" @click="handleCancel">
        停止生成
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.ToTop {
  &.in {
    &:hover {
      transform: translateX(0);

      background-color: var(--el-bg-color-page);
    }
    transform: translateX(calc(100% - 40px));
  }
  z-index: 3;
  position: absolute;
  padding: 1.5rem 2rem 1.5rem 0.75rem;
  display: flex;

  top: 10%;
  right: 0;

  gap: 0.5rem;
  align-items: center;

  width: max-content;
  height: 30px;

  font-size: 1.25rem;
  font-weight: bold;

  cursor: pointer;
  transform: translateX(120%);
  border-radius: 16px 0 0 16px;
  box-shadow: var(--el-box-shadow);
  backdrop-filter: blur(18px) saturate(180%);
  background-color: var(--el-bg-color);
  transition: 0.35s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.ThChat-RateLimit {
  // &::before {
  //   z-index: -1;
  //   content: '';
  //   position: absolute;

  //   left: -10%;
  //   width: 120%;

  //   height: 20px;

  //   background: linear-gradient(to bottom, transparent 0%, var(--el-bg-color));
  // }

  z-index: 3;
  position: sticky;
  margin: 1rem 0 2rem;

  bottom: 30px;

  text-align: center;
  color: var(--el-color-danger);

  p {
    text-shadow: 0 0 24px var(--theme-color);
  }
}

.ThChat-Setting {
  &:hover {
    span {
      opacity: 1;

      transform: translateX(0);
    }

    width: 80px;

    background-color: var(--el-text-color-placeholder);
  }

  &:active {
    transform: translateY(-50%) scale(0.75);
  }

  div {
    position: absolute;

    top: 8px;
    left: 8px;
  }

  span {
    position: absolute;

    top: 5px;
    left: 30px;

    width: 50px;

    opacity: 0;
    transition: 0.25s;
    transform: translateX(-50%);
  }

  position: absolute;

  top: 50%;
  left: 0.5rem;

  width: 32px;
  height: 32px;

  opacity: 0.75;
  cursor: pointer;
  transition: 0.25s;
  border-radius: 12px;
  transform: translateY(-50%);
}

.ThChat-HeadBar {
  .ThChat-Title.show & {
    transform: scale(1) translateY(0);
  }

  transform: scale(0.8) translateY(-200%);

  // border-bottom: 1px solid var(--el-border-color);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.ThChat-Container {
  &.stop {
    .ThChat-StopGenerating {
      transform: translate(-50%, -50%) translateX(0) scale(1);
    }
  }

  &.backToBottom .ThChat-BackToBottom {
    transform: translate(-50%, -50%) translateX(0) scale(1);
  }

  &.backToBottom.stop .ThChat-BackToBottom {
    transform: translate(-50%, -50%) translateX(-35px) scale(1);
  }

  &.backToBottom.stop .ThChat-StopGenerating {
    transform: translate(-50%, -50%) translateX(35px) scale(1);
  }
}

.ThChat-StopGenerating {
  &::before {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.25;
    border-radius: 18px;
    background-color: var(--el-text-color-placeholder);
  }

  &:hover {
    color: var(--el-color-danger);
  }

  z-index: 3;
  position: absolute;
  padding: 0.25rem 0.5rem;

  left: 50%;
  bottom: 8rem;

  cursor: pointer;
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  border-radius: 18px;
  box-shadow: var(--el-box-shadow);
  transform: translate(-50%, -50%) translateX(100px) scale(0);
  backdrop-filter: blur(18px) saturate(180%);
}

.ThChat-BackToBottom {
  &::before {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.25;
    border-radius: 18px;
    background-color: var(--el-text-color-placeholder);
  }

  z-index: 3;
  position: absolute;
  display: flex;
  padding: 0.25rem 0.5rem;

  left: 50%;
  bottom: 8rem;

  height: 32px;

  align-items: center;

  cursor: pointer;
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  border-radius: 18px;
  box-shadow: var(--el-box-shadow);
  transform: translate(-50%, -50%) translateX(-100px) scale(0);
  backdrop-filter: blur(18px) saturate(180%);
}

.ThChat-Container {
  &-Wrapper {
    z-index: 2;
    position: relative;
    padding: 1rem 0;
    padding-top: 40px;

    display: flex;
    flex-direction: column;

    left: 50%;
    width: 1080px;
    max-width: 70%;

    gap: 0.25rem;
    box-sizing: border-box;

    transform: translateX(-50%);
    .mobile & {
      width: 95%;
    }
  }

  height: 100%;
}

@media (max-width: 1080px) {
  .ThChat-Container {
    &-Wrapper {
      max-width: 90%;
    }
  }
}

.ThChat {
  &-Title {
    .mobile & {
      top: 0;

      background-color: var(--el-bg-color);
    }

    & .model {
      position: absolute;

      right: 1rem;

      font-size: 14px;

      pointer-events: auto;
    }

    z-index: 4;
    position: absolute;
    padding: 0.5rem 0.25rem;
    display: flex;

    color: var(--el-text-color);
    align-items: center;
    justify-content: center;

    top: 0.5rem;
    left: 0;

    width: 100%;
    height: 40px;

    .screen & {
      pointer-events: none;
    }

    // backdrop-filter: blur(18px) saturate(180%);
  }

  height: 100%;
}
</style>
