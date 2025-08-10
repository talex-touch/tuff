<script setup lang="ts" name="CoreBox">
import { reactive, ref } from 'vue'
import { BoxMode, IBoxOptions } from '../../modules/box/adapter'
import BoxItem from './BoxItem.vue'
import BoxInput from './BoxInput.vue'
import TagSection from './tag/TagSection.vue'
import { appSetting } from '~/modules/channel/storage'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import PrefixIcon from './PrefixIcon.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import { useCoreBox } from '@renderer/modules/hooks/core-box'

import { useClipboard } from '../../modules/box/adapter/hooks/useClipboard'
import { useVisibility } from '../../modules/box/adapter/hooks/useVisibility'
import { useKeyboard } from '../../modules/box/adapter/hooks/useKeyboard'
import { useSearch } from '../../modules/box/adapter/hooks/useSearch'
import { useChannel } from '../../modules/box/adapter/hooks/useChannel'

useCoreBox()

const scrollbar = ref()
const boxOptions = reactive<IBoxOptions>({
  lastHidden: -1,
  mode: BoxMode.INPUT,
  focus: 0,
  file: { buffer: null, paths: [] },
  data: {}
})

const { searchVal, select, res, activeItem, handleExecute, handleExit } = useSearch(boxOptions)
const { clipboardOptions, handlePaste, handleAutoPaste } = useClipboard(boxOptions, searchVal)

// useVisibility(boxOptions, searchVal, clipboardOptions, handleAutoPaste)
// useKeyboard(boxOptions, res, select, scrollbar, handleExecute, handleExit)
// useChannel(boxOptions, res)

function handleTogglePin(): void {
  appSetting.tools.autoHide = !appSetting.tools.autoHide
}
</script>

<template>
  <teleport to="body">
    <div class="CoreBox-Mask" />
  </teleport>

  <div class="CoreBox" @paste="handlePaste">
    <div class="CoreBox-Icon">
      <PrefixIcon :feature="boxOptions.data?.feature" @close="handleExit" />
    </div>

    <BoxInput v-model="searchVal" :box-options="boxOptions">
      <template
        v-if="searchVal.trim() && activeItem && boxOptions.mode !== BoxMode.FEATURE"
        #completion
      >
        {{ activeItem?.name }}
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

  <div class="CoreBoxRes">
    <TouchScroll ref="scrollbar">
      <BoxItem
        v-for="(item, index) in res"
        :key="index"
        :i="index + 1"
        :active="boxOptions.focus === index"
        :data="item"
        :selected="select === index"
        @click="handleExecute(item)"
        @mousemove="boxOptions.focus = index"
      />
    </TouchScroll>
  </div>
</template>

<style lang="scss">
.CoreBox-Configure {
  display: flex;
  padding: 0 0.5rem;

  cursor: pointer;
  font-size: 1.25em;
}

.CoreBox-Icon {
  position: relative;

  user-select: none;

  img {
    width: 52px;
    height: 52px;
  }
}

div.CoreBoxRes {
  position: absolute;
  display: none;

  flex-direction: column;

  top: 60px;

  width: 100%;
  height: calc(100% - 60px);

  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--el-border-color);

  .core-box & {
    display: flex;
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

  opacity: 0.25;
  background-color: var(--el-bg-color);
}
</style>
