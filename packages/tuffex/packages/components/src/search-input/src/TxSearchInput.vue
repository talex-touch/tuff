<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TuffInput from '../../input/src/TxInput.vue'
import type { SearchInputEmits, SearchInputProps } from './types'

defineOptions({ name: 'TxSearchInput' })

const props = withDefaults(defineProps<SearchInputProps>(), {
  modelValue: '',
  placeholder: 'Search',
  disabled: false,
  clearable: true,
  remote: false,
  searchDebounce: 200,
})

const emit = defineEmits<SearchInputEmits>()

const inputRef = ref<any>(null)

const value = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => {
    emit('update:modelValue', v)
    emit('input', v)
  },
})

const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function emitRemoteSearch(v: string) {
  if (!props.remote) return
  if (props.disabled) return
  emit('search', v)
}

function onEnter() {
  emit('search', value.value)
}

watch(
  value,
  (v) => {
    if (!props.remote) return
    if (searchTimer.value) {
      clearTimeout(searchTimer.value)
      searchTimer.value = null
    }
    const delay = Math.max(0, props.searchDebounce ?? 0)
    searchTimer.value = setTimeout(() => {
      searchTimer.value = null
      emitRemoteSearch(v)
    }, delay)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
    searchTimer.value = null
  }
})

defineExpose({
  focus: () => inputRef.value?.focus?.(),
  blur: () => inputRef.value?.blur?.(),
  clear: () => inputRef.value?.clear?.(),
  setValue: (v: string) => inputRef.value?.setValue?.(v),
  getValue: () => inputRef.value?.getValue?.(),
})
</script>

<template>
  <TuffInput
    ref="inputRef"
    v-model="value"
    :disabled="disabled"
    :placeholder="placeholder"
    :clearable="clearable"
    @keydown.enter="onEnter"
    @focus="(e) => emit('focus', e)"
    @blur="(e) => emit('blur', e)"
    @clear="() => emit('clear')"
  >
    <template #prefix>
      <span class="tx-search-input__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="currentColor"
            d="M10 2a8 8 0 105.293 14.293l4.207 4.207 1.414-1.414-4.207-4.207A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"
          />
        </svg>
      </span>
    </template>
  </TuffInput>
</template>

<style lang="scss" scoped>
.tx-search-input__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
