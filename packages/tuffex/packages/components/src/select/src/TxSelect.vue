<script lang="ts" setup>
import type { TxSelectModelValue, TxSelectOption, TxSelectOptionGroup, TxSelectOptionId, TxSelectOptionLike, TxSelectProps, TxSelectValue } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxSearchInput from '../../search-input/src/TxSearchInput.vue'
import TxSpinner from '../../spinner/src/TxSpinner.vue'
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
    multiple: false,
    status: 'default',
    eager: true,
    options: () => [],
    maxTagCount: undefined,
    maxTagTextLength: undefined,
    searchable: false,
    searchPlaceholder: 'Search',
    editable: false,
    remote: false,
    allowCreate: false,
    createText: 'Add item',
    loading: false,
    loadingText: 'Loading...',
    emptyText: 'No results',
    searchDebounce: 0,
    dropdownMaxHeight: 280,
    dropdownOffset: 6,
    contentPadding: 8,
    optionPadding: 0,
    duration: 120,
    panelVariant: 'solid',
    panelBackground: 'refraction',
    panelShadow: 'soft',
    panelRadius: 18,
    panelPadding: 0,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: TxSelectModelValue]
  'change': [value: TxSelectModelValue]
  'search': [query: string]
  'create': [option: TxSelectOption]
}>()

const isOpen = ref(false)
const selectedLabel = ref('')
const multiInput = ref('')

const searchInputRef = ref<any>(null)
const searchQuery = ref('')
const multiInputRef = ref<HTMLInputElement | null>(null)

const triggerInputRef = ref<any>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const isEditable = computed(() => !props.multiple && (props.editable || props.remote))
const isMultiInputEnabled = computed(() => props.multiple && (props.searchable || props.remote || props.allowCreate))
const hasPropOptions = computed(() => (props.options?.length ?? 0) > 0)

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

const registeredOptions = ref(new Map<TxSelectOptionId, TxSelectOption>())

const registeredOptionList = computed(() => Array.from(registeredOptions.value.values()))

function isOptionGroup(option: TxSelectOptionLike): option is TxSelectOptionGroup {
  return Array.isArray((option as TxSelectOptionGroup).options)
}

function flattenOptions(options: TxSelectOptionLike[]): TxSelectOption[] {
  const result: TxSelectOption[] = []
  for (const opt of options) {
    if (isOptionGroup(opt))
      result.push(...opt.options)
    else
      result.push(opt)
  }
  return result
}

const allOptions = computed<TxSelectOption[]>(() => {
  const byValue = new Map<string, TxSelectOption>()

  for (const opt of registeredOptionList.value)
    byValue.set(String(opt.value), opt)

  for (const opt of flattenOptions(props.options ?? []))
    byValue.set(String(opt.value), opt)

  return Array.from(byValue.values())
})

const optionLabelMap = computed(() => {
  const m = new Map<string | number, string>()
  for (const opt of allOptions.value)
    m.set(opt.value, opt.label)
  return m
})

const selectedValues = computed<TxSelectValue[]>(() => {
  if (!props.multiple)
    return []
  return Array.isArray(props.modelValue) ? props.modelValue : []
})

const selectedOptions = computed(() => {
  return selectedValues.value.map((value) => {
    const label = resolveLabelByValue(value)
    return {
      value,
      label: label ?? String(value),
    }
  })
})

const visibleSelectedOptions = computed(() => {
  const max = props.maxTagCount
  if (typeof max !== 'number' || max < 0)
    return selectedOptions.value
  return selectedOptions.value.slice(0, max)
})

const hiddenSelectedCount = computed(() => Math.max(0, selectedOptions.value.length - visibleSelectedOptions.value.length))

function resolveTagLabel(label: string) {
  const max = props.maxTagTextLength
  if (typeof max !== 'number' || max <= 0 || label.length <= max)
    return label
  return `${label.slice(0, max)}...`
}

function isOptionVisible(opt: TxSelectOption, query: string) {
  if (props.remote)
    return true
  if (!query)
    return true
  return opt.label.toLowerCase().includes(query)
}

const activeQuery = computed(() => props.multiple ? multiInput.value : searchQuery.value)

