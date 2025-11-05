<script setup lang="ts" name="CoreBox">
import { reactive, ref, computed } from 'vue'
import { BoxMode, IBoxOptions } from '../../modules/box/adapter'
import BoxInput from './BoxInput.vue'
import TagSection from './tag/TagSection.vue'
import { appSetting } from '~/modules/channel/storage'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import PrefixPart from './PrefixPart.vue'

import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import CoreBoxRender from '~/components/render/CoreBoxRender.vue'
import CoreBoxFooter from '~/components/render/CoreBoxFooter.vue'
import TuffItemAddon from '~/components/render/addon/TuffItemAddon.vue'
// import EmptySearchStatus from '~/assets/svg/EmptySearchStatus.svg'
import type { TuffItem } from '@talex-touch/utils'

const scrollbar = ref()
const boxInputRef = ref()
const boxOptions = reactive<IBoxOptions>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {}
})

// Create shared clipboard state
const clipboardOptions = reactive<any>({
  last: null,
  detectedAt: null
})

const {
  searchVal,
  select,
  res,
  // loading,
  activeItem,
  activeActivations,
  handleExecute,
  handleExit,
  handleSearchImmediate,
  deactivateProvider
  // cancelSearch
} = useSearch(boxOptions, clipboardOptions)

const handleClipboardChange = () => {
  // Force immediate search when clipboard changes (paste or clear)
  handleSearchImmediate()
}

const { handlePaste, handleAutoPaste, clearClipboard } = useClipboard(
  boxOptions,
  clipboardOptions,
  handleClipboardChange
)

const completionDisplay = computed(() => {
  if (
    !searchVal.value.trim() ||
    !activeItem.value ||
    boxOptions.mode === BoxMode.FEATURE ||
    !activeItem.value.render
  ) {
    return ''
  }

  const completion =
    activeItem.value.render.completion ?? activeItem.value.render.basic?.title ?? ''

  if (completion.startsWith(searchVal.value)) {
    return completion.substring(searchVal.value.length)
  }

  return completion
})

useVisibility(
  boxOptions,
  searchVal,
  clipboardOptions,
  handleAutoPaste,
  handlePaste,
  clearClipboard,
  boxInputRef
)
useKeyboard(
  boxOptions,
  res,
  select,
  scrollbar,
  searchVal,
  handleExecute,
  handleExit,
  computed(() => boxInputRef.value?.inputEl),
  clipboardOptions,
  clearClipboard,
  activeActivations,
  handlePaste
)
useChannel(boxOptions, res)

function handleTogglePin(): void {
  appSetting.tools.autoHide = !appSetting.tools.autoHide
}

function handleItemTrigger(index: number, item: TuffItem): void {
  if (item.kind === 'file') {
    if (boxOptions.focus !== index) {
      boxOptions.focus = index
      return
    }
  }

  handleExecute(item)
}

const addon = computed(() => {
  if (!activeItem.value) return undefined

  const item = activeItem.value

  if (item.kind === 'file') {
    return 'preview'
  }

  return undefined
})
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div class="CoreBox" @paste="handlePaste">
    <PrefixPart
      :providers="activeActivations"
      @close="handleExit"
      @deactivate-provider="deactivateProvider"
    />

    <BoxInput ref="boxInputRef" v-model="searchVal" :box-options="boxOptions">
      <template #completion>
        <div v-html="completionDisplay" />
      </template>
    </BoxInput>

    <TagSection :box-options="boxOptions" :clipboard-options="clipboardOptions" />

    <div class="CoreBox-Configure">
      <!-- <RemixIcon
        v-if="loading"
        style="line"
        name="close-circle"
        class="cancel-button"
        @click="cancelSearch"
        title="取消搜索"
      /> -->
      <RemixIcon
        :style="appSetting.tools.autoHide ? 'line' : 'fill'"
        name="pushpin-2"
        @click="handleTogglePin"
      />
    </div>
  </div>

  <div class="CoreBoxRes flex">
    <div class="CoreBoxRes-Main" :class="{ compressed: !!addon }">
      <TouchScroll ref="scrollbar" class="scroll-area">
        <CoreBoxRender
          v-for="(item, index) in res"
          :key="index"
          :active="boxOptions.focus === index"
          :item="item"
          :index="index"
          @trigger="handleItemTrigger(index, item)"
        />
        <!-- @mousemove="boxOptions.focus = index" -->
      </TouchScroll>
      <!-- <div v-if="searchVal.trim() && res.length === 0" class="CoreBoxRes-Empty">
        <div class="placeholder-graphic">
          <img :src="EmptySearchStatus" />
        </div>
        <span class="title">CoreBox</span>
        <span class="subtitle">暂无结果，试试其他关键词</span>
      </div> -->
      <CoreBoxFooter :display="!!res.length" :item="activeItem" class="CoreBoxFooter-Sticky" />
    </div>
    <TuffItemAddon :type="addon" :item="activeItem" />
  </div>
</template>

<style lang="scss">
.core-box {
  .CoreBoxRes {
    display: flex !important;
  }
}

.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;

  cursor: pointer;
  font-size: 1.25em;

  .cancel-button {
    color: var(--el-color-danger);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.6;
    }
  }
}

div.CoreBoxRes {
  position: absolute;
  display: none;

  flex-direction: row;

  top: 60px;

  width: 100%;
  height: calc(100% - 60px);

  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--el-border-color);

  .core-box & {
    display: flex;
  }

  .CoreBoxRes-Main {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    transition: width 0.3s ease;
  }

  .CoreBoxRes-Main.compressed {
    width: 40%;
  }

  .scroll-area {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;

    padding-bottom: 44px;
  }
}

.CoreBoxRes-Empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 24px;
  color: var(--el-text-color-secondary);
  text-align: center;

  .placeholder-graphic {
    width: 120px;
    height: 120px;
    opacity: 0.28;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .subtitle {
    font-size: 12px;
  }
}

.CoreBoxFooter-Sticky {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.CoreBoxRes-Main > .scroll-area > .CoreBoxRender:last-child {
  margin-bottom: 40px;
}

div.CoreBox {
  z-index: 100000000;
  position: absolute;
  padding: 4px 8px;
  display: none;

  width: 100%;
  height: 64px;

  left: 0;
  top: 0;

  gap: 0.25rem;
  align-items: center;

  border-radius: 8px;
  box-sizing: border-box;

  .core-box & {
    display: flex;
  }
}

.core-box .AppLayout-Wrapper {
  visibility: hidden;
}

.core-box .CoreBox-Mask {
  z-index: -100;
  position: absolute;

  inset: 0;

  opacity: 0.75;
  background-color: var(--el-fill-color);
}
</style>
