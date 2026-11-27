<script setup lang="ts">
import type { AvatarCaptureMode, AvatarEditorLabels } from './types'
import AvatarEditorIcon from './AvatarEditorIcon.vue'

defineOptions({ name: 'AvatarEditorTimeline' })

const props = defineProps<{
  labels: AvatarEditorLabels
  isGif: boolean
  gifFrameCount: number
  gifFrameIndex: number
  videoTime: number
  duration: number
  isPlaying: boolean
  captureMode: AvatarCaptureMode
  canExportAnimatedGif: boolean
  isAnimatedGifExport: boolean
  clipStart: number
  clipEnd: number
  clipFps: number
  timelineText: string
}>()

const emit = defineEmits<{
  'select-mode': [mode: AvatarCaptureMode]
  'toggle-playback': []
  'step-frame': [delta: number]
  'scrub': [value: number]
  'update-clip-range': [which: 'start' | 'end', value: number]
  'update-clip-fps': [fps: number]
}>()

const GIF_FPS_PRESETS = [6, 10, 12, 15] as const
</script>

<template>
  <div class="tx-avatar-editor__timeline">
    <div class="tx-avatar-editor__timeline-head">
      <span class="tx-avatar-editor__section-label">{{ labels.timeline }}</span>
      <div v-if="canExportAnimatedGif" class="tx-avatar-editor__segmented">
        <button
          type="button"
          class="tx-avatar-editor__seg-btn"
          :class="{ 'is-active': captureMode === 'frame' }"
          :aria-pressed="captureMode === 'frame'"
          @click="emit('select-mode', 'frame')"
        >
          {{ labels.captureFrame }}
        </button>
        <button
          type="button"
          class="tx-avatar-editor__seg-btn"
          :class="{ 'is-active': captureMode === 'gif-clip' }"
          :aria-pressed="captureMode === 'gif-clip'"
          @click="emit('select-mode', 'gif-clip')"
        >
          {{ labels.captureGifClip }}
        </button>
      </div>
    </div>

    <div class="tx-avatar-editor__transport">
      <button
        type="button"
        class="tx-avatar-editor__mini-btn"
        :aria-label="isPlaying ? labels.pause : labels.play"
        @click="emit('toggle-playback')"
      >
        <AvatarEditorIcon :name="isPlaying ? 'pause' : 'play'" :size="14" />
      </button>
      <button
        type="button"
        class="tx-avatar-editor__mini-btn"
        :aria-label="labels.prevFrame"
        @click="emit('step-frame', -1)"
      >
        <AvatarEditorIcon name="stepBack" :size="14" />
      </button>
      <input
        v-if="isGif"
        type="range"
        class="tx-avatar-editor__range tx-avatar-editor__range--grow"
        :min="0"
        :max="Math.max(0, gifFrameCount - 1)"
        :step="1"
        :value="gifFrameIndex"
        :aria-label="labels.timeline"
        @input="emit('scrub', Number(($event.target as HTMLInputElement).value))"
      >
      <input
        v-else
        type="range"
        class="tx-avatar-editor__range tx-avatar-editor__range--grow"
        :min="0"
        :max="Math.max(0.1, duration)"
        :step="0.02"
        :value="videoTime"
        :aria-label="labels.timeline"
        @input="emit('scrub', Number(($event.target as HTMLInputElement).value))"
      >
      <button
        type="button"
        class="tx-avatar-editor__mini-btn"
        :aria-label="labels.nextFrame"
        @click="emit('step-frame', 1)"
      >
        <AvatarEditorIcon name="stepForward" :size="14" />
      </button>
      <span class="tx-avatar-editor__readout">{{ timelineText }}</span>
    </div>

    <div v-if="isAnimatedGifExport" class="tx-avatar-editor__clip-grid">
      <label class="tx-avatar-editor__clip-field">
        <span>{{ labels.clipStart }}</span>
        <input
          type="number"
          class="tx-avatar-editor__num-input"
          :min="0"
          :max="duration"
          step="0.1"
          :value="Number(clipStart.toFixed(1))"
          @change="emit('update-clip-range', 'start', Number(($event.target as HTMLInputElement).value))"
        >
      </label>
      <label class="tx-avatar-editor__clip-field">
        <span>{{ labels.clipEnd }}</span>
        <input
          type="number"
          class="tx-avatar-editor__num-input"
          :min="0.1"
          :max="duration"
          step="0.1"
          :value="Number(clipEnd.toFixed(1))"
          @change="emit('update-clip-range', 'end', Number(($event.target as HTMLInputElement).value))"
        >
      </label>
      <div class="tx-avatar-editor__clip-fps">
        <span>{{ labels.clipFps }}</span>
        <div class="tx-avatar-editor__pills">
          <button
            v-for="fps in GIF_FPS_PRESETS"
            :key="fps"
            type="button"
            class="tx-avatar-editor__pill"
            :class="{ 'is-active': clipFps === fps }"
            @click="emit('update-clip-fps', fps)"
          >
            {{ fps }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-avatar-editor__timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
}

.tx-avatar-editor__timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-avatar-editor__transport {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tx-avatar-editor__mini-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);

  &:hover {
    background: var(--tx-fill-color, #ebedf0);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }
}

.tx-avatar-editor__clip-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-extra-light, #ebeef5);
}

.tx-avatar-editor__clip-field,
.tx-avatar-editor__clip-fps {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__num-input {
  width: 58px;
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }
}
</style>