const filteredOptions = computed<TxSelectOption[]>(() => {
  const list = flattenOptions(props.options ?? [])
  if (props.remote)
    return list
  const q = activeQuery.value.trim().toLowerCase()
  if (!q)
    return list
  return list.filter(opt => isOptionVisible(opt, q))
})

const renderedOptionGroups = computed(() => {
  const q = activeQuery.value.trim().toLowerCase()
  const source = props.options ?? []
  const groups: Array<{ key: string, label?: string, disabled?: boolean, options: TxSelectOption[] }> = []

  for (const opt of source) {
    if (isOptionGroup(opt)) {
      const options = opt.options.filter(item => isOptionVisible(item, q))
      if (options.length) {
        groups.push({
          key: `group:${opt.label}`,
          label: opt.label,
          disabled: opt.disabled,
          options: options.map(item => ({ ...item, disabled: item.disabled || opt.disabled })),
        })
      }
      continue
    }

    if (isOptionVisible(opt, q)) {
      groups.push({
        key: `option:${String(opt.value)}`,
        options: [opt],
      })
    }
  }

  return groups
})

const shouldRenderPropOptions = computed(() => hasPropOptions.value)
const hasVisibleOptions = computed(() => {
  if (shouldRenderPropOptions.value)
    return renderedOptionGroups.value.some(group => group.options.length > 0)
  return registeredOptionList.value.length > 0
})

const normalizedCreateLabel = computed(() => activeQuery.value.trim())

const canCreateOption = computed(() => {
  if (!props.allowCreate || props.disabled)
    return false
  const label = normalizedCreateLabel.value
  if (!label)
    return false
  return !allOptions.value.some(opt => opt.label === label || isSelectValueEqual(opt.value, label))
})

const panelStyle = computed(() => ({
  maxHeight: `${props.dropdownMaxHeight}px`,
  '--tuff-select-content-padding': `${Math.max(0, props.contentPadding)}px`,
  '--tuff-select-option-padding': `${Math.max(0, props.optionPadding)}px`,
}))

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

  return undefined
}

function isValueSelected(optionValue: TxSelectValue): boolean {
  if (!props.multiple)
    return isSelectValueEqual(optionValue, currentValue.value)
  return selectedValues.value.some(value => isSelectValueEqual(optionValue, value))
}

const currentValue = computed({
  get: () => props.modelValue,
  set: (val: TxSelectModelValue) => {
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
  currentValue.value = props.multiple ? [] : ''
  selectedLabel.value = ''
  if (isEditable.value)
    searchQuery.value = ''
  multiInput.value = ''
}

function removeSelectedValue(value: TxSelectValue) {
  if (props.disabled || !props.multiple)
    return
  currentValue.value = selectedValues.value.filter(item => !isSelectValueEqual(item, value))
}

function handleSelect(value: string | number, label: string) {
  if (props.multiple) {
    if (isValueSelected(value))
      removeSelectedValue(value)
    else
      currentValue.value = [...selectedValues.value, value]
    return
  }

  currentValue.value = value
  selectedLabel.value = label
  if (isEditable.value)
    searchQuery.value = label
  close()
}

function createOptionFromInput() {
  if (!canCreateOption.value)
    return
  const label = normalizedCreateLabel.value
  const option = { value: label, label }
  emit('create', option)

  if (props.multiple) {
    currentValue.value = [...selectedValues.value, option.value]
    multiInput.value = ''
    return
  }

  handleSelect(option.value, option.label)
}

function handleMultiInput(v: string) {
  multiInput.value = v
  if (!isOpen.value && !props.disabled)
    isOpen.value = true
}

function handleMultiInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    if (canCreateOption.value) {
      e.preventDefault()
      createOptionFromInput()
    }
    return
  }

  if (e.key === 'Backspace' && !multiInput.value && selectedValues.value.length) {
    e.preventDefault()
    const lastValue = selectedValues.value[selectedValues.value.length - 1]
    if (lastValue !== undefined)
      removeSelectedValue(lastValue)
  }
}

function freezeLeavingTagPosition(el: Element) {
  const element = el as HTMLElement
  const parent = element.parentElement
  if (!parent)
    return

  const elementRect = element.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  element.style.setProperty('--tuff-select-tag-leave-left', `${elementRect.left - parentRect.left + parent.scrollLeft}px`)
  element.style.setProperty('--tuff-select-tag-leave-top', `${elementRect.top - parentRect.top + parent.scrollTop}px`)
  element.style.setProperty('--tuff-select-tag-leave-width', `${elementRect.width}px`)
  element.style.setProperty('--tuff-select-tag-leave-height', `${elementRect.height}px`)
}

