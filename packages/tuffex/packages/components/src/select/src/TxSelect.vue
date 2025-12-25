<script lang="ts" setup>
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import TxCard from '../../card/src/TxCard.vue'
import TuffInput from '../../input/src/TxInput.vue'
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
    editable?: boolean
    remote?: boolean
    dropdownMaxHeight?: number
    dropdownOffset?: number
  }>(),
  {
    modelValue: '',
    placeholder: '请选择',
    disabled: false,
    searchable: false,
    searchPlaceholder: 'Search',
    editable: false,
    remote: false,
    dropdownMaxHeight: 280,
    dropdownOffset: 6,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'change': [value: string | number]
  'search': [query: string]
}>()

const isOpen = ref(false)
const selectRef = ref<HTMLElement | null>(null)
const selectedLabel = ref('')

const searchInputRef = ref<any>(null)
const searchQuery = ref('')

const triggerInputRef = ref<any>(null)

const isEditable = computed(() => props.editable || props.remote)

const triggerText = computed({
  get: () => (isEditable.value ? searchQuery.value : selectedLabel.value),
  set: (v: string) => {
    if (!isEditable.value)
      return
    searchQuery.value = v
    if (props.remote)
      emit('search', v)
  },
})

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
        const h = Math.min(availableHeight, props.dropdownMaxHeight)
        Object.assign(elements.floating.style, {
          minWidth: `${rects.reference.width}px`,
          maxWidth: `${rects.reference.width}px`,
          height: `${h}px`,
          maxHeight: `${h}px`,
          overflow: 'hidden',
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
  if (isEditable.value)
    searchQuery.value = label
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

function scrollSelectedIntoView() {
  if (!dropdownRef.value) return
  const el = dropdownRef.value.querySelector<HTMLElement>('.tuff-select-item.is-selected')
  if (!el) return

  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'nearest' })
  })
}

provide('tuffSelect', {
  currentValue,
  handleSelect,
  registerOption,
  searchQuery: computed(() => (props.remote ? '' : searchQuery.value)),
})

defineExpose({
  open: () => (isOpen.value = true),
  close,
  toggle,
  focus: () => triggerInputRef.value?.focus?.(),
  blur: () => triggerInputRef.value?.blur?.(),
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
      if (isEditable.value)
        searchQuery.value = selectedLabel.value
      else
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
    if (isEditable.value)
      triggerInputRef.value?.focus?.()

    await nextTick()
    scrollSelectedIntoView()
  },
  { flush: 'post' }
)

watch(
  searchQuery,
  (v) => {
    if (props.remote && isOpen.value)
      emit('search', v)
  },
  { flush: 'post' },
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
    <div class="tuff-select__trigger" @click="!isEditable && toggle()">
      <TuffInput
        ref="triggerInputRef"
        v-model="triggerText"
        :placeholder="placeholder"
        :readonly="!isEditable"
        :disabled="disabled"
        @focus="!disabled && (isOpen = true)"
      >
        <template #suffix>
          <span class="tuff-select__arrow">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"/>
            </svg>
          </span>
        </template>
      </TuffInput>
    </div>

    <Teleport to="body">
      <Transition name="tuff-select-dropdown">
        <div
          v-show="isOpen"
          ref="dropdownRef"
          class="tuff-select__dropdown"
          :style="floatingStyles"
        >
          <TxCard class="tuff-select__panel" variant="solid" background="glass" shadow="soft" :radius="18" :padding="4">
            <div v-if="searchable && !isEditable" class="tuff-select__search">
              <TxSearchInput
                ref="searchInputRef"
                v-model="searchQuery"
                :placeholder="searchPlaceholder"
              />
            </div>

            <div class="tuff-select__list">
              <slot />
            </div>
          </TxCard>
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
  min-width: 180px;

  &__trigger {
    display: block;
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.3s;
  }

  &__dropdown {
    z-index: 1000;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
    background: transparent;
    border: none;
  }

  &__panel {
    width: 100%;
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  &__search {
    padding: 8px 10px;
    border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed);
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--tx-bg-color, #fff);
  }

  &__list {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
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
