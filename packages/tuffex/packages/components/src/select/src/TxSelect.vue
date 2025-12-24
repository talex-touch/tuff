<script lang="ts" setup>
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import TxSearchInput from '../../search-input/src/TxSearchInput.vue'

defineOptions({
  name: 'TuffSelect',
})

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    placeholder?: string
    disabled?: boolean
    searchable?: boolean
    searchPlaceholder?: string
    dropdownMaxHeight?: number
    dropdownOffset?: number
  }>(),
  {
    modelValue: '',
    placeholder: '请选择',
    disabled: false,
    searchable: false,
    searchPlaceholder: 'Search',
    dropdownMaxHeight: 280,
    dropdownOffset: 6,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'change': [value: string | number]
}>()

const isOpen = ref(false)
const selectRef = ref<HTMLElement | null>(null)
const selectedLabel = ref('')

const searchInputRef = ref<any>(null)
const searchQuery = ref('')

const dropdownRef = ref<HTMLElement | null>(null)
const cleanupAutoUpdate = ref<(() => void) | null>(null)

const optionLabelMap = ref(new Map<string | number, string>())

const { floatingStyles, update } = useFloating(selectRef, dropdownRef, {
  placement: 'bottom-start',
  strategy: 'fixed',
  middleware: [
    offset(() => props.dropdownOffset),
    flip({ padding: 8 }),
    shift({ padding: 8 }),
    size({
      padding: 8,
      apply({ rects, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          width: `${rects.reference.width}px`,
          maxHeight: `${Math.min(availableHeight, props.dropdownMaxHeight)}px`,
          overflowY: 'hidden',
        })
      },
    }),
  ],
})

const currentValue = computed({
  get: () => props.modelValue,
  set: (val: string | number) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function clear() {
  currentValue.value = ''
  selectedLabel.value = ''
}

function handleSelect(value: string | number, label: string) {
  currentValue.value = value
  selectedLabel.value = label
  close()
}

function registerOption(value: string | number, label: string) {
  optionLabelMap.value.set(value, label)
  if (currentValue.value === value && !selectedLabel.value) {
    selectedLabel.value = label
  }
}

function handleClickOutside(event: MouseEvent) {
  if (!isOpen.value) return

  const target = event.target as Node | null
  const inReference = !!selectRef.value && !!target && selectRef.value.contains(target)
  const inFloating = !!dropdownRef.value && !!target && dropdownRef.value.contains(target)
  if (!inReference && !inFloating) close()
}

function handleEsc(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!isOpen.value) return
  close()
}

async function updatePosition() {
  await update()
}

provide('tuffSelect', {
  currentValue,
  handleSelect,
  registerOption,
  searchQuery,
})

defineExpose({
  open: () => (isOpen.value = true),
  close,
  toggle,
  focus: () => selectRef.value?.focus?.(),
  blur: () => (selectRef.value as any)?.blur?.(),
  clear,
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEsc)
})

watch(
  () => props.modelValue,
  (val) => {
    currentValue.value = val as any
    const label = optionLabelMap.value.get(val as any)
    if (label) selectedLabel.value = label
  },
  { immediate: true }
)

watch(
  isOpen,
  async (open) => {
    if (!open) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = null
      searchQuery.value = ''
      return
    }

    await nextTick()
    await updatePosition()

    if (selectRef.value && dropdownRef.value) {
      cleanupAutoUpdate.value?.()
      cleanupAutoUpdate.value = autoUpdate(selectRef.value, dropdownRef.value, () => updatePosition())
    }

    if (props.searchable)
      searchInputRef.value?.focus?.()
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  cleanupAutoUpdate.value?.()
  cleanupAutoUpdate.value = null
})
</script>

<template>
  <div
    ref="selectRef"
    :class="[
      'tuff-select',
      {
        'is-open': isOpen,
        'is-disabled': disabled,
      },
    ]"
  >
    <div class="tuff-select__trigger" @click="toggle">
      <span :class="['tuff-select__value', { 'is-placeholder': !selectedLabel }]">
        {{ selectedLabel || placeholder }}
      </span>
      <span class="tuff-select__arrow">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"/>
        </svg>
      </span>
    </div>

    <Teleport to="body">
      <Transition name="tuff-select-dropdown">
        <div
          v-show="isOpen"
          ref="dropdownRef"
          class="tuff-select__dropdown"
          :style="floatingStyles"
        >
          <div v-if="searchable" class="tuff-select__search">
            <TxSearchInput
              ref="searchInputRef"
              v-model="searchQuery"
              :placeholder="searchPlaceholder"
            />
          </div>

          <div class="tuff-select__list">
            <slot />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.tuff-select {
  position: relative;
  display: inline-block;
  width: 100%;

  &__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--tx-border-color, #dcdfe6);
    border-radius: 4px;
    background-color: var(--tx-bg-color, #fff);
    cursor: pointer;
    transition: all 0.25s;

    &:hover {
      border-color: var(--tx-color-primary-light-3, #79bbff);
    }
  }

  &__value {
    flex: 1;
    font-size: 14px;
    color: var(--tx-text-color-primary, #303133);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-placeholder {
      color: var(--tx-text-color-placeholder, #a8abb2);
    }
  }

  &__arrow {
    display: flex;
    align-items: center;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.3s;
  }

  &__dropdown {
    z-index: 1000;
    width: 100%;
    padding: 4px 0;
    background-color: var(--tx-bg-color, #fff);
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
    border-radius: 4px;
    box-shadow: var(--tx-box-shadow-light, 0 2px 12px rgba(0, 0, 0, 0.1));

    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);

    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__search {
    padding: 8px 10px;
    border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed);
  }

  &__list {
    overflow: auto;
    flex: 1;
    min-height: 0;
  }

  &.is-open {
    .tuff-select__trigger {
      border-color: var(--tx-color-primary, #409eff);
    }

    .tuff-select__arrow {
      transform: rotate(180deg);
    }
  }

  &.is-disabled {
    .tuff-select__trigger {
      background-color: var(--tx-disabled-bg-color, #f5f7fa);
      cursor: not-allowed;
    }

    .tuff-select__value {
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }
}

.tuff-select-dropdown-enter-active,
.tuff-select-dropdown-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.tuff-select-dropdown-enter-from,
.tuff-select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
