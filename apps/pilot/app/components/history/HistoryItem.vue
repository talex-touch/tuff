<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'
import { Loading } from '@element-plus/icons-vue'
import PopoverComp from '../template/PopoverComp.vue'
import ChatLinkShare from '../chat/head/ChatLinkShare.vue'
import { type IChatConversation, PersistStatus } from '~/composables/api/base/v1/aigc/completion-types'
import { $historyManager } from '~/composables/api/base/v1/aigc/history'
import { $completion } from '~/composables/api/base/v1/aigc/completion'
import { $endApi } from '~/composables/api/base'
import { createTapTip } from '~/composables/tip'

const props = defineProps<{
  modelValue: IChatConversation
  active: boolean
  select: string
  history: IChatConversation[]
}>()

const emits = defineEmits<{

  (e: 'update:select', index: string): void
  (e: 'delete', index: string): void
  (e: 'click', data: IChatConversation): void
}>()

const route = useRoute()

const { select } = useVModels(props, emits)

const editMode = ref(false)
const input = ref()
const topic = ref()

const hover = ref(false)
const hoverMode = debouncedRef(hover, 200)
const reactiveConversation = computed(() => $historyManager.options.list.get(props.modelValue.id) || null)

const loading = ref(false)
const shareLink = useTypedRef(ChatLinkShare)

watch(
  () => topic.value,
  (val) => {
    if (reactiveConversation.value) {
      reactiveConversation.value.topic = val
      reactiveConversation.value.sync = PersistStatus.MODIFIED
    }
  },
)
const menus = reactive([
  {
    name: '复制标题',
    icon: 'i-carbon-copy',
    trigger: () => {
      navigator.clipboard.writeText(props.modelValue.topic)

      ElMessage({
        message: '标题已成功复制到剪贴板！',
        grouping: true,
        type: 'success',
        plain: true,
      })
    },
  },
  {
    name: '编辑标题',
    icon: 'i-carbon-edit',
    trigger: () => {
      if (!reactiveConversation.value) {
        ElMessage({
          message: '无法修改目标记录!',
          grouping: true,
          type: 'error',
          plain: true,
        })
        return
      }

      topic.value = props.modelValue.topic
      editMode.value = true

      setTimeout(() => input.value?.focus(), 200)
    },
  },
  {
    name: '分享记录',
    icon: 'i-carbon-share',
    trigger: async () => {
      loading.value = true

      const res = await shareLink.value!.openShareDialog()

      whenever(() => res.value === false, () => {
        setTimeout(() => {
          loading.value = false
        }, 500)
      })
    },
  },
  {
    type: 'divider',
  },
  {
    name: '删除记录',
    icon: 'i-carbon-close',
    danger: true,
    trigger: (id: string) => {
      emits('delete', id)
    },
  },
])

const itemLine = ref()
const itemFloating = ref()

const { floatingStyles } = useFloating(itemLine, itemFloating, {
  middleware: [offset(10), flip()],
  whileElementsMounted: autoUpdate,
})

async function handleSelect(e?: Event) {
  if (props.modelValue.messages) {
    if (!props.modelValue.messages.length || Date.now() - props.modelValue.lastUpdate <= 60 * 1000 * 5) {
      emits('click', props.modelValue)

      return
    }
  }

  e?.stopImmediatePropagation()

  loading.value = true

  const res = await $endApi.v1.aigc.getConversation(props.modelValue.id)

  if (responseMessage(res, { success: '', triggerOnDataNull: true }))
    emits('click', decodeObject(res.data.value))

  loading.value = false
}

watch(route, () => {
  if (!route.query?.id)
    return

  const { id } = route.query
  if (!id)
    return

  const res = [...props.history].find(item => item.id === id)
  if (!res) {
    // select.value = ''

    return
  }

  if (id === props.modelValue.id)
    handleSelect().then(() => select.value = props.modelValue.id)
}, { immediate: true })
</script>

<template>
  <div v-wave class="History-Content-Item" :class="{ loading, edit: editMode, active }" @click="handleSelect">
    <div class="HistoryItem">
      <div class="content-loader">
        <el-icon>
          <Loading />
        </el-icon>
      </div>
      <div class="content-wrapper">
        <input v-if="editMode" ref="input" v-model="topic" @blur="editMode = false" @keydown.enter="editMode = false">
        <span v-else class="content">{{ modelValue.topic }}</span>
      </div>
      <div
        ref="itemLine" class="History-Content-Fixed" @mouseenter="hoverMode = hover = true"
        @mouseleave="hover = false"
      >
        <div class="i-carbon:overflow-menu-horizontal" />
      </div>
    </div>
  </div>

  <ChatLinkShare ref="shareLink" :model-value="modelValue" />

  <teleport to="#teleports">
    <div
      ref="itemFloating" :class="{ hover: hoverMode }" :style="floatingStyles" class="History-Content-MenuWrapper"
      @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
    >
      <div class="History-Content-Menu fake-background">
        <div
          v-for="menu in menus" :key="menu.name" v-wave
          :class="{ divider: menu.type === 'divider', danger: menu.danger }" class="History-Content-Menu-Item"
          @click.stop="menu.trigger?.(modelValue.id)"
        >
          <template v-if="menu.type === 'divider'">
            <el-divider />
          </template>
          <template v-else>
            <div :class="menu.icon" />
            <span v-html="menu.name" />
          </template>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.HistoryItem {
  .content-loader {
    .loading & {
      opacity: 1;
      width: calc(37px - 1rem);
    }
    display: flex;

    align-items: center;
    justify-content: center;

    height: calc(37px - 1rem);

    width: 0;
    opacity: 0;
    transition: 0.25s;
    animation: rotate infinite linear 1s;
  }
  display: flex;

  gap: 0.1rem;
  align-items: center;
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

.History-Content {
  &-Fixed {
    &:hover {
      background-color: #ffffff30;
    }

    z-index: 20;
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    top: 50%;
    right: 1%;

    width: 32px;
    height: 32px;
    font-size: 20px;

    opacity: 0;
    border-radius: 12px;
    transform: translate(0, -50%);
    transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }

  &-Item {
    .content-wrapper {
      display: flex;

      width: 85%;

      // 截断
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;

      .privacy & {
        filter: blur(5px);
      }
    }

    .privacy &:hover .content-wrapper {
      filter: blur(0);
    }

    input {
      width: 100%;
      background: #0000;

      &:focus-visible {
        border: none;
        outline: none;
      }
    }

    &:hover,
    &.loading {
      .History-Content-Fixed {
        opacity: 1;
      }

      color: #fff;
      background-color: var(
        --wallpaper-color-light,
        var(--el-color-primary-light-5)
      );
    }

    &.active {
      color: var(--el-text-color-primary);
      background-color: var(
        --wallpaper-color-light,
        var(--el-color-primary-light-5)
      );
    }

    position: relative;
    // display: flex;

    padding: 0.5rem 0.5rem;

    min-height: 32px;
    // width: 100%;

    font-size: 14px;
    cursor: pointer;
    border-radius: 12px;
    color: var(--el-text-color-regular);
    // background-color: var(--el-bg-color-page);
  }
}

.History-Content-MenuWrapper {
  z-index: 3;

  height: 165px;

  user-select: none;
}
</style>
