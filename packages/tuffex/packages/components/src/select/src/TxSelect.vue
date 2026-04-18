<script lang="ts" setup>
import type { TxSelectProps } from './types'
import { computed, nextTick, onMounted, provide, ref, useSlots, watch } from 'vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxSearchInput from '../../search-input/src/TxSearchInput.vue'
import { SELECT_KEY } from './types'

defineOptions({
  name: 'TuffSelect',
})

const props = withDefaults(
  defineProps<TxSelectProps>(),
  {
    modelValue: '',
    placeholder: '请选择',
    disabled: false,
    eager: false,
    searchable: false,
    searchPlaceholder: 'Search',
    editable: false,
    remote: false,
    dropdownMaxHeight: 280,
    dropdownOffset: 6,
    panelVariant: 'solid',
    panelBackground: 'refraction',
    panelShadow: 'soft',
    panelRadius: 18,
    panelPadding: 4,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'change': [value: string | number]
  'search': [query: string]
}>()

const isOpen = ref(false)
const selectedLabel = ref('')

const searchInputRef = ref<any>(null)
const searchQuery = ref('')

const triggerInputRef = ref<any>(null)
const panelRef = ref<HTMLElement | null>(null)
const slots = useSlots()

const isEditable = computed(() => props.editable || props.remote)

const triggerText = computed({
  get: () => (isEditable.value ? searchQuery.value : selectedLabel.value),
  set: (v: string) => {
    if (!isEditable.value)
      return
    searchQuery.value = v
    if (!isOpen.value && !props.disabled)
      isOpen.value = true
  },
})

const optionLabelMap = ref(new Map<string | number, string>())

function isSelectValueEqual(
  optionValue: string | number,
  currentValue: unknown,
): boolean {
  if (optionValue === currentValue)
    return true

  if (
    (typeof optionValue === 'string' || typeof optionValue === 'number')
    && (typeof currentValue === 'string' || typeof currentValue === 'number')
  ) {
    const optionNumber = Number(optionValue)
    const currentNumber = Number(currentValue)
    if (Number.isFinite(optionNumber) && Number.isFinite(currentNumber)) {
      return optionNumber === currentNumber
    }
  }

  return false
}

function resolveLabelByValue(value: unknown): string | undefined {
  const direct = optionLabelMap.value.get(value as string | number)
  if (direct !== undefined)
    return direct

  for (const [optionValue, optionLabel] of optionLabelMap.value.entries()) {
    if (isSelectValueEqual(optionValue, value))
      return optionLabel
  }

  const slotLabel = resolveLabelFromSlot(value)
  if (slotLabel !== undefined)
    return slotLabel

  return undefined
}

function resolveChildrenText(children: unknown): string {
  if (children == null || typeof children === 'boolean')
    return ''

  if (typeof children === 'string' || typeof children === 'number')
    return String(children)

  if (Array.isArray(children))
    return children.map(item => resolveChildrenText(item)).join('')

  if (typeof children === 'object') {
    if ('children' in (children as Record<string, unknown>)) {
      return resolveChildrenText((children as { children?: unknown }).children)
    }
    if ('default' in (children as Record<string, unknown>)) {
      const maybeSlot = (children as { default?: unknown }).default
      if (typeof maybeSlot === 'function')
        return resolveChildrenText((maybeSlot as () => unknown)())
    }
  }

  return ''
}

function resolveLabelFromSlot(value: unknown): string | undefined {
  const queue: unknown[] = [...(slots.default?.() ?? [])]

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node)
      continue

    if (Array.isArray(node)) {
      queue.push(...node)
      continue
    }

    if (typeof node !== 'object')
      continue

    const vnode = node as {
      props?: Record<string, unknown>
      children?: unknown
    }
    const props = vnode.props

    if (props && Object.prototype.hasOwnProperty.call(props, 'value')) {
      const optionValue = props.value as string | number
      if (isSelectValueEqual(optionValue, value)) {
        const rawLabel = typeof props.label === 'string'
          ? props.label
          : resolveChildrenText(vnode.children)
        const normalizedLabel = rawLabel.replace(/\s+/g, ' ').trim()
        return normalizedLabel || String(optionValue)
      }
    }

    if (Array.isArray(vnode.children)) {
      queue.push(...vnode.children)
      continue
    }

    if (typeof vnode.children === 'object' && vnode.children !== null) {
      const defaultSlot = (vnode.children as { default?: unknown }).default
      if (typeof defaultSlot === 'function') {
        const slotNodes = defaultSlot()
        if (Array.isArray(slotNodes))
          queue.push(...slotNodes)
      }
    }
  }

  return undefined
}

