<script setup lang="ts" name="TuffAsideSearchBar">
import { TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
import FlatInput from '~/components/base/input/FlatInput.vue'

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
    clearLabel: 'Clear search'
  }
)

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
      <FlatInput
        :id="props.searchId"
        v-model="searchValue"
        class="TuffAsideSearch-Input"
        :placeholder="props.searchPlaceholder"
        autocomplete="off"
      >
        <template #default>
          <i class="i-carbon-search" aria-hidden="true" />
        </template>
      </FlatInput>
      <TxButton
        v-if="searchValue"
        variant="flat"
        size="sm"
        class="TuffAsideSearch-Clear"
        :aria-label="props.clearLabel"
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
  color: var(--el-text-color-secondary);
}

.TuffAsideSearch-Field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  color: var(--el-text-color-regular);
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
  color: var(--el-text-color-placeholder);
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    transform 0.15s ease;
  animation: search-clear-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.TuffAsideSearch-Clear > div {
  gap: 0;
  padding: 0;
  justify-content: center;
}

.TuffAsideSearch-Clear:hover {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
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
