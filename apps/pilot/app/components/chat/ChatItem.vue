<script setup lang="ts">
import type { IChatInnerItem, IChatItem, IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import dayjs from 'dayjs'
import zhLocale from 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'
import { api as viewerApi } from 'v-viewer'
import { IChatItemStatus, IChatRole } from '~/composables/api/base/v1/aigc/completion-types'
import { resolveRuntimeModelIconSource, usePilotRuntimeModels } from '~/composables/usePilotRuntimeModels'
import ThCheckBox from '../checkbox/ThCheckBox.vue'
import RoundLoading from '../loaders/RoundLoading.vue'
import TextShaving from '../other/TextShaving.vue'
import ItemModelSelector from './addon/ItemModelSelector.vue'
import ErrorCard from './attachments/ErrorCard.vue'
import ChatAttachment from './ChatAttachment.vue'

interface IChatItemProp {
  item: IChatItem
  // 在实际对话中的序列
  ind: number
  // 在分支对话中的序列
  index: number
  total: number
  share: boolean
  select: number[]
  template: any
}

const props = defineProps<IChatItemProp>()
const emits = defineEmits<{
  (e: 'select', index: number, checked: boolean): void
  (e: 'retry', innerItem: IChatInnerItem): void
  (e: 'suggest', content: string): void
  (e: 'update:item', data: IChatItem): void
  (e: 'update:meta', data: IChatItem): void
}>()
const route = useRoute()
const viewMode = computed(() => route.query?.share)
const msgItem = useVModel(props, 'item', emits)
const dom = ref()
const { ensureLoaded, findModel } = usePilotRuntimeModels()

dayjs.locale(zhLocale)
dayjs.extend(relativeTime)

const check = ref(false)

watch(() => check.value, (val) => {
  emits('select', props.ind, val)
})

watch(() => props.select, (val) => {
  check.value = val.includes(props.ind)
})

const innerItem = computed(() => props.item.content.find(item => item?.page === msgItem.value.page) || null)
const timeAgo = computed(() => innerItem.value ? dayjs(innerItem.value.timestamp).fromNow() : '-')
const isUser = computed(() => props.item.role === IChatRole.USER)

const endStatus = [IChatItemStatus.AVAILABLE, IChatItemStatus.BANNED, IChatItemStatus.CANCELLED, IChatItemStatus.ERROR, IChatItemStatus.REJECTED, IChatItemStatus.TIMEOUT, IChatItemStatus.TOOL_ERROR]
const isEnd = computed(() => {
  if (!innerItem.value || typeof innerItem.value.status !== 'number')
    return false
  return endStatus.includes(innerItem.value.status)
})

const tools = reactive([
  {
    name: '复制',
    icon: 'i-carbon-copy',
    errorHide: true,
    trigger: () => {
      if (!props.item.content || tools[0].icon !== 'i-carbon-copy')
        return

      let content = ''
      innerItem.value!.value.forEach((item) => {
        if (item.type === 'markdown' || item.type === 'text') {
          if (item.data !== 'suggest')
            content += item.value
        }
      })

      navigator.clipboard.writeText(content)

      tools[0].icon = 'i-carbon-checkmark'

      setTimeout(() => {
        tools[0].icon = 'i-carbon-copy'
      }, 1200)
    },
  },
  // { name: '朗读', icon: 'i-carbon-user-speaker' },
])

function handleRetry(model?: string) {
  const inner: IChatInnerItem = JSON.parse(JSON.stringify(innerItem.value!))

  if (model)
    inner.model = model

  emits('retry', inner)

  msgItem.value.page = props.item.page + 1
}

function handleCommandTranslate() {
  emits('suggest', '将上述内容翻译为中文，如果是中文则翻译为英文。')
}

watchEffect(() => {
  // if (isUser.value)
  // return

  const item = props.item
  if (!item?.content?.length)
    return

  // 如果找不到目标页数，则设置为第一个
  const targetPageItem = item.content.find(_item => item.page === _item?.page)
  if (!targetPageItem) {
    const firstPageItem = item.content[0]

    msgItem.value.page = firstPageItem!.page
  }

  // 如果当前页数大于内容，则将页数设置为第一个
  // const totalLength = props.item.content.length

  // if (props.item.page > totalLength - 1) {
  //   msgItem.value.page = 0
  // }

  // const selfIndex = innerItem.value ? props.item.content.findIndex(_ => _?.timestamp === innerItem.value?.timestamp) : 0
  // console.log('refresh', selfIndex, innerItem.value, props)

  // 计算自己的content中有多少个null
  // metaModel.value.show = !!innerItem.value && metaModel.value.dictIndex <= props.item.page + nullLen.value
})

function handleViewImage(src: string) {
  viewerApi({ images: [src] })
}

function noneCard(block: IInnerItemMeta) {
  console.log('none card result', block)
}

const targetModel = computed(() =>
  findModel(innerItem.value?.model),
)
const targetModelIcon = computed(() => targetModel.value ? resolveRuntimeModelIconSource(targetModel.value) : null)

const contentsLength = computed(() => (innerItem.value?.value || []).reduce((amo, item) => amo + (item?.data === 'suggest' ? 0 : (item?.value?.length || 0)), 0))

onMounted(() => {
  void ensureLoaded()
})
</script>

<template>
  <div :class="{ check, share, user: isUser }" class="ChatItem">
    <div class="ChatItem-Select">
      <ThCheckBox v-model="check" />
    </div>

    <div class="ChatItem-Avatar">
      <PersonalUserAvatar v-if="template?.avatar" :avatar="template.avatar" />
      <img v-else-if="targetModelIcon?.type === 'image'" :src="targetModelIcon.value">
      <span v-else-if="targetModelIcon?.type === 'emoji'" class="model-emoji">{{ targetModelIcon.value }}</span>
      <i v-else-if="targetModelIcon?.type === 'class'" :class="targetModelIcon.value" />
      <img v-else src="/logo.png">
    </div>
    <!-- error: innerItem.status === IChatItemStatus.ERROR, -->
    <div v-if="innerItem" class="ChatItem-Wrapper">
      <div v-if="template?.id && !isUser" class="ChatItem-TemplateAgent">
        <el-tooltip placement="top" :content="`百变角色 ${template.title}`">
          <div class="agent-name">
            <div i-carbon:ai-launch />{{ template.title }}
          </div>
        </el-tooltip>
        <div v-if="template.description" class="agent-addon fake-background">
          {{ template.description }}
        </div>
      </div>

      <div class="ChatItem-Content">
        <div v-if="innerItem.status === IChatItemStatus.WAITING" class="ChatItem-Generating">
          <div class="ChatItem-GeneratingWrapper">
            <RoundLoading />
          </div>
        </div>
        <div v-else-if="innerItem.value.length" ref="dom" class="ChatItem-Content-Inner">
          <!-- <span v-if="innerItem.status === IChatItemStatus.ERROR">
            错误 {{ item.content }}
          </span> -->
          <div v-for="(block, i) in innerItem.value" :key="i" class="ChatItem-Content-Inner-Block">
            <div v-if="block.data === 'suggest'">
              <div
                v-if="!viewMode && index === total - 1" v-wave :style="`--fly-enter-delay: ${i * 0.125}s`"
                class="transition-cubic fake-background suggest-card" @click="emits('suggest', block.value)"
              >
                <TextShaving v-if="!isEnd" :text="block.value" />
                <template v-else>
                  {{ block.value }}
                </template>
              </div>
            </div>

            <pre v-else-if="block.type === 'text'" class="inner" v-text="block.value" />

            <RenderContent v-else-if="block.type === 'markdown'" :dot-enable="!isEnd" readonly :data="block.value" />

            <div v-else-if="block.type === 'card'">
              <ChatAttachmentsCardMultiAgentJumpCard
                v-if="block.name === 'multi_agents_jump_to_agent'"
                :block="block"
              />
              <ChatAttachmentsCardTimeCapsuleRecallCard
                v-else-if="block.name === 'time_capsule_recall'"
                :block="block"
              />
              <template v-else>
                {{ noneCard(block) }}
              </template>
            </div>

            <div v-else-if="block.type === 'tool'">
              <ChatAttachment :block="block" />
            </div>

            <div v-else-if="block.type === 'error'">
              <ErrorCard :block="block" />
            </div>

            <div v-else-if="block.type === 'image'" class="image-card" @click="handleViewImage(block.value)">
              <img :src="block.value" alt="用户发送的图片">
            </div>

            <div v-else-if="block.type === 'file'">
              File
            </div>
          </div>
        </div>
        <p v-else mt-3>
          <TextShaving :text="isEnd ? '分析失败' : '正在分析中'" />
          <br>
        </p>
      </div>

      <div
        v-if="
          isEnd
            && !!item.content?.length
        " class="ChatItem-Mention" :class="{
          autoHide: isUser || total !== index + 1,
        }"
      >
        <ChatAddonChatPageSelector
          v-if="!isUser && item.content.length > 1" v-model="msgItem.page"
          class="view-none-display" :total-page="item.content.length"
        />

        <span class="toolbox">
          <span v-for="tool in tools" :key="tool.name" class="toolbox-item" @click="tool.trigger">
            <el-tooltip :content="tool.name">
              <i :class="tool.icon" />
            </el-tooltip>
          </span>
        </span>

        <template v-if="!viewMode && !isUser && total === index + 1">
          <ItemModelSelector v-model="innerItem.model" :page="item.page" :done="isEnd" @retry="handleRetry" />
          <ChatAddonCommandSelector @translate="handleCommandTranslate" />
        </template>
        <template v-else-if="!isUser">
          <span class="info">
            <span>{{ targetModel?.name || innerItem.model }}</span>
          </span>
        </template>

        <span class="info">
          <span class="date">{{ timeAgo }}</span>
          &nbsp;
          <span v-if="contentsLength > 30" class="length">{{ contentsLength }} 字</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
div.ChatItem-Wrapper.error div.ChatItem-Content-Inner {
  box-shadow: var(--el-box-shadow-light);
  backdrop-filter: unset;
  background-color: var(--el-color-danger);
}

.ChatItem.share {
  div.ChatItem-Mention {
    opacity: 0;
  }

  .ChatItem-Select {
    opacity: 1;
  }

  margin-left: 1rem;

  left: 10%;
  width: 80%;

  &.check {
    padding: 0.5rem;

    background: var(--el-fill-color-light);
    border-radius: 16px;
  }
}

.ChatItem-Select {
  position: absolute;

  top: 0.5rem;
  left: -3.5rem;

  opacity: 0;
  transition: 0.25s;

  transform: scale(0.75);
}

.ChatItem-Generating {
  .ChatItem-GeneratingWrapper {
    position: absolute;

    height: 100%;

    opacity: 0.25;
    background-color: rgba(255, 255, 255, 0.5);
  }

  height: 28px;

  position: relative;
  top: 20px;
  left: 10px;
}

@keyframes fly_enter {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }

  60% {
    opacity: 1;
    transform: translateY(-2px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.ChatItem-TemplateAgent {
  &:hover {
    .agent-addon {
      margin: 0.5rem 0;

      opacity: 1;
      max-height: 200px;
    }
  }

  .agent-addon {
    position: relative;
    padding: 0.75rem;

    border-radius: 16px;
    --fake-opacity: 0.75;
    color: var(--el-text-color-secondary);

    opacity: 0;
    max-height: 0;
    margin: 0 0 -1rem;
    overflow: hidden;
    transition: 0.35s;

    backdrop-filter: blur(18px) saturate(180%);
  }

  .agent-name {
    &::after {
      content: '';
      position: absolute;

      left: 0;
      bottom: -2px;

      width: 100%;
      height: 2px;

      border-radius: 4px;
      background-color: var(--theme-color);
    }

    position: relative;
    display: flex;

    width: max-content;

    gap: 0.5rem;
    align-items: center;

    color: var(--el-text-color-secondary);
    font-weight: 600;
  }
}

.ChatItem-Wrapper {
  .ChatItem-Content-Inner {
    .suggest-card {
      &:hover {
        color: var(--el-text-color-primary);
      }

      position: relative;
      margin: 0.5rem -0.5rem;
      padding: 0.25rem 0.75rem;

      width: max-content;
      max-width: 100%;

      cursor: pointer;
      overflow: hidden;
      border-radius: 12px;
      --fake-opacity: 0.025;
      --fake-color: var(--theme-color);
      // border: var(--el-border);
      color: var(--el-text-color-secondary);
      backdrop-filter: blur(18px) saturate(180%);
      box-shadow: var(--el-box-shadow-light);

      opacity: 0;
      animation: fly_enter 0.25s ease-in-out forwards var(--fly-enter-delay, 0s);
    }

    .image-card {
      img {
        width: 100%;
        height: 100%;
      }

      position: relative;
      margin-top: 1rem;

      height: auto;

      width: 200px;
      min-height: 50px;

      float: right;

      cursor: pointer;
      overflow: hidden;
      border-radius: 4px;
      box-shadow: var(--el-box-shadow);
    }

    pre {
      margin: 0;
      padding: 0;

      max-width: 100%;
      overflow-wrap: break-word;
      white-space: pre-wrap;
      word-wrap: break-word;
      word-break: break-all;

      color: var(--el-text-color-primary);
      border: none #000;
      background-color: #0000;

      font-variant-ligatures: no-common-ligatures;
      font-family: 'Helvetica Neue', 'Luxi Sans', 'DejaVu Sans',
        'Hiragino Sans GB', 'Microsoft Yahei', sans-serif, 'Apple Color Emoji',
        'Segoe UI Emoji', 'Noto Color Emoji', 'Segoe UI Symbol', 'Android Emoji',
        'EmojiSymbols';
    }

    .user & pre {
      padding: 0.5rem 1rem;

      border-radius: 16px 8px 16px 16px;
      box-shadow: var(--el-box-shadow);
      // background-color: var(--el-bg-color);
      background-color: var(--wallpaper-color-lighter);
      backdrop-filter: blur(18px) saturate(180%);
    }

    .RenderContent {
      margin-top: 12px;
    }

    position: relative;

    top: 0;
    right: 0;

    width: 100%;
    height: fit-content;

    transition: 0.5s;

    .user & {
      width: max-content;
      max-width: 100%;
      min-width: 48px;
    }
  }

  &:hover {
    .ChatItem-Mention {
      opacity: 1 !important;

      .toolbox,
      .info {
        opacity: 0.5 !important;
      }

      .ItemModelSelector {
        opacity: 1 !important;
      }
    }
  }

  .ChatItem-Mention {
    &.autoHide {
      .ItemModelSelector,
      .toolbox,
      .info {
        opacity: 0;
      }
    }

    .user & {
      opacity: 0;
    }

    .toolbox {
      &-item {
        &:hover {
          border-radius: 8px;
          background-color: var(--el-bg-color-page);
        }

        padding: 0.25rem;

        transition: 0.25s;
      }

      i {
        display: block;
      }

      display: flex;

      gap: 0.5rem;
      align-items: center;

      height: 12px;
      width: fit-content;

      flex: 0;
      opacity: 0.5;
      cursor: pointer;
      transition: 0.25s;
    }

    .info {
      opacity: 0.5;
      transition: 0.25s;
    }

    .user & {
      padding: 0.25rem 0.5rem;
      flex-direction: row-reverse;

      left: unset;
      float: right;

      border-radius: 12px;
      box-shadow: var(--el-box-shadow);
      background-color: var(--wallpaper-color-lighter);
      backdrop-filter: blur(18px) saturate(180%);
      // background-color: var(--el-bg-color-page);
    }

    z-index: 2;
    position: relative;
    margin: 0.25rem 0;
    display: flex;

    gap: 0.5rem;
    align-items: center;
    justify-content: flex-start;

    // height: 32px;
    width: max-content;

    left: 0;
    bottom: 0;

    font-size: 14px;
    box-sizing: border-box;
    transition: 0.25s;
  }

  position: relative;

  width: 70%;
  height: max-content;

  .user & {
    width: max-content;
    max-width: 70%;
    min-width: 48px;
  }

  .mobile & {
    max-width: 80%;
  }
}

.ChatItem {
  &.user {
    z-index: 2;

    .ChatItem-Avatar {
      display: none;
    }

    justify-content: flex-end;
  }

  .ChatItem-Avatar {
    img {
      width: 32px;
      height: 32px;
    }
    .model-emoji {
      font-size: 22px;
      line-height: 32px;
    }
    i {
      font-size: 24px;
      line-height: 32px;
    }
    position: relative;
    display: flex;

    width: 48px;
    height: 48px;

    justify-content: center;
    align-items: center;

    overflow: hidden;
    border-radius: 50%;
  }

  &-Content {
    position: relative;
    display: flex;

    width: 100%;

    .user & {
      position: relative;

      justify-content: flex-end;
    }
  }

  z-index: 3;
  position: relative;
  display: flex;
  margin: 1rem 0;

  left: 0;

  width: 100%;
  height: max-content;

  gap: 0.5rem;

  transition: 0.25s;
  box-sizing: border-box;
  // animation: join 0.35s ease-in-out;

  // background-color: #ff000010;
}
</style>
