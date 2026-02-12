<script setup lang="ts">
import type { CanvasAreaOption, CanvasConfig, CanvasItem } from './canvas-types'
import { TxButton, TxStatusBadge } from '@talex-touch/tuffex'
import { useFlip } from '@talex-touch/tuffex/utils'
import { computed, ref, watch, type Ref } from 'vue'
import { moveItem, normalizeCanvasConfig } from './canvas-types'

const props = withDefaults(
  defineProps<{
    modelValue: CanvasConfig
    defaultConfig: CanvasConfig
    title: string
    description: string
    areas: CanvasAreaOption[]
    betaTag?: string
  }>(),
  {
    betaTag: 'Beta'
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: CanvasConfig): void
}>()

const canvasRef = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
const selectedId = ref<string>('')
const dragId = ref<string>('')
const dragPreview = ref<{ x: number; y: number; valid: boolean } | null>(null)

const { flip } = useFlip(canvasRef as unknown as Parameters<typeof useFlip>[0], {
  mode: 'transform',
  duration: 220,
  easing: 'cubic-bezier(0.2, 0, 0, 1)'
})

function cloneConfig(config: CanvasConfig): CanvasConfig {
  return JSON.parse(JSON.stringify(config)) as CanvasConfig
}

const localConfig = ref<CanvasConfig>(normalizeCanvasConfig(cloneConfig(props.modelValue)))

watch(
  () => props.modelValue,
  (next) => {
    localConfig.value = normalizeCanvasConfig(cloneConfig(next))
    if (!selectedId.value && localConfig.value.items.length > 0) {
      selectedId.value = localConfig.value.items[0]!.id
    }
  },
  { deep: true, immediate: true }
)

const columns = computed(() => Math.max(4, localConfig.value.columns))

const selectedItem = computed(
  () => localConfig.value.items.find((item) => item.id === selectedId.value) ?? null
)

const areaLabelMap = computed<Record<string, string>>(() => {
  return props.areas.reduce<Record<string, string>>((acc, area) => {
    acc[area.area] = area.label
    return acc
  }, {})
})

const canvasStyle = computed(() => ({
  '--canvas-columns': String(columns.value),
  '--canvas-row-height': `${localConfig.value.rowHeight}px`,
  '--canvas-gap': `${localConfig.value.gap}px`
}))

function emitConfig(next: CanvasConfig): void {
  localConfig.value = normalizeCanvasConfig(next)
  emit('update:modelValue', cloneConfig(localConfig.value))
}

function updateConfig(patch: Partial<CanvasConfig>): void {
  emitConfig({ ...localConfig.value, ...patch })
}

function updateItem(itemId: string, patch: Partial<CanvasItem>): boolean {
  const result = moveItem(localConfig.value.items, itemId, patch, columns.value)
  if (!result.valid) {
    return false
  }
  emitConfig({ ...localConfig.value, items: result.items })
  return true
}

function resetToDefault(): void {
  emitConfig(cloneConfig(props.defaultConfig))
  selectedId.value = props.defaultConfig.items[0]?.id ?? ''
}

function getItemStyle(item: CanvasItem): Record<string, string | number> {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
    display: item.visible === false ? 'none' : 'flex'
  }
}

function getDropCell(event: DragEvent): { x: number; y: number } | null {
  const host = canvasRef.value
  if (!host) return null

  const rect = host.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  const colWidth = rect.width / columns.value
  const x = Math.max(0, Math.floor((event.clientX - rect.left) / colWidth))
  const y = Math.max(0, Math.floor((event.clientY - rect.top) / localConfig.value.rowHeight))

  return { x, y }
}

function handleDragStart(item: CanvasItem): void {
  dragId.value = item.id
  selectedId.value = item.id
}

function handleCanvasDragOver(event: DragEvent): void {
  if (!dragId.value) return

  event.preventDefault()
  const cell = getDropCell(event)
  if (!cell) return

  const result = moveItem(localConfig.value.items, dragId.value, cell, columns.value)
  dragPreview.value = {
    x: cell.x,
    y: cell.y,
    valid: result.valid
  }
}

async function handleCanvasDrop(event: DragEvent): Promise<void> {
  if (!dragId.value) return

  event.preventDefault()
  const cell = getDropCell(event)
  if (!cell) {
    dragPreview.value = null
    dragId.value = ''
    return
  }

  const itemId = dragId.value
  dragPreview.value = null
  dragId.value = ''

  await flip(async () => {
    updateItem(itemId, cell)
  })
}

function handleDragEnd(): void {
  dragPreview.value = null
  dragId.value = ''
}

function handleSelectedNumberChange(key: 'x' | 'y' | 'w' | 'h', value: number): void {
  const item = selectedItem.value
  if (!item) return

  updateItem(item.id, { [key]: Number(value) } as Partial<CanvasItem>)
}

function setItemVisibility(itemId: string, visible: boolean): void {
  updateItem(itemId, { visible })
}
</script>

