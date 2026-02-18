<script setup lang="ts">
import type { TxSearchSelectEmits, TxSearchSelectOption, TxSearchSelectProps } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxSpinner from '../../spinner/src/TxSpinner.vue'

defineOptions({ name: 'TxSearchSelect' })

const props = withDefaults(defineProps<TxSearchSelectProps>(), {
  modelValue: '',
  placeholder: 'Search',
  disabled: false,
  clearable: true,

  options: () => [],
  loading: false,

  remote: false,
  searchDebounce: 200,

  dropdownMaxHeight: 280,
  dropdownOffset: 6,

  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 6,
})

const emit = defineEmits<TxSearchSelectEmits>()

const open = ref(false)
const inputRef = ref<any>(null)
const inputText = ref('')
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const optionsMap = computed(() => {
  const m = new Map<string | number, TxSearchSelectOption>()
  for (const o of props.options ?? [])
    m.set(o.value, o)
  return m
})

const selectedOption = computed(() => optionsMap.value.get(props.modelValue ?? ''))

watch(
  selectedOption,
  (opt) => {
    if (!opt)
      return
    inputText.value = opt.label
  },
  { immediate: true },
)

const filteredOptions = computed(() => {
  const list = props.options ?? []
  if (props.remote)
    return list
  const q = inputText.value.trim().toLowerCase()
  if (!q)
    return list
  return list.filter(o => o.label.toLowerCase().includes(q))
})

function clearSearchTimer() {
  if (!searchTimer.value)
    return
  clearTimeout(searchTimer.value)
  searchTimer.value = null
}

function emitSearch(q: string) {
  if (!props.remote)
    return
  if (props.disabled)
    return
  emit('search', q)
}

function onInput(v: string | number) {
  const nextValue = typeof v === 'string' ? v : String(v)
  inputText.value = nextValue

  if (!open.value && !props.disabled)
    open.value = true

  if (!props.remote)
    return

  clearSearchTimer()
  const delay = Math.max(0, props.searchDebounce ?? 0)
  searchTimer.value = setTimeout(() => {
    searchTimer.value = null
    emitSearch(nextValue)
  }, delay)
}

function onEnter() {
  emitSearch(inputText.value)
}

function onFocus() {
  if (props.disabled)
    return
  open.value = true
}

function close() {
  if (!open.value)
    return
  open.value = false
}

function onClear() {
  inputText.value = ''
  emit('update:modelValue', '')
  emit('change', '')
}

function onPick(opt: TxSearchSelectOption) {
  if (opt.disabled)
    return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  emit('select', opt)
  inputText.value = opt.label
  close()
}

watch(
  open,
  (v, prev) => {
    if (v === prev)
      return
    if (v) {
      emit('open')
      return
    }
    emit('close')
    clearSearchTimer()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearSearchTimer()
})

defineExpose({
  open: () => {
    if (props.disabled)
      return
    open.value = true
  },
  close,
  focus: () => inputRef.value?.focus?.(),
  blur: () => inputRef.value?.blur?.(),
  clear: () => inputRef.value?.clear?.(),
})
</script>

<template>
  <div
    class="tx-search-select"
    :class="{ 'is-open': open, 'is-disabled': props.disabled }"
  >
    <TxPopover
      v-model="open"
      :disabled="props.disabled"
      placement="bottom-start"
      :offset="props.dropdownOffset"
      :width="0"
      :max-width="9999"
      :show-arrow="false"
      :reference-full-width="true"
      :toggle-on-reference-click="false"
      :panel-variant="props.panelVariant"
      :panel-background="props.panelBackground"
      :panel-shadow="props.panelShadow"
      :panel-radius="props.panelRadius"
      :panel-padding="props.panelPadding"
    >
      <template #reference>
        <div class="tx-search-select__reference">
          <TuffInput
            ref="inputRef"
            :model-value="inputText"
            :disabled="props.disabled"
            :placeholder="props.placeholder"
            :clearable="props.clearable"
            @update:model-value="onInput"
            @focus="onFocus"
            @keydown.enter="onEnter"
            @clear="onClear"
          >
            <template #prefix>
              <span class="tx-search-select__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    fill="currentColor"
                    d="M10 2a8 8 0 105.293 14.293l4.207 4.207 1.414-1.414-4.207-4.207A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"
                  />
                </svg>
              </span>
            </template>

            <template #suffix>
              <span v-if="props.loading" class="tx-search-select__loading">
                <TxSpinner :size="12" />
              </span>
            </template>
          </TuffInput>
        </div>
      </template>

      <div
        class="tx-search-select__panel"
        :style="{ maxHeight: `${props.dropdownMaxHeight}px` }"
      >
        <div class="tx-search-select__list">
          <TxCardItem
            v-for="opt in filteredOptions"
            :key="String(opt.value)"
            class="tx-search-select__item"
            :class="{ 'is-selected': opt.value === props.modelValue, 'is-disabled': opt.disabled }"
            :clickable="!opt.disabled"
            :disabled="!!opt.disabled"
            :active="opt.value === props.modelValue"
            @click="onPick(opt)"
          >
            <template #title>
              <span class="tx-search-select__item-label">{{ opt.label }}</span>
            </template>
          </TxCardItem>

          <div v-if="!props.loading && !filteredOptions.length" class="tx-search-select__empty">
            No results
          </div>
        </div>
      </div>
    </TxPopover>
  </div>
</template>

<style lang="scss" scoped>
.tx-search-select {
  width: 100%;
}

.tx-search-select__reference {
  display: block;
  width: 100%;
}

.tx-search-select__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-search-select__loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-search-select__panel {
  width: 100%;
  overflow: auto;
}

.tx-search-select__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-search-select__item {
  --tx-card-item-padding: 10px 10px;
  --tx-card-item-radius: 12px;
  --tx-card-item-gap: 8px;
}

.tx-search-select__item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-search-select__item.is-disabled :deep(.tx-card-item__title) {
  color: var(--tx-disabled-text-color, #c0c4cc);
}

.tx-search-select__empty {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
