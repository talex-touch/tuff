<script setup lang="ts">
import type { GlideOption } from './AvatarEditorGlideGroup.vue'
import type { AvatarCaptureMode, AvatarEditorLabels } from './types'
import { computed, ref } from 'vue'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorGlideGroup from './AvatarEditorGlideGroup.vue'
import AvatarEditorIcon from './AvatarEditorIcon.vue'
import AvatarEditorSlider from './AvatarEditorSlider.vue'

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

const GIF_FPS_OPTIONS: readonly GlideOption<number>[] = [6, 10, 12, 15].map(fps => ({
  value: fps,
  label: String(fps),
  ariaLabel: `${fps} fps`,
}))

const modeOptions = computed<GlideOption<AvatarCaptureMode>[]>(() => [
  { value: 'frame', icon: 'image', label: props.labels.captureFrame },
  { value: 'gif-clip', icon: 'film', label: props.labels.captureGifClip },
])

const trimTrackRef = ref<HTMLElement | null>(null)
const draggingHandle = ref<'start' | 'end' | null>(null)

const safeDuration = computed(() => Math.max(0.1, props.duration || 1))
const startPct = computed(() => Math.max(0, Math.min(100, (props.clipStart / safeDuration.value) * 100)))
const endPct = computed(() => Math.max(startPct.value, Math.min(100, (props.clipEnd / safeDuration.value) * 100)))

const playheadPct = computed(() => {
  if (props.isGif) {
    const maxIdx = Math.max(1, props.gifFrameCount - 1)
    return Math.max(0, Math.min(100, (props.gifFrameIndex / maxIdx) * 100))
  }
  return Math.max(0, Math.min(100, (props.videoTime / safeDuration.value) * 100))
})

function updateHandleFromClientX(which: 'start' | 'end', clientX: number): void {
  const track = trimTrackRef.value
  if (!track)
    return
  const rect = track.getBoundingClientRect()
  if (rect.width <= 0)
    return
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  emit('update-clip-range', which, Number((ratio * safeDuration.value).toFixed(2)))
}

function onHandlePointerDown(which: 'start' | 'end', ev: PointerEvent): void {
  ev.preventDefault()
  draggingHandle.value = which
  ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
  updateHandleFromClientX(which, ev.clientX)
}

function onHandlePointerMove(ev: PointerEvent): void {
  if (!draggingHandle.value)
    return
  updateHandleFromClientX(draggingHandle.value, ev.clientX)
}

function onHandlePointerUp(): void {
  draggingHandle.value = null
}

function onHandleKeydown(which: 'start' | 'end', ev: KeyboardEvent): void {
  const step = ev.shiftKey ? 0.5 : 0.1
  if (ev.key === 'ArrowLeft') {
    ev.preventDefault()
    emit('update-clip-range', which, (which === 'start' ? props.clipStart : props.clipEnd) - step)
  }
  else if (ev.key === 'ArrowRight') {
    ev.preventDefault()
    emit('update-clip-range', which, (which === 'start' ? props.clipStart : props.clipEnd) + step)
  }
}
</script>

