<script setup lang="ts" name="TuffAsideSearchBar">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    searchLabel?: string
    searchPlaceholder?: string
    searchId?: string
    clearLabel?: string
  }>(),
  {
    modelValue: '',
    searchLabel: '',
    searchPlaceholder: '',
    searchId: 'tuff-aside-template-search',
    clearLabel: ''
  }
)

const { t } = useI18n()
// The store's plugin list passes no label, and an empty one would leave the button nameless.
const clearLabelText = computed(() => props.clearLabel || t('common.clearSearch'))

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'search', value: string): void
  (event: 'clear'): void
}>()

const searchValue = computed({
  get: () => props.modelValue,
  set: (value: string) => {
    emit('update:modelValue', value)
    emit('search', value)
  }
})

function handleClear(): void {
  searchValue.value = ''
  emit('clear')
}
</script>

<template>
  <div class="TuffAsideSearch">
    <label v-if="props.searchLabel" class="TuffAsideSearch-Label" :for="props.searchId">
      {{ props.searchLabel }}
    </label>
    <div class="TuffAsideSearch-Field">
      <TxInput
        :id="props.searchId"
        v-model="searchValue"
        class="TuffAsideSearch-Input"
        :placeholder="props.searchPlaceholder"
        autocomplete="off"
        prefix-icon="i-carbon-search"
      />
      <TxButton
        v-if="searchValue"
        variant="flat"
        size="sm"
        class="TuffAsideSearch-Clear"
        :aria-label="clearLabelText"
        @click="handleClear"
      >
        <i class="i-carbon-close" aria-hidden="true" />
      </TxButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.TuffAsideSearch {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.TuffAsideSearch-Label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tx-text-color-secondary);
}

.TuffAsideSearch-Field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  color: var(--tx-text-color-regular);
}

.TuffAsideSearch-Input {
  flex: 1;
}

.TuffAsideSearch-Clear {
  min-width: 32px;
  min-height: 32px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--tx-text-color-placeholder);
  transition: transform 0.15s ease;
  animation: search-clear-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.TuffAsideSearch-Clear > div {
  gap: 0;
  padding: 0;
  justify-content: center;
}

.TuffAsideSearch-Clear:hover {
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-primary);
}

.TuffAsideSearch-Clear:active {
  transform: scale(0.9);
}

@keyframes search-clear-in {
  from {
    opacity: 0;
    transform: scale(0.7) rotate(-90deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}
</style>
