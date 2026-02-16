<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { FLAT_SELECT_KEY } from './types'
import type { TxFlatSelectValue } from './types'

defineOptions({ name: 'TxFlatSelect' })

const props = withDefaults(
  defineProps<{
    modelValue?: TxFlatSelectValue
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: TxFlatSelectValue]
  'change': [value: TxFlatSelectValue]
}>()

const isOpen = ref(false)
const isAnimating = ref(false)
const selectRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const selectedLabel = ref('')

// --- Item registration ---
interface ItemEntry {
  value: TxFlatSelectValue
  label: string
  el: HTMLElement
}

const itemEntries = ref<ItemEntry[]>([])

function rebuildOrder() {
  const root = dropdownRef.value
  if (!root) return
  const domItems = Array.from(root.querySelectorAll<HTMLElement>('.tx-flat-select-item'))
  itemEntries.value.sort((a, b) => domItems.indexOf(a.el) - domItems.indexOf(b.el))
}

function registerItem(value: TxFlatSelectValue, label: string, el: HTMLElement) {
  const idx = itemEntries.value.findIndex(e => e.value === value)
  if (idx >= 0) {
    itemEntries.value[idx] = { value, label, el }
  } else {
    itemEntries.value.push({ value, label, el })
  }
  rebuildOrder()
  if (props.modelValue === value && !selectedLabel.value) {
    selectedLabel.value = label
  }
}

function unregisterItem(value: TxFlatSelectValue) {
  const idx = itemEntries.value.findIndex(e => e.value === value)
  if (idx >= 0) itemEntries.value.splice(idx, 1)
}

// --- Value ---
const currentValue = computed({
  get: () => props.modelValue,
  set: (val: TxFlatSelectValue) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

const displayText = computed(() => selectedLabel.value || props.placeholder)

// --- Dropdown clip-path animation ---
const dropdownTop = ref('0px')
const dropdownClip = ref('inset(50% 0 50% 0 round 10px)')

function getSelectedItemRect(): { top: number, height: number } | null {
  const entry = itemEntries.value.find(e => e.value === props.modelValue)
  if (!entry?.el || !dropdownRef.value) return null
  return {
    top: entry.el.offsetTop,
    height: entry.el.offsetHeight,
  }
}

function calcClipClosed(): string {
  const rect = getSelectedItemRect()
  const total = dropdownRef.value?.scrollHeight ?? 0
  if (!rect || total === 0) {
    return 'inset(0 0 100% 0 round 10px)'
  }
  return `inset(${rect.top}px 0 ${total - rect.top - rect.height}px 0 round 10px)`
}

function open() {
  if (props.disabled || isOpen.value) return

  const rect = getSelectedItemRect()
  // Position dropdown so selected item overlaps the trigger
  dropdownTop.value = rect ? `-${rect.top}px` : '0px'
  // Start clipped to selected item area
  dropdownClip.value = calcClipClosed()
  isOpen.value = true

  // Animate to fully open
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isAnimating.value = true
      dropdownClip.value = 'inset(0 0 0 0 round 10px)'
    })
  })
}

function close() {
  if (!isOpen.value) return

  isAnimating.value = true
  dropdownClip.value = calcClipClosed()

  setTimeout(() => {
    isOpen.value = false
    isAnimating.value = false
  }, 200)
}

function toggle() {
  if (isOpen.value) close()
  else open()
}

function handleSelect(value: TxFlatSelectValue, label: string) {
  currentValue.value = value
  selectedLabel.value = label
  close()
}

// --- Outside click & keyboard ---
function handleClickOutside(event: MouseEvent) {
  if (!isOpen.value) return
  const target = event.target as Node | null
  if (target && selectRef.value && !selectRef.value.contains(target))
    close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  // Arrow navigation
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const entries = itemEntries.value.filter(e => !e.el.hasAttribute('disabled'))
    if (entries.length === 0) return

    const currentIdx = entries.findIndex(e => e.value === props.modelValue)
    let nextIdx: number
    if (event.key === 'ArrowDown') {
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % entries.length
    } else {
      nextIdx = currentIdx < 0 ? entries.length - 1 : (currentIdx - 1 + entries.length) % entries.length
    }
    const next = entries[nextIdx]
    currentValue.value = next.value
    selectedLabel.value = next.label
  }
}

// --- Provide ---
provide(FLAT_SELECT_KEY, {
  currentValue,
  isOpen,
  handleSelect,
  registerItem,
  unregisterItem,
})

// --- Watchers ---
watch(
  () => props.modelValue,
  (val) => {
    const entry = itemEntries.value.find(e => e.value === val)
    if (entry) selectedLabel.value = entry.label
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    ref="selectRef"
    class="tx-flat-select"
    :class="{
      'is-open': isOpen,
      'is-disabled': disabled,
    }"
  >
    <button
      type="button"
      class="tx-flat-select__trigger"
      :disabled="disabled"
      @click="toggle"
    >
      <span
        class="tx-flat-select__text"
        :class="{ 'is-placeholder': !selectedLabel }"
      >
        {{ displayText }}
      </span>
      <span class="tx-flat-select__arrow">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z" />
        </svg>
      </span>
    </button>

    <!-- ComboBox dropdown: always rendered, clip-path controls visibility -->
    <div
      ref="dropdownRef"
      class="tx-flat-select__dropdown"
      :class="{
        'is-visible': isOpen,
        'is-animating': isAnimating,
      }"
      :style="{
        top: dropdownTop,
        clipPath: dropdownClip,
      }"
      :aria-hidden="!isOpen"
    >
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-flat-select {
  position: relative;
  display: inline-block;
  min-width: 120px;

  &__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--tx-border-color-light, var(--el-border-color-light, #e4e7ed));
    border-radius: 10px;
    background: var(--tx-bg-color, var(--el-bg-color, #fff));
    color: var(--tx-text-color-primary, var(--el-text-color-primary, #303133));
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    box-sizing: border-box;
    position: relative;
    z-index: 2;

    &:hover:not(:disabled) {
      border-color: var(--tx-border-color, var(--el-border-color, #dcdfe6));
    }

    &:focus-visible {
      border-color: var(--tx-color-primary, var(--el-color-primary, #409eff));
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, var(--el-color-primary, #409eff)) 15%, transparent);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__text {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-placeholder {
      color: var(--tx-text-color-placeholder, var(--el-text-color-placeholder, #a8abb2));
    }
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    color: var(--tx-text-color-secondary, var(--el-text-color-secondary, #909399));
    flex-shrink: 0;
  }

  &__dropdown {
    position: absolute;
    left: 0;
    width: 100%;
    z-index: 3;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--tx-bg-color-overlay, var(--el-bg-color-overlay, #fff));
    border: 1px solid var(--tx-border-color-lighter, var(--el-border-color-lighter, #ebeef5));
    border-radius: 10px;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.04);
    box-sizing: border-box;
    gap: 2px;

    // Hidden by default
    visibility: hidden;
    pointer-events: none;

    &.is-visible {
      visibility: visible;
      pointer-events: auto;
    }

    &.is-animating {
      transition: clip-path 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
  }
}
</style>