<template>
  <div class="tx-avatar-editor__timeline">
    <div class="tx-avatar-editor__timeline-head">
      <AvatarEditorGlideGroup
        v-if="canExportAnimatedGif"
        :model-value="captureMode"
        :options="modeOptions"
        compact
        :aria-label="labels.timeline"
        @update:model-value="emit('select-mode', $event as AvatarCaptureMode)"
      />
      <span class="tx-avatar-editor__timeline-readout">{{ timelineText }}</span>
    </div>

    <div class="tx-avatar-editor__transport">
      <TxTooltip :content="isPlaying ? labels.pause : labels.play">
        <button
          type="button"
          class="tx-avatar-editor__mini-btn"
          :aria-label="isPlaying ? labels.pause : labels.play"
          @click="emit('toggle-playback')"
        >
          <AvatarEditorIcon :name="isPlaying ? 'pause' : 'play'" :size="13" />
        </button>
      </TxTooltip>
      <TxTooltip :content="labels.prevFrame">
        <button
          type="button"
          class="tx-avatar-editor__mini-btn"
          :aria-label="labels.prevFrame"
          @click="emit('step-frame', -1)"
        >
          <AvatarEditorIcon name="stepBack" :size="13" />
        </button>
      </TxTooltip>

      <div class="tx-avatar-editor__scrubber">
        <AvatarEditorSlider
          v-if="isGif"
          :label="labels.timeline"
          :model-value="gifFrameIndex"
          :min="0"
          :max="Math.max(0, gifFrameCount - 1)"
          :step="1"
          @update:model-value="emit('scrub', $event)"
        />
        <AvatarEditorSlider
          v-else
          :label="labels.timeline"
          :model-value="videoTime"
          :min="0"
          :max="safeDuration"
          :step="0.02"
          @update:model-value="emit('scrub', $event)"
        />
      </div>

      <TxTooltip :content="labels.nextFrame">
        <button
          type="button"
          class="tx-avatar-editor__mini-btn"
          :aria-label="labels.nextFrame"
          @click="emit('step-frame', 1)"
        >
          <AvatarEditorIcon name="stepForward" :size="13" />
        </button>
      </TxTooltip>
    </div>

    <!-- Visual dual-handle clip trimmer + gliding FPS selector -->
    <div v-if="isAnimatedGifExport" class="tx-avatar-editor__clip-grid">
      <div
        ref="trimTrackRef"
        class="tx-avatar-editor__trim-bar"
        @pointermove="onHandlePointerMove"
        @pointerup="onHandlePointerUp"
        @pointercancel="onHandlePointerUp"
      >
        <div
          class="tx-avatar-editor__trim-window"
          :style="{ left: `${startPct}%`, width: `${Math.max(4, endPct - startPct)}%` }"
        />
        <span class="tx-avatar-editor__trim-playhead" :style="{ left: `${playheadPct}%` }" aria-hidden="true" />
        <button
          type="button"
          class="tx-avatar-editor__trim-handle"
          :class="{ 'is-dragging': draggingHandle === 'start' }"
          :style="{ left: `${startPct}%` }"
          role="slider"
          :aria-label="labels.clipStart"
          :aria-valuemin="0"
          :aria-valuemax="safeDuration"
          :aria-valuenow="Number(clipStart.toFixed(1))"
          @pointerdown="onHandlePointerDown('start', $event)"
          @keydown="onHandleKeydown('start', $event)"
        />
        <button
          type="button"
          class="tx-avatar-editor__trim-handle"
          :class="{ 'is-dragging': draggingHandle === 'end' }"
          :style="{ left: `${endPct}%` }"
          role="slider"
          :aria-label="labels.clipEnd"
          :aria-valuemin="0"
          :aria-valuemax="safeDuration"
          :aria-valuenow="Number(clipEnd.toFixed(1))"
          @pointerdown="onHandlePointerDown('end', $event)"
          @keydown="onHandleKeydown('end', $event)"
        />
      </div>

      <div class="tx-avatar-editor__clip-meta">
        <span class="tx-avatar-editor__clip-span">{{ clipStart.toFixed(1) }}s – {{ clipEnd.toFixed(1) }}s</span>
        <div class="tx-avatar-editor__clip-fps">
          <AvatarEditorGlideGroup
            :model-value="clipFps"
            :options="GIF_FPS_OPTIONS"
            compact
            button-class="tx-avatar-editor__pill"
            :aria-label="labels.clipFps"
            @update:model-value="emit('update-clip-fps', Number($event))"
          />
          <span class="tx-avatar-editor__fps-unit">fps</span>
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
  padding: 9px 10px;
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

.tx-avatar-editor__timeline-readout {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__transport {
  display: flex;
  align-items: center;
  gap: 5px;
}

.tx-avatar-editor__scrubber {
  flex: 1;
  min-width: 0;
}

.tx-avatar-editor__mini-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
  transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover {
    background: var(--tx-fill-color, #ebedf0);
  }

  &:active {
    transform: scale(0.93);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__clip-grid {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 7px;
  border-top: 1px solid var(--tx-border-color-extra-light, #ebeef5);
}

.tx-avatar-editor__trim-bar {
  position: relative;
  height: 20px;
  margin: 0 5px;
  border-radius: 7px;
  background: var(--tx-fill-color-light, #f0f2f5);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
  touch-action: none;
  user-select: none;
}

.tx-avatar-editor__trim-window {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--tx-color-primary, #409eff);
  pointer-events: none;
}

.tx-avatar-editor__trim-playhead {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: 1px;
  transform: translateX(-50%);
  background: var(--tx-text-color-primary, #303133);
  opacity: 0.65;
  pointer-events: none;
}

.tx-avatar-editor__trim-handle {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  transform: translate(-50%, -50%) scale(1);
  background: var(--tx-color-primary, #409eff);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--tx-color-black, #000000) 22%, transparent);
  cursor: ew-resize;
  transition: transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 2px;
    height: 8px;
    border-radius: 1px;
    transform: translate(-50%, -50%);
    background: var(--tx-color-on-primary, #ffffff);
  }

  &:hover,
  &.is-dragging {
    transform: translate(-50%, -50%) scale(1.12);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__clip-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-avatar-editor__clip-span {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__clip-fps {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.tx-avatar-editor__fps-unit {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #6b7280);
}
</style>
