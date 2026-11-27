<script setup lang="ts">
import type { AvatarShape } from '../types'
import type { GlideOption } from './AvatarEditorGlideGroup.vue'
import type { AvatarEditorLabels, AvatarEditorTransform, AvatarFormatMeta, AvatarOutputFormat } from './types'
import { computed, ref, watch } from 'vue'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorGlideGroup from './AvatarEditorGlideGroup.vue'
import AvatarEditorIcon from './AvatarEditorIcon.vue'
import AvatarEditorSlider from './AvatarEditorSlider.vue'
import { AVATAR_FORMAT_META } from './types'

defineOptions({ name: 'AvatarEditorPanel' })

const props = defineProps<{
  labels: AvatarEditorLabels
  transform: AvatarEditorTransform
  activeShape: AvatarShape
  minZoom: number
  maxZoom: number
  allowAdjustments: boolean
  allowFormatConversion: boolean
  availableFormats: AvatarOutputFormat[]
  supportedFormats: Record<AvatarOutputFormat, boolean>
  selectedFormat: AvatarOutputFormat
  activeFormatMeta: AvatarFormatMeta
  activeSizePresets: number[]
  activeExportSize: number
  selectedQuality: number
  isAnimatedGifExport: boolean
  formatCapabilityNote: string
  sessionKey?: number
}>()

const emit = defineEmits<{
  'update:shape': [shape: AvatarShape]
  'update-transform': [patch: Partial<AvatarEditorTransform>]
  'spring-transform': [patch: Partial<AvatarEditorTransform>]
  'select-format': [format: AvatarOutputFormat]
  'update:export-size': [size: number]
  'update:quality': [quality: number]
  'set-preview-lg': [canvas: HTMLCanvasElement | null]
  'set-preview-sm': [canvas: HTMLCanvasElement | null]
}>()

const showAdjustments = ref(false)
watch(() => props.sessionKey, () => {
  showAdjustments.value = false
})
const BG_SWATCHES = ['transparent', '#ffffff', '#111827', '#409eff'] as const
const ANGLE_SNAP_POINTS = [-180, -90, 0, 90, 180] as const

const shapeOptions = computed<GlideOption<AvatarShape>[]>(() => [
  { value: 'circle', icon: 'shapeCircle', ariaLabel: props.labels.shapeCircle },
  { value: 'rounded', icon: 'shapeRounded', ariaLabel: props.labels.shapeRounded },
  { value: 'square', icon: 'shapeSquare', ariaLabel: props.labels.shapeSquare },
])

const sizeOptions = computed<GlideOption<number>[]>(() =>
  props.activeSizePresets.map(preset => ({
    value: preset,
    label: String(preset),
    ariaLabel: `${preset}px`,
  })),
)

const hasToneChanges = computed(() =>
  props.transform.brightness !== 100
  || props.transform.contrast !== 100
  || props.transform.saturation !== 100
  || props.transform.background !== 'transparent',
)

function updateTransform(patch: Partial<AvatarEditorTransform>): void {
  emit('update-transform', patch)
}

function springTransform(patch: Partial<AvatarEditorTransform>): void {
  emit('spring-transform', patch)
}
</script>

