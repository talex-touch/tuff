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
  display: flex;
  align-items: center;
  gap: 4px;
}

.tx-avatar-editor__tool-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
  transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(:disabled) {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active:not(:disabled) {
    transform: scale(0.93);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__tool-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--tx-border-color-lighter, #e4e7ed);
}

.tx-avatar-editor__tool-spacer {
  flex: 1;
}
</style>
