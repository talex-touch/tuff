<script setup lang="ts">
import type { AvatarEditorLabels } from './types'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorIcon from './AvatarEditorIcon.vue'

defineOptions({ name: 'AvatarEditorToolbar' })

defineProps<{
  labels: AvatarEditorLabels
  flipX: boolean
  flipY: boolean
  exporting: boolean
}>()

const emit = defineEmits<{
  'rotate': [deltaDeg: number]
  'flip-x': []
  'flip-y': []
  'fit-contain': []
  'fit-cover': []
  'reset': []
  'replace': []
}>()
</script>

<template>
  <div class="tx-avatar-editor__toolbar">
    <TxTooltip :content="labels.rotateLeft">
      <button type="button" class="tx-avatar-editor__tool-btn" :aria-label="labels.rotateLeft" @click="emit('rotate', -90)">
        <AvatarEditorIcon name="rotateLeft" />
      </button>
    </TxTooltip>
    <TxTooltip :content="labels.rotateRight">
      <button type="button" class="tx-avatar-editor__tool-btn" :aria-label="labels.rotateRight" @click="emit('rotate', 90)">
        <AvatarEditorIcon name="rotateRight" />
      </button>
    </TxTooltip>
    <TxTooltip :content="labels.flipHorizontal">
      <button type="button" class="tx-avatar-editor__tool-btn" :class="{ 'is-active': flipX }" :aria-pressed="flipX" :aria-label="labels.flipHorizontal" @click="emit('flip-x')">
        <AvatarEditorIcon name="flipH" />
      </button>
    </TxTooltip>
    <TxTooltip :content="labels.flipVertical">
      <button type="button" class="tx-avatar-editor__tool-btn" :class="{ 'is-active': flipY }" :aria-pressed="flipY" :aria-label="labels.flipVertical" @click="emit('flip-y')">
        <AvatarEditorIcon name="flipV" />
      </button>
    </TxTooltip>
    <span class="tx-avatar-editor__tool-sep" aria-hidden="true" />
    <TxTooltip :content="labels.fitContain">
      <button type="button" class="tx-avatar-editor__tool-btn" :aria-label="labels.fitContain" @click="emit('fit-contain')">
        <AvatarEditorIcon name="fitContain" />
      </button>
    </TxTooltip>
    <TxTooltip :content="labels.fitCover">
      <button type="button" class="tx-avatar-editor__tool-btn" :aria-label="labels.fitCover" @click="emit('fit-cover')">
        <AvatarEditorIcon name="fitCover" />
      </button>
    </TxTooltip>
    <TxTooltip :content="labels.reset">
      <button type="button" class="tx-avatar-editor__tool-btn" :aria-label="labels.reset" @click="emit('reset')">
        <AvatarEditorIcon name="reset" />
      </button>
    </TxTooltip>
    <span class="tx-avatar-editor__tool-spacer" aria-hidden="true" />
    <TxTooltip :content="labels.replaceFile">
      <button
        type="button"
        class="tx-avatar-editor__tool-btn"
        :aria-label="labels.replaceFile"
        :disabled="exporting"
        @click="emit('replace')"
      >
        <AvatarEditorIcon name="upload" :size="15" />
      </button>
    </TxTooltip>
  </div>
</template>

<style lang="scss">
.tx-avatar-editor__toolbar {
  gap: 4px;
}

.tx-avatar-editor__tool-btn {
  cursor: pointer;
}

.tx-avatar-editor__tool-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--a-l);
}

.tx-avatar-editor__tool-spacer {
  flex: 1;
}
</style>
