<script setup lang="ts">
import type { TxIconSource } from '../../icon/src/types'
import type { IconPickerEntry, IconPickerLabels, IconPickerProps, IconPickerShape } from './types'
import { computed, ref, watch } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import { formatIconIdentifier, parseIconIdentifier } from './identifier'
import TxIconPickerPanel from './TxIconPickerPanel.vue'

defineOptions({ name: 'TxIconPicker' })

const props = withDefaults(defineProps<IconPickerProps>(), {
  modelValue: '',
  shape: 'rounded',
  sections: () => ['emoji', 'icon', 'brand', 'file'],
  catalog: undefined,
  shapeSelectable: true,
  fileChooser: undefined,
  accept: 'image/*',
  disabled: false,
  size: 44,
  placeholder: '',
  inline: false,
  labels: undefined,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:shape', value: IconPickerShape): void
  (e: 'change', value: string): void
  (e: 'file-error', error: unknown): void
}>()

const DEFAULT_LABELS: IconPickerLabels = {
  emoji: 'Emoji',
  icon: 'Icons',
  brand: 'Brands',
  file: 'File',
  search: 'Search icons',
  empty: 'No matching icon',
  clear: 'Clear',
  chooseFile: 'Choose local file',
  shape: 'Shape',
  shapeCircle: 'Circle',
  shapeRounded: 'Rounded',
  shapeSquare: 'Square',
}

const labels = computed<IconPickerLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }))

const open = ref(false)
const fileBusy = ref(false)
const panel = ref<InstanceType<typeof TxIconPickerPanel> | null>(null)

const selected = computed<TxIconSource | null>(() => parseIconIdentifier(props.modelValue))

const triggerStyle = computed(() => ({ '--tx-icon-picker-size': `${props.size}px` }))

function commit(identifier: string): void {
  if (identifier === props.modelValue)
    return
  emit('update:modelValue', identifier)
  emit('change', identifier)
}

function selectEntry(entry: IconPickerEntry): void {
  commit(entry.id)
  if (!props.inline)
    open.value = false
}

function selectShape(shape: IconPickerShape): void {
  if (shape !== props.shape)
    emit('update:shape', shape)
}

async function chooseFile(): Promise<void> {
  if (props.disabled || fileBusy.value || !props.fileChooser)
    return

  fileBusy.value = true
  try {
    const path = await props.fileChooser()
    if (path)
      commit(formatIconIdentifier({ type: 'file', value: path }))
  }
  catch (error) {
    emit('file-error', error)
  }
  finally {
    fileBusy.value = false
  }
}

/**
 * The no-host-chooser path. Its result is a data URL, typed `url` rather than
 * `file`: a browser never hands out a path, and typing it `file` would produce
 * an identifier whose value cannot be resolved by anything.
 */
function readFile(file: File): void {
  fileBusy.value = true
  const reader = new FileReader()
  reader.onload = () => {
    fileBusy.value = false
    const result = typeof reader.result === 'string' ? reader.result : ''
    if (result)
      commit(formatIconIdentifier({ type: 'url', value: result }))
  }
  reader.onerror = () => {
    fileBusy.value = false
    emit('file-error', reader.error)
  }
  reader.readAsDataURL(file)
}

// Reopening onto the previous query shows a filtered grid the user did not ask
// for and has to notice before clearing.
watch(open, (value) => {
  if (!value)
    panel.value?.resetQuery()
})

defineExpose({
  /** Opens or closes the panel. No-op when `inline`. */
  toggle: (value?: boolean) => {
    open.value = typeof value === 'boolean' ? value : !open.value
  },
})
</script>

<template>
  <TxIconPickerPanel
    v-if="inline"
    ref="panel"
    class="tx-icon-picker is-inline"
    :model-value="modelValue"
    :shape="shape"
    :sections="sections"
    :catalog="catalog"
    :shape-selectable="shapeSelectable"
    :labels="labels"
    :disabled="disabled"
    :accept="accept"
    :has-file-chooser="Boolean(fileChooser)"
    :file-busy="fileBusy"
    @select="selectEntry"
    @select-shape="selectShape"
    @choose-file="chooseFile"
    @pick-file="readFile"
    @clear="commit('')"
  />

  <TxPopover
    v-else
    v-model="open"
    class="tx-icon-picker"
    :disabled="disabled"
    placement="bottom-start"
    :width="312"
    :max-width="312"
    :max-height="460"
    :panel-padding="0"
    :show-arrow="false"
  >
    <template #reference>
      <button
        type="button"
        class="tx-icon-picker__trigger"
        :class="[`is-${shape}`, { 'is-empty': !selected }]"
        :style="triggerStyle"
        :disabled="disabled"
        :aria-label="placeholder || labels.search"
        :aria-expanded="open"
      >
        <TxIcon
          v-if="selected"
          :icon="selected"
          :size="Math.round(size * 0.55)"
          colorful
        />
        <i v-else class="i-ri-image-add-line tx-icon-picker__trigger-empty" aria-hidden="true" />
      </button>
    </template>

    <TxIconPickerPanel
      ref="panel"
      :model-value="modelValue"
      :shape="shape"
      :sections="sections"
      :catalog="catalog"
      :shape-selectable="shapeSelectable"
      :labels="labels"
      :disabled="disabled"
      :accept="accept"
      :has-file-chooser="Boolean(fileChooser)"
      :file-busy="fileBusy"
      @select="selectEntry"
      @select-shape="selectShape"
      @choose-file="chooseFile"
      @pick-file="readFile"
      @clear="commit('')"
    />
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-icon-picker.is-inline {
  display: block;
  width: 100%;
}

.tx-icon-picker__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: var(--tx-icon-picker-size, 44px);
  height: var(--tx-icon-picker-size, 44px);

  padding: 0;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  // The plate shape is the thing the shape row edits, so the corner is the one
  // property that must be seen changing — snapping 4px to 999px in a single
  // frame reads as the trigger being swapped out, not reshaped. Same overshoot
  // curve as the row's own thumb, so press and result are one gesture.
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    border-radius 0.28s cubic-bezier(0.32, 1.28, 0.5, 1);

  &.is-circle { border-radius: 999px; }
  &.is-rounded { border-radius: 12px; }
  &.is-square { border-radius: 4px; }

  &:hover:not(:disabled) {
    border-color: var(--tx-color-primary, #409eff);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

// The shape still changes — it is the committed value. Only the morph goes.
@media (prefers-reduced-motion: reduce) {
  .tx-icon-picker__trigger {
    transition: border-color 0.2s ease, background 0.2s ease;
  }
}

.tx-icon-picker__trigger.is-empty {
  border-style: dashed;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-icon-picker__trigger-empty {
  font-size: 18px;
}
</style>
