<script setup lang="ts">
import type { AvatarShape } from '../types'
import type { AvatarEditorLabels, AvatarEditorTransform, AvatarFormatMeta, AvatarOutputFormat } from './types'
import { ref } from 'vue'
import AvatarEditorIcon from './AvatarEditorIcon.vue'
import { AVATAR_FORMAT_META } from './types'

defineOptions({ name: 'AvatarEditorPanel' })

defineProps<{
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
}>()

const emit = defineEmits<{
  'update:shape': [shape: AvatarShape]
  'update-transform': [patch: Partial<AvatarEditorTransform>]
  'select-format': [format: AvatarOutputFormat]
  'update:export-size': [size: number]
  'update:quality': [quality: number]
  'set-preview-lg': [canvas: HTMLCanvasElement | null]
  'set-preview-sm': [canvas: HTMLCanvasElement | null]
}>()

const showAdjustments = ref(false)
const BG_SWATCHES = ['transparent', '#ffffff', '#111827', '#409eff'] as const
const SHAPES: readonly AvatarShape[] = ['circle', 'rounded', 'square']

function updateTransform(patch: Partial<AvatarEditorTransform>): void {
  emit('update-transform', patch)
}
</script>

<template>
  <div class="tx-avatar-editor__panel">
    <!-- Live multi-size preview -->
    <div class="tx-avatar-editor__preview-row">
      <div class="tx-avatar-editor__previews">
        <canvas
          :ref="el => emit('set-preview-lg', el as HTMLCanvasElement | null)"
          class="tx-avatar-editor__preview-canvas tx-avatar-editor__preview-canvas--lg"
          :class="`is-${activeShape}`"
          width="56"
          height="56"
        />
        <canvas
          :ref="el => emit('set-preview-sm', el as HTMLCanvasElement | null)"
          class="tx-avatar-editor__preview-canvas tx-avatar-editor__preview-canvas--sm"
          :class="`is-${activeShape}`"
          width="32"
          height="32"
        />
      </div>
      <div class="tx-avatar-editor__preview-meta">
        <span class="tx-avatar-editor__preview-title">{{ labels.preview }}</span>
        <span class="tx-avatar-editor__preview-sub">{{ formatCapabilityNote }}</span>
      </div>
    </div>

    <!-- Zoom & free rotation sliders -->
    <div class="tx-avatar-editor__group">
      <div class="tx-avatar-editor__slider-row">
        <span class="tx-avatar-editor__field-label">{{ labels.zoom }}</span>
        <input
          type="range"
          class="tx-avatar-editor__range tx-avatar-editor__range--grow"
          :value="transform.zoom"
          :min="minZoom"
          :max="maxZoom"
          step="0.01"
          :aria-label="labels.zoom"
          @input="updateTransform({ zoom: Number(($event.target as HTMLInputElement).value) })"
        >
        <span class="tx-avatar-editor__readout">{{ Math.round(transform.zoom * 100) }}%</span>
      </div>

      <div class="tx-avatar-editor__slider-row">
        <span class="tx-avatar-editor__field-label">{{ labels.rotation }}</span>
        <input
          type="range"
          class="tx-avatar-editor__range tx-avatar-editor__range--grow"
          :value="transform.rotation"
          min="-180"
          max="180"
          step="1"
          :aria-label="labels.rotation"
          @input="updateTransform({ rotation: Number(($event.target as HTMLInputElement).value) })"
        >
        <button
          type="button"
          class="tx-avatar-editor__readout-btn"
          :title="labels.reset"
          @click="updateTransform({ rotation: 0 })"
        >
          {{ Math.round(transform.rotation) }}°
        </button>
      </div>
    </div>

    <!-- Crop mask shape & bake alpha toggle -->
    <div class="tx-avatar-editor__group">
      <div class="tx-avatar-editor__row-between">
        <span class="tx-avatar-editor__field-label">{{ labels.shape }}</span>
        <div class="tx-avatar-editor__segmented">
          <button
            v-for="item in SHAPES"
            :key="item"
            type="button"
            class="tx-avatar-editor__seg-btn"
            :class="{ 'is-active': activeShape === item }"
            :aria-pressed="activeShape === item"
            @click="emit('update:shape', item)"
          >
            {{ item === 'circle' ? labels.shapeCircle : item === 'rounded' ? labels.shapeRounded : labels.shapeSquare }}
          </button>
        </div>
      </div>

      <label v-if="activeFormatMeta.supportsAlpha && activeShape !== 'square'" class="tx-avatar-editor__check">
        <input
          type="checkbox"
          :checked="transform.maskClip"
          @change="updateTransform({ maskClip: ($event.target as HTMLInputElement).checked })"
        >
        <span>{{ labels.maskClip }}</span>
      </label>
    </div>

    <!-- Collapsible color & background adjustments -->
    <div v-if="allowAdjustments" class="tx-avatar-editor__group">
      <button
        type="button"
        class="tx-avatar-editor__disclosure"
        :aria-expanded="showAdjustments"
        @click="showAdjustments = !showAdjustments"
      >
        <span class="tx-avatar-editor__disclosure-title">
          <AvatarEditorIcon name="sliders" :size="14" />
          <span>{{ labels.adjustments }}</span>
        </span>
        <span class="tx-avatar-editor__disclosure-state">{{ showAdjustments ? '−' : '+' }}</span>
      </button>

      <div v-if="showAdjustments" class="tx-avatar-editor__adjust-body">
        <div class="tx-avatar-editor__slider-row">
          <span class="tx-avatar-editor__field-label">{{ labels.brightness }}</span>
          <input
            type="range"
            class="tx-avatar-editor__range tx-avatar-editor__range--grow"
            :value="transform.brightness"
            min="50"
            max="150"
            step="1"
            :aria-label="labels.brightness"
            @input="updateTransform({ brightness: Number(($event.target as HTMLInputElement).value) })"
          >
          <span class="tx-avatar-editor__readout">{{ transform.brightness }}%</span>
        </div>
        <div class="tx-avatar-editor__slider-row">
          <span class="tx-avatar-editor__field-label">{{ labels.contrast }}</span>
          <input
            type="range"
            class="tx-avatar-editor__range tx-avatar-editor__range--grow"
            :value="transform.contrast"
            min="50"
            max="150"
            step="1"
            :aria-label="labels.contrast"
            @input="updateTransform({ contrast: Number(($event.target as HTMLInputElement).value) })"
          >
          <span class="tx-avatar-editor__readout">{{ transform.contrast }}%</span>
        </div>
        <div class="tx-avatar-editor__slider-row">
          <span class="tx-avatar-editor__field-label">{{ labels.saturation }}</span>
          <input
            type="range"
            class="tx-avatar-editor__range tx-avatar-editor__range--grow"
            :value="transform.saturation"
            min="0"
            max="200"
            step="1"
            :aria-label="labels.saturation"
            @input="updateTransform({ saturation: Number(($event.target as HTMLInputElement).value) })"
          >
          <span class="tx-avatar-editor__readout">{{ transform.saturation }}%</span>
        </div>
        <div class="tx-avatar-editor__row-between">
          <span class="tx-avatar-editor__field-label">{{ labels.background }}</span>
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

    <!-- Format conversion & output parameters -->
    <div class="tx-avatar-editor__group">
      <span class="tx-avatar-editor__section-label">{{ labels.outputSection }}</span>

      <div v-if="allowFormatConversion" class="tx-avatar-editor__formats">
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

      <div class="tx-avatar-editor__row-between">
        <span class="tx-avatar-editor__field-label">{{ labels.outputSize }}</span>
        <div class="tx-avatar-editor__pills">
          <button
            v-for="preset in activeSizePresets"
            :key="preset"
            type="button"
            class="tx-avatar-editor__pill"
            :class="{ 'is-active': activeExportSize === preset }"
            @click="emit('update:export-size', preset)"
          >
            {{ preset }}px
          </button>
        </div>
      </div>

      <div v-if="activeFormatMeta.lossy && !isAnimatedGifExport" class="tx-avatar-editor__slider-row">
        <span class="tx-avatar-editor__field-label">{{ labels.quality }}</span>
        <input
          type="range"
          class="tx-avatar-editor__range tx-avatar-editor__range--grow"
          min="10"
          max="100"
          step="1"
          :value="selectedQuality"
          :aria-label="labels.quality"
          @input="emit('update:quality', Number(($event.target as HTMLInputElement).value))"
        >
        <span class="tx-avatar-editor__readout">{{ selectedQuality }}%</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-avatar-editor__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.tx-avatar-editor__preview-row {
  display: flex;
  align-items: center;
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
}