function clearLeavingTagPosition(el: Element) {
  const element = el as HTMLElement
  element.style.removeProperty('--tuff-select-tag-leave-left')
  element.style.removeProperty('--tuff-select-tag-leave-top')
  element.style.removeProperty('--tuff-select-tag-leave-width')
  element.style.removeProperty('--tuff-select-tag-leave-height')
}

function syncSelectedLabelFromValue(value: unknown, options: { clearWhenMissing?: boolean } = {}) {
  const label = resolveLabelByValue(value)
  if (label !== undefined) {
    selectedLabel.value = label
    if (isEditable.value && !isOpen.value)
      searchQuery.value = label
    return true
  }

  if (options.clearWhenMissing || value === '' || value == null) {
    selectedLabel.value = ''
    if (isEditable.value && !isOpen.value)
      searchQuery.value = ''
  }

  return false
}

function registerOption(id: TxSelectOptionId, value: string | number, label: string) {
  registeredOptions.value.set(id, { value, label })
  registeredOptions.value = new Map(registeredOptions.value)
  syncSelectedLabelFromValue(currentValue.value)
}

function unregisterOption(id: TxSelectOptionId) {
  if (!registeredOptions.value.delete(id))
    return
  registeredOptions.value = new Map(registeredOptions.value)
  syncSelectedLabelFromValue(currentValue.value, { clearWhenMissing: true })
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
  unregisterOption,
  isValueEqual: isSelectValueEqual,
  isValueSelected,
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
  syncSelectedLabelFromValue(currentValue.value)
})

watch(
  () => props.modelValue,
  (val) => {
    syncSelectedLabelFromValue(val, { clearWhenMissing: true })
  },
  { immediate: true },
)

watch(
  allOptions,
  () => {
    syncSelectedLabelFromValue(currentValue.value, { clearWhenMissing: true })
  },
  { deep: true, flush: 'post' },
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
    if (isMultiInputEnabled.value)
      multiInputRef.value?.focus?.()

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
    if (!props.remote || !isOpen.value)
      return

    if (searchTimer.value)
      clearTimeout(searchTimer.value)

    const delay = Math.max(0, props.searchDebounce)
    if (delay <= 0) {
      emit('search', v)
      return
    }

    searchTimer.value = setTimeout(() => {
      searchTimer.value = null
      emit('search', v)
    }, delay)
  },
  { flush: 'post' },
)

watch(
  multiInput,
  (v) => {
    if (!props.remote || !isOpen.value)
      return

    if (searchTimer.value)
      clearTimeout(searchTimer.value)

    const delay = Math.max(0, props.searchDebounce)
    if (delay <= 0) {
      emit('search', v)
      return
    }

    searchTimer.value = setTimeout(() => {
      searchTimer.value = null
      emit('search', v)
    }, delay)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (searchTimer.value)
    clearTimeout(searchTimer.value)
})
</script>