<template>
  <div class="CanvasGridEditor">
    <div class="CanvasGridEditor-Header">
      <div class="CanvasGridEditor-HeaderText">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <div class="CanvasGridEditor-HeaderActions">
        <TxStatusBadge :text="betaTag" status="warning" size="sm" />
        <TxButton variant="bare" class="CanvasGridEditor-ResetBtn" @click="resetToDefault">
          Reset
        </TxButton>
      </div>
    </div>

    <div class="CanvasGridEditor-Body">
      <div class="CanvasGridEditor-CanvasWrap">
        <div
          ref="canvasRef"
          class="CanvasGridEditor-Canvas"
          :style="canvasStyle"
          @dragover="handleCanvasDragOver"
          @drop="handleCanvasDrop"
        >
          <div
            v-for="item in localConfig.items"
            :key="item.id"
            class="CanvasGridEditor-Item"
            :class="{
              active: selectedId === item.id,
              dragging: dragId === item.id,
              invalid: dragId === item.id && dragPreview && dragPreview.valid === false
            }"
            :style="getItemStyle(item)"
            draggable="true"
            @click="selectedId = item.id"
            @dragstart="handleDragStart(item)"
            @dragend="handleDragEnd"
          >
            <strong>{{ areaLabelMap[item.area] || item.area }}</strong>
            <span>{{ item.w }} x {{ item.h }}</span>
          </div>
        </div>
      </div>

      <div class="CanvasGridEditor-Panel">
        <section class="CanvasGridEditor-PanelSection">
          <h4>Canvas</h4>
          <label>
            <span>Enabled</span>
            <input
              type="checkbox"
              :checked="localConfig.enabled"
              @change="updateConfig({ enabled: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <label>
            <span>Columns</span>
            <input
              type="range"
              min="4"
              max="24"
              :value="localConfig.columns"
              @input="updateConfig({ columns: Number(($event.target as HTMLInputElement).value) })"
            />
            <em>{{ localConfig.columns }}</em>
          </label>
          <label>
            <span>Row Height</span>
            <input
              type="range"
              min="12"
              max="64"
              :value="localConfig.rowHeight"
              @input="
                updateConfig({ rowHeight: Number(($event.target as HTMLInputElement).value) })
              "
            />
            <em>{{ localConfig.rowHeight }}</em>
          </label>
          <label>
            <span>Gap</span>
            <input
              type="range"
              min="0"
              max="24"
              :value="localConfig.gap"
              @input="updateConfig({ gap: Number(($event.target as HTMLInputElement).value) })"
            />
            <em>{{ localConfig.gap }}</em>
          </label>
        </section>

        <section v-if="selectedItem" class="CanvasGridEditor-PanelSection">
          <h4>Item</h4>
          <p>{{ areaLabelMap[selectedItem.area] || selectedItem.area }}</p>
          <label>
            <span>Visible</span>
            <input
              type="checkbox"
              :checked="selectedItem.visible !== false"
              @change="
                setItemVisibility(selectedItem.id, ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <label>
            <span>X</span>
            <input
              type="range"
              min="0"
              :max="Math.max(0, columns - selectedItem.w)"
              :value="selectedItem.x"
              @input="
                handleSelectedNumberChange('x', Number(($event.target as HTMLInputElement).value))
              "
            />
            <em>{{ selectedItem.x }}</em>
          </label>
          <label>
            <span>Y</span>
            <input
              type="range"
              min="0"
              max="24"
              :value="selectedItem.y"
              @input="
                handleSelectedNumberChange('y', Number(($event.target as HTMLInputElement).value))
              "
            />
            <em>{{ selectedItem.y }}</em>
          </label>
          <label>
            <span>W</span>
            <input
              type="range"
              :min="selectedItem.minW ?? 1"
              :max="selectedItem.maxW ?? columns"
              :value="selectedItem.w"
              @input="
                handleSelectedNumberChange('w', Number(($event.target as HTMLInputElement).value))
              "
            />
            <em>{{ selectedItem.w }}</em>
          </label>
          <label>
            <span>H</span>
            <input
              type="range"
              :min="selectedItem.minH ?? 1"
              :max="selectedItem.maxH ?? 16"
              :value="selectedItem.h"
              @input="
                handleSelectedNumberChange('h', Number(($event.target as HTMLInputElement).value))
              "
            />
            <em>{{ selectedItem.h }}</em>
          </label>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.CanvasGridEditor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.CanvasGridEditor-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.CanvasGridEditor-HeaderActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.CanvasGridEditor-ResetBtn {
  font-size: 12px;
}

.CanvasGridEditor-Body {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 12px;
}

.CanvasGridEditor-CanvasWrap {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);
  padding: 12px;
  min-height: 0;
  overflow: auto;
}

.CanvasGridEditor-Canvas {
  display: grid;
  grid-template-columns: repeat(var(--canvas-columns), minmax(0, 1fr));
  grid-auto-rows: var(--canvas-row-height);
  gap: var(--canvas-gap);
  min-height: 320px;
  background-image:
    linear-gradient(
      to right,
      color-mix(in srgb, var(--el-border-color-lighter) 70%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--el-border-color-lighter) 70%, transparent) 1px,
      transparent 1px
    );
  background-size: calc(100% / var(--canvas-columns)) var(--canvas-row-height);
}

.CanvasGridEditor-Item {
  user-select: none;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: color-mix(in srgb, var(--el-color-primary-light-9) 35%, var(--el-bg-color));
  padding: 6px 8px;
  cursor: grab;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  strong {
    font-size: 12px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    text-transform: capitalize;
  }

  span {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  &.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  }

  &.dragging {
    opacity: 0.45;
  }

  &.invalid {
    border-color: var(--el-color-danger);
  }
}

.CanvasGridEditor-Panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color-overlay);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}

.CanvasGridEditor-PanelSection {
  display: flex;
  flex-direction: column;
  gap: 8px;

  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-transform: capitalize;
  }

  label {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr) 28px;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--el-text-color-secondary);

    input[type='checkbox'] {
      justify-self: start;
    }

    em {
      font-style: normal;
      text-align: right;
      font-size: 11px;
      color: var(--el-text-color-primary);
    }
  }
}

@media (max-width: 1280px) {
  .CanvasGridEditor-Body {
    grid-template-columns: 1fr;
  }
}
</style>
