<script setup lang="ts" name="TuffAsideSearchBar">
import { computed } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
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
}

.TuffAsideSearch-Clear > div {
  gap: 0;
  padding: 0;
  justify-content: center;
}

.TuffAsideSearch-Clear:hover {
  background: transparent;
  color: var(--el-text-color-primary);
}
</style>