<template>
  <div
    class="tuff-select" :class="[
      {
        'is-open': isOpen,
        'is-disabled': disabled,
        'is-status-error': status === 'error',
        'is-status-warning': status === 'warning',
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
      :toggle-on-reference-click="!isEditable && !isMultiInputEnabled"
      :animation="animation"
      :duration="duration"
      :panel-variant="panelVariant"
      :panel-background="panelBackground"
      :panel-shadow="panelShadow"
      :panel-radius="panelRadius"
      :panel-padding="panelPadding"
      :panel-card="panelCard"
    >
      <template #reference>
        <div class="tuff-select__trigger">
          <div
            v-if="multiple"
            class="tuff-select__multi-trigger"
            :class="{ 'is-disabled': disabled }"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="isOpen"
          >
            <TransitionGroup
              v-if="selectedOptions.length"
              name="tuff-select-tag"
              tag="div"
              class="tuff-select__tags"
              @before-leave="freezeLeavingTagPosition"
              @after-leave="clearLeavingTagPosition"
            >
              <span
                v-for="opt in visibleSelectedOptions"
                :key="`value:${String(opt.value)}`"
                class="tuff-select__tag"
              >
                <slot name="tag" :option="opt" :remove="() => removeSelectedValue(opt.value)">
                  <span class="tuff-select__tag-label">{{ resolveTagLabel(opt.label) }}</span>
                </slot>
                <button
                  v-if="!disabled"
                  type="button"
                  class="tuff-select__tag-remove"
                  aria-label="Remove selected option"
                  @click.stop="removeSelectedValue(opt.value)"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                    <path fill="currentColor" d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z" />
                  </svg>
                </button>
              </span>
              <span v-if="hiddenSelectedCount" key="summary" class="tuff-select__tag tuff-select__tag--summary">
                + {{ hiddenSelectedCount }} ...
              </span>
              <input
                v-if="isMultiInputEnabled"
                key="input"
                ref="multiInputRef"
                class="tuff-select__multi-input"
                :value="multiInput"
                :placeholder="selectedOptions.length ? '' : searchPlaceholder"
                :disabled="disabled"
                @focus="isOpen = true"
                @input="handleMultiInput(($event.target as HTMLInputElement).value)"
                @keydown="handleMultiInputKeydown"
              >
            </TransitionGroup>
            <template v-else>
              <input
                v-if="isMultiInputEnabled"
                ref="multiInputRef"
                class="tuff-select__multi-input"
                :value="multiInput"
                :placeholder="placeholder"
                :disabled="disabled"
                @focus="isOpen = true"
                @input="handleMultiInput(($event.target as HTMLInputElement).value)"
                @keydown="handleMultiInputKeydown"
              >
              <span v-else class="tuff-select__placeholder">{{ placeholder }}</span>
            </template>
            <span class="tuff-select__arrow">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z" />
              </svg>
            </span>
          </div>
          <TuffInput
            v-else
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
        :style="panelStyle"
      >
        <div v-if="searchable && !isEditable" class="tuff-select__search">
          <TxSearchInput
            ref="searchInputRef"
            v-model="searchQuery"
            :placeholder="searchPlaceholder"
          />
        </div>

        <div class="tuff-select__list">
          <template v-if="shouldRenderPropOptions">
            <template v-for="group in renderedOptionGroups" :key="group.key">
              <div v-if="group.label" class="tuff-select__group-label">
                <slot name="group" :group="group">
                  {{ group.label }}
                </slot>
              </div>
              <TxCardItem
                v-for="opt in group.options"
                :key="String(opt.value)"
                class="tuff-select-item tuff-select__option"
                :class="{
                  'is-selected': isValueSelected(opt.value),
                  'is-disabled': opt.disabled,
                }"
                :clickable="!opt.disabled"
                :active="isValueSelected(opt.value)"
                :disabled="!!opt.disabled"
                @click="!opt.disabled && handleSelect(opt.value, opt.label)"
              >
                <template #title>
                  <slot name="option" :option="opt" :selected="isValueSelected(opt.value)">
                    {{ opt.label }}
                  </slot>
                </template>
              </TxCardItem>
            </template>
          </template>
          <slot v-else />
          <div v-if="loading" class="tuff-select__status tuff-select__status--loading" role="status">
            <slot name="loading">
              <TxSpinner :size="14" />
              <span>{{ loadingText }}</span>
            </slot>
          </div>
          <div v-else-if="!hasVisibleOptions" class="tuff-select__status">
            <slot name="empty">
              {{ emptyText }}
            </slot>
          </div>
        </div>
        <div v-if="$slots.footer || canCreateOption" class="tuff-select__footer">
          <slot
            name="footer"
            :query="activeQuery"
            :can-create="canCreateOption"
            :create="createOptionFromInput"
          >
            <button
              v-if="canCreateOption"
              type="button"
              class="tuff-select__create"
              @click="createOptionFromInput"
            >
              <span aria-hidden="true">+</span>
              <span>{{ createText }}</span>
            </button>
          </slot>
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
    flex-shrink: 0;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.16s ease;
  }

  &__multi-trigger {
    --tuff-select-tag-gap: 4px;
    --tuff-select-tag-padding: 4px;
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 32px;
    min-width: 0;
    padding: var(--tuff-select-tag-padding);
    border: 1px solid var(--tx-border-color, #dcdfe6);
    border-radius: 12px;
    background-color: var(--tx-bg-color, #fff);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
    cursor: pointer;

    &:hover:not(.is-disabled) {
      border-color: var(--tx-color-primary-light-3, #79bbff);
    }

    &.is-disabled {
      background-color: var(--tx-disabled-bg-color, #f5f7fa);
      cursor: not-allowed;
    }
  }

  &__tags {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: var(--tuff-select-tag-gap);
    min-width: 0;
    position: relative;
  }

  &__tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 24px;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 7px;
    border: 1px solid var(--tx-border-color-light, #e4e7ed);
    background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 72%, transparent);
    color: var(--tx-text-color-primary, #303133);
    font-size: 13px;
    line-height: 1.2;
    transform-origin: center;
  }

  &-tag-move,
  &-tag-enter-active,
  &-tag-leave-active {
    transition:
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.16s ease,
      filter 0.16s ease;
  }

  &-tag-enter-from {
    opacity: 0;
    transform: scale(0.96);
  }

  &-tag-leave-active {
    position: absolute;
    left: var(--tuff-select-tag-leave-left);
    top: var(--tuff-select-tag-leave-top);
    width: var(--tuff-select-tag-leave-width);
    height: var(--tuff-select-tag-leave-height);
    z-index: 0;
    pointer-events: none;
  }

  &-tag-leave-to {
    opacity: 0;
    filter: blur(2px);
    transform: scale(0.82);
  }

  &__tag--summary {
    color: var(--tx-color-primary, #409eff);
  }

  &__tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tag-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--tx-text-color-secondary, #909399);
    cursor: pointer;

    &:hover {
      color: var(--tx-text-color-primary, #303133);
    }
  }

  &__multi-input {
    flex: 1 1 72px;
    min-width: 48px;
    height: 24px;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--tx-text-color-primary, #303133);
    font: inherit;

    &::placeholder {
      color: var(--tx-text-color-placeholder, #a8abb2);
    }

    &:disabled {
      cursor: not-allowed;
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }

  &__placeholder {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--tx-text-color-placeholder, #a8abb2);
  }

  &__panel {
    width: 100%;
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }

  &__search {
    padding: var(--tuff-select-content-padding);
    padding-bottom: calc(var(--tuff-select-content-padding) * 0.75);
    border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed);
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--tx-bg-color, #fff);
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--tuff-select-content-padding);
  }

  &__option {
    margin: 0 var(--tuff-select-option-padding);
  }

  &__group-label {
    padding: 8px 10px 4px;
    color: var(--tx-text-color-secondary, #909399);
    font-size: 13px;
    font-weight: 500;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 6px 10px;
    color: var(--tx-text-color-secondary, #909399);
    font-size: 14px;
  }

  &__status--loading {
    color: var(--tx-text-color-regular, #606266);
  }

  &__footer {
    border-top: 1px solid var(--tx-border-color-light, #e4e7ed);
    padding: var(--tuff-select-content-padding);
  }

  &__create {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--tx-text-color-primary, #303133);
    cursor: pointer;
    font: inherit;

    &:hover {
      background: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
      color: var(--tx-color-primary, #409eff);
    }
  }

  &.is-open {
    .tuff-select__trigger {
      border-color: var(--tx-color-primary, #409eff);
    }

    .tuff-select__arrow {
      transform: rotate(180deg);
    }

    .tuff-select__multi-trigger {
      border-color: var(--tx-color-primary, #409eff);
      box-shadow: 0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
    }
  }

  &.is-status-error {
    :deep(.tx-input),
    .tuff-select__multi-trigger {
      border-color: var(--tx-color-danger, #f56c6c);
    }
  }

  &.is-status-warning {
    :deep(.tx-input),
    .tuff-select__multi-trigger {
      border-color: var(--tx-color-warning, #e6a23c);
    }
  }

  &.is-disabled {
    .tuff-select__trigger {
      cursor: not-allowed;

      :deep(.tx-input) {
        pointer-events: none;
        cursor: not-allowed;
      }

      :deep(.tx-input__inner),
      .tuff-select__arrow {
        cursor: not-allowed;
      }
    }

    .tuff-select__value {
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }
}
</style>