<template>
  <div class="tx-avatar-editor__panel">
    <!-- Unified visual preview + gliding icon shape & alpha strip -->
    <div class="tx-avatar-editor__preview-row">
      <div class="tx-avatar-editor__previews">
        <canvas
          :ref="el => emit('set-preview-lg', el as HTMLCanvasElement | null)"
          class="tx-avatar-editor__preview-canvas tx-avatar-editor__preview-canvas--lg"
          :class="`is-${activeShape}`"
          width="48"
          height="48"
        />
        <canvas
          :ref="el => emit('set-preview-sm', el as HTMLCanvasElement | null)"
          class="tx-avatar-editor__preview-canvas tx-avatar-editor__preview-canvas--sm"
          :class="`is-${activeShape}`"
          width="28"
          height="28"
        />
      </div>

      <div class="tx-avatar-editor__preview-right">
        <div class="tx-avatar-editor__shape-bar">
          <AvatarEditorGlideGroup
            :model-value="activeShape"
            :options="shapeOptions"
            icon-only
            :aria-label="labels.shape"
            @update:model-value="emit('update:shape', $event as AvatarShape)"
          />
          <TxTooltip v-if="activeFormatMeta.supportsAlpha && activeShape !== 'square'" :content="labels.maskClip">
            <button
              type="button"
              class="tx-avatar-editor__alpha-btn"
              :class="{ 'is-active': transform.maskClip }"
              :aria-pressed="transform.maskClip"
              :aria-label="labels.maskClip"
              @click="updateTransform({ maskClip: !transform.maskClip })"
            >
              <AvatarEditorIcon name="maskAlpha" :size="14" />
            </button>
          </TxTooltip>
        </div>
        <span class="tx-avatar-editor__preview-sub">{{ formatCapabilityNote }}</span>
      </div>
    </div>

    <!-- Silky precision zoom & angle sliders (icons replace text labels) -->
    <div class="tx-avatar-editor__group">
      <AvatarEditorSlider
        icon="zoom"
        :label="labels.zoom"
        :model-value="transform.zoom"
        :min="minZoom"
        :max="maxZoom"
        :step="0.01"
        :readout="`${Math.round(transform.zoom * 100)}%`"
        :reset-value="1"
        :reset-title="labels.reset"
        @update:model-value="updateTransform({ zoom: $event })"
        @reset="springTransform({ zoom: 1, offsetX: 0, offsetY: 0 })"
      />
      <AvatarEditorSlider
        icon="angle"
        :label="labels.rotation"
        :model-value="transform.rotation"
        :min="-180"
        :max="180"
        :step="1"
        center-origin
        :snap-points="ANGLE_SNAP_POINTS"
        :snap-threshold="4"
        :readout="`${Math.round(transform.rotation)}°`"
        :reset-value="0"
        :reset-title="labels.reset"
        @update:model-value="updateTransform({ rotation: $event })"
        @reset="springTransform({ rotation: 0 })"
      />
    </div>

    <!-- Smooth collapsible tone & backdrop drawer -->
    <div v-if="allowAdjustments" class="tx-avatar-editor__group">
      <button
        type="button"
        class="tx-avatar-editor__disclosure"
        :class="{ 'is-open': showAdjustments }"
        :aria-expanded="showAdjustments"
        @click="showAdjustments = !showAdjustments"
      >
        <span class="tx-avatar-editor__disclosure-title">
          <AvatarEditorIcon name="sliders" :size="14" />
          <span>{{ labels.adjustments }}</span>
          <span v-if="hasToneChanges" class="tx-avatar-editor__dot" aria-hidden="true" />
        </span>
        <span class="tx-avatar-editor__chevron" aria-hidden="true">
          <AvatarEditorIcon name="chevronDown" :size="14" />
        </span>
      </button>

      <div class="tx-avatar-editor__collapse" :class="{ 'is-open': showAdjustments }">
        <div class="tx-avatar-editor__collapse-inner">
          <div class="tx-avatar-editor__adjust-body">
            <AvatarEditorSlider
              icon="brightness"
              :label="labels.brightness"
              :model-value="transform.brightness"
              :min="50"
              :max="150"
              :step="1"
              center-origin
              :snap-points="[100]"
              :readout="`${transform.brightness}%`"
              :reset-value="100"
              :reset-title="labels.reset"
              @update:model-value="updateTransform({ brightness: $event })"
              @reset="updateTransform({ brightness: 100 })"
            />
            <AvatarEditorSlider
              icon="contrast"
              :label="labels.contrast"
              :model-value="transform.contrast"
              :min="50"
              :max="150"
              :step="1"
              center-origin
              :snap-points="[100]"
              :readout="`${transform.contrast}%`"
              :reset-value="100"
              :reset-title="labels.reset"
              @update:model-value="updateTransform({ contrast: $event })"
              @reset="updateTransform({ contrast: 100 })"
            />
            <AvatarEditorSlider
              icon="saturation"
              :label="labels.saturation"
              :model-value="transform.saturation"
              :min="0"
              :max="200"
              :step="1"
              center-origin
              :snap-points="[100]"
              :readout="`${transform.saturation}%`"
              :reset-value="100"
              :reset-title="labels.reset"
              @update:model-value="updateTransform({ saturation: $event })"
              @reset="updateTransform({ saturation: 100 })"
            />

            <div class="tx-avatar-editor__swatch-row">
              <TxTooltip :content="labels.background">
                <span class="tx-avatar-editor__row-icon" aria-hidden="true">
                  <AvatarEditorIcon name="palette" :size="14" />
                </span>
              </TxTooltip>
              <div class="tx-avatar-editor__swatches">
                <button
                  v-for="swatch in BG_SWATCHES"
                  :key="swatch"
                  type="button"
                  class="tx-avatar-editor__swatch"
                  :class="{ 'is-active': transform.background === swatch, 'is-transparent': swatch === 'transparent' }"
                  :style="swatch !== 'transparent' ? { backgroundColor: swatch } : undefined"
                  :aria-label="swatch === 'transparent' ? labels.transparent : swatch"
                  :title="swatch === 'transparent' ? labels.transparent : swatch"
                  @click="updateTransform({ background: swatch })"
                />
                <label class="tx-avatar-editor__color-picker" :title="labels.background">
                  <input
                    type="color"
                    :value="transform.background === 'transparent' ? '#ffffff' : transform.background"
                    :aria-label="labels.background"
                    @input="updateTransform({ background: ($event.target as HTMLInputElement).value })"
                  >
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Clean 4x2 format matrix & gliding size strip (no verbose header copy) -->
    <div class="tx-avatar-editor__group">
      <div v-if="allowFormatConversion" class="tx-avatar-editor__formats" role="group" :aria-label="labels.format">
        <button
          v-for="fmt in availableFormats"
          :key="fmt"
          type="button"
          class="tx-avatar-editor__format-btn"
          :class="{ 'is-active': selectedFormat === fmt }"
          :disabled="!supportedFormats[fmt]"
          :title="!supportedFormats[fmt] ? labels.unsupportedFormat : AVATAR_FORMAT_META[fmt].mimeType"
          @click="emit('select-format', fmt)"
        >
          {{ AVATAR_FORMAT_META[fmt].label }}
        </button>
      </div>

      <div class="tx-avatar-editor__size-row">
        <AvatarEditorGlideGroup
          :model-value="activeExportSize"
          :options="sizeOptions"
          compact
          button-class="tx-avatar-editor__pill"
          :aria-label="labels.outputSize"
          @update:model-value="emit('update:export-size', Number($event))"
        />
        <span class="tx-avatar-editor__unit">px</span>
      </div>

      <div class="tx-avatar-editor__collapse" :class="{ 'is-open': activeFormatMeta.lossy && !isAnimatedGifExport }">
        <div class="tx-avatar-editor__collapse-inner">
          <div class="tx-avatar-editor__quality-wrap">
            <AvatarEditorSlider
              icon="quality"
              :label="labels.quality"
              :model-value="selectedQuality"
              :min="10"
              :max="100"
              :step="1"
              :readout="`${selectedQuality}%`"
              :reset-value="92"
              :reset-title="labels.reset"
              @update:model-value="emit('update:quality', $event)"
              @reset="emit('update:quality', 92)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-avatar-editor__panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.tx-avatar-editor__preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
}