.tx-avatar-editor__preview-canvas {
  display: block;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #dcdfe6);
  background: var(--tx-fill-color, #f0f2f5);

  &.tx-avatar-editor__preview-canvas--lg {
    width: 56px;
    height: 56px;
  }

  &.tx-avatar-editor__preview-canvas--sm {
    width: 32px;
    height: 32px;
  }

  &.is-circle {
    border-radius: 50%;
  }

  &.is-rounded {
    border-radius: 24%;
  }

  &.is-square {
    border-radius: 6px;
  }
}

.tx-avatar-editor__preview-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tx-avatar-editor__preview-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-avatar-editor__preview-sub {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}

.tx-avatar-editor__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--tx-border-color-extra-light, #ebeef5);
}

.tx-avatar-editor__row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-avatar-editor__field-label {
  flex-shrink: 0;
  min-width: 52px;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

.tx-avatar-editor__slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-avatar-editor__readout-btn {
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
  appearance: none;
  padding: 2px 5px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }
}

.tx-avatar-editor__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;

  input {
    accent-color: var(--tx-color-primary, #409eff);
    cursor: pointer;
  }
}

.tx-avatar-editor__disclosure {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
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
}

.tx-avatar-editor__disclosure-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tx-avatar-editor__disclosure-state {
  font-size: 14px;
  line-height: 1;
}

.tx-avatar-editor__adjust-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-avatar-editor__swatches {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
      inset 0 0 0 1px var(--tx-bg-color, #ffffff),
      0 0 0 2px var(--tx-color-primary, #409eff);
  }
}

.tx-avatar-editor__color-picker {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);

  input[type='color'] {
    position: absolute;
    inset: -4px;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    cursor: pointer;
    background: transparent;
  }
}

.tx-avatar-editor__formats {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tx-avatar-editor__format-btn {
  appearance: none;
  padding: 4px 9px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);

  &:hover:not(:disabled) {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, transparent);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }
}
</style>