const currentValue = computed({
  get: () => props.modelValue,
  set: (val: string | number) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

function toggle() {
  if (props.disabled)
    return
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
  const currentLabel = resolveLabelByValue(currentValue.value)
  if (currentLabel !== undefined && !selectedLabel.value) {
    selectedLabel.value = currentLabel
  }
}

function openFromFocus() {
  if (props.disabled || !isEditable.value)
    return
  isOpen.value = true
}

function scrollSelectedIntoView() {
  if (!panelRef.value)
    return
  const el = panelRef.value.querySelector<HTMLElement>('.tuff-select-item.is-selected')
  if (!el)
    return

  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'nearest' })
  })
}

provide(SELECT_KEY, {
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
  const label = resolveLabelByValue(currentValue.value)
  if (label !== undefined) {
    selectedLabel.value = label
    if (isEditable.value && !isOpen.value)
      searchQuery.value = label
  }
})

watch(
  () => props.modelValue,
  (val) => {
    const label = resolveLabelByValue(val)
    if (label !== undefined) {
      selectedLabel.value = label
      if (isEditable.value && !isOpen.value)
        searchQuery.value = label
      return
    }
    if (val === '' || val == null) {
      selectedLabel.value = ''
      if (isEditable.value && !isOpen.value)
        searchQuery.value = ''
    }
  },
  { immediate: true },
)

watch(
  isOpen,
  async (open) => {
    if (!open)
      return

    if (props.searchable)
      searchInputRef.value?.focus?.()
    if (isEditable.value)
      triggerInputRef.value?.focus?.()

    await nextTick()
    scrollSelectedIntoView()
  },
  { flush: 'post' },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled)
      isOpen.value = false
  },
)

watch(
  searchQuery,
  (v) => {
    if (props.remote && isOpen.value)
      emit('search', v)
  },
  { flush: 'post' },
)
</script>

<template>
  <div
    class="tuff-select" :class="[
      {
        'is-open': isOpen,
        'is-disabled': disabled,
      },
    ]"
  >
    <TxPopover
      v-model="isOpen"
      :disabled="disabled"
      :eager="eager"
      placement="bottom-start"
      :offset="dropdownOffset"
      :width="0"
      :max-width="9999"
      :reference-full-width="true"
      :show-arrow="false"
      trigger="click"
      :toggle-on-reference-click="!isEditable"
      :panel-variant="panelVariant"
      :panel-background="panelBackground"
      :panel-shadow="panelShadow"
      :panel-radius="panelRadius"
      :panel-padding="panelPadding"
      :panel-card="panelCard"
    >
      <template #reference>
        <div class="tuff-select__trigger">
          <TuffInput
            ref="triggerInputRef"
            v-model="triggerText"
            :placeholder="placeholder"
            :readonly="!isEditable"
            :disabled="disabled"
            @focus="openFromFocus"
          >
            <template #suffix>
              <span class="tuff-select__arrow">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z" />
                </svg>
              </span>
            </template>
          </TuffInput>
        </div>
      </template>

      <div
        ref="panelRef"
        class="tuff-select__panel"
        :style="{ maxHeight: `${dropdownMaxHeight}px` }"
      >
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
      </div>
    </TxPopover>
  </div>
</template>

<style lang="scss" scoped>
.tuff-select {
  position: relative;
  display: inline-block;
  width: 100%;
  min-width: 180px;

  &__trigger {
    display: flex;
    width: 100%;
    flex: 1 1 auto;
    min-width: 0;
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.3s;
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
</style>
