<script setup lang="ts" name="CoreBox">
import { reactive, ref } from 'vue'
import { BoxMode, IBoxOptions } from '../../modules/box/adapter'
import BoxInput from './BoxInput.vue'
import TagSection from './tag/TagSection.vue'
import { appSetting } from '~/modules/channel/storage'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import PrefixPart from './PrefixPart.vue'
import { useCoreBox } from '@renderer/modules/hooks/core-box'

import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'
import CoreBoxRender from '@renderer/components/render/CoreBoxRender.vue'

useCoreBox()

const scrollbar = ref()
const boxInputRef = ref()
const boxOptions = reactive<IBoxOptions>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {}
})

const {
  searchVal,
  select,
  res,
  activeItem,
  activatedProviders,
  handleExecute,
  handleExit,
  deactivateProvider
} = useSearch(boxOptions)
const { clipboardOptions, handlePaste, handleAutoPaste } = useClipboard(boxOptions, searchVal)

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

useVisibility(boxOptions, searchVal, clipboardOptions, handleAutoPaste, boxInputRef)
useKeyboard(
  boxOptions,
  res,
  select,
  scrollbar,
  searchVal,
  handleExecute,
  handleExit,
  computed(() => boxInputRef.value?.inputEl)
)
useChannel(boxOptions, res)

function handleTogglePin(): void {
  appSetting.tools.autoHide = !appSetting.tools.autoHide
}

const addon = computed(() => {
  if (!activeItem.value) return

  const item = activeItem.value

  if (item.kind === 'file') {
    return 'preview'
  }

  return
})
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div class="CoreBox" @paste="handlePaste">
    <PrefixPart
      :providers="activatedProviders"
      :feature="boxOptions.data?.feature"
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
      <RemixIcon
        :style="appSetting.tools.autoHide ? 'line' : 'fill'"
        name="pushpin-2"
        @click="handleTogglePin"
      />
    </div>
  </div>

  <div class="CoreBoxRes flex">
    <TouchScroll ref="scrollbar" class="scroll-area" :class="{ compressed: !!addon }">
      <CoreBoxRender
        v-for="(item, index) in res"
        :key="index"
        :active="boxOptions.focus === index"
        :item="item"
        @trigger="handleExecute(item)"
        @mousemove="boxOptions.focus = index"
      />
    </TouchScroll>
    <TuffItemAddon :type="addon" :item="activeItem" />
  </div>
</template>

<style lang="scss">
.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;

  cursor: pointer;
  font-size: 1.25em;
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

  .scroll-area {
    width: 100%;
    transition: width 0.3s ease;
  }

  .scroll-area.compressed {
    width: 40%;
  }
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