.tx-avatar-editor__previews {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.tx-avatar-editor__preview-canvas {
  display: block;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #dcdfe6);
  background: var(--tx-fill-color, #f0f2f5);
  transition: border-radius 260ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &.tx-avatar-editor__preview-canvas--lg {
    width: 48px;
    height: 48px;
  }

  &.tx-avatar-editor__preview-canvas--sm {
    width: 28px;
    height: 28px;
  }

  &.is-circle {
    border-radius: 50%;
  }

  &.is-rounded {
    border-radius: 24%;
  }

  &.is-square {
    border-radius: 5px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__preview-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  min-width: 0;
}

.tx-avatar-editor__shape-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tx-avatar-editor__alpha-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
  transition: transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active {
    transform: scale(0.94);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 46%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__preview-sub {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tx-avatar-editor__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--tx-border-color-extra-light, #ebeef5);
}

.tx-avatar-editor__disclosure {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 3px 2px;
  border: none;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    color: var(--tx-text-color-primary, #303133);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
    border-radius: 6px;
  }
}

.tx-avatar-editor__disclosure-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tx-avatar-editor__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tx-color-primary, #409eff);
}

.tx-avatar-editor__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #6b7280);
  transform: rotate(0deg);
  transition: transform 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__disclosure.is-open .tx-avatar-editor__chevron {
  transform: rotate(180deg);
}

.tx-avatar-editor__collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 180ms ease;

  &.is-open {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__collapse-inner {
  overflow: hidden;
  min-height: 0;
}

.tx-avatar-editor__adjust-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.tx-avatar-editor__swatch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.tx-avatar-editor__row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__swatches {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.tx-avatar-editor__swatch {
  appearance: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  transition: transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.94);
  }

  &.is-transparent {
    background-image:
      linear-gradient(45deg, var(--tx-border-color-light, #dcdfe6) 25%, transparent 25%),
      linear-gradient(-45deg, var(--tx-border-color-light, #dcdfe6) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--tx-border-color-light, #dcdfe6) 75%),
      linear-gradient(-45deg, transparent 75%, var(--tx-border-color-light, #dcdfe6) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  }

  &.is-active {
    box-shadow:
      inset 0 0 0 1.5px var(--tx-bg-color, #ffffff),
      0 0 0 2px var(--tx-color-primary, #409eff);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__color-picker {
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  background: conic-gradient(
    var(--tx-color-danger, #f56c6c),
    var(--tx-color-warning, #e6a23c),
    var(--tx-color-success, #67c23a),
    var(--tx-color-primary, #409eff),
    var(--tx-color-danger, #f56c6c)
  );
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  transition: transform 150ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover {
    transform: scale(1.1);
  }

  input[type='color'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-avatar-editor__formats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.tx-avatar-editor__format-btn {
  appearance: none;
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
  transition: transform 140ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  &:hover:not(:disabled) {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, transparent);
  }

  &:disabled {
    opacity: 0.38;
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

.tx-avatar-editor__size-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

.tx-avatar-editor__unit {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__quality-wrap {
  padding-top: 2px;
}
</style>
