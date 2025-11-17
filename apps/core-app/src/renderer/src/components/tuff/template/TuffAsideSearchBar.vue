<script setup lang="ts" name="TuffAsideSearchBar">
import { computed } from 'vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
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
  <div class="tuff-aside-search">
    <label
      v-if="props.searchLabel"
      class="tuff-aside-search__label"
      :for="props.searchId"
    >
      {{ props.searchLabel }}
    </label>
    <div class="tuff-aside-search__field">
      <FlatInput
        class="tuff-aside-search__input"
        :id="props.searchId"
        v-model="searchValue"
        :placeholder="props.searchPlaceholder"
        autocomplete="off"
      >
        <template #default>
          <i class="i-carbon-search" aria-hidden="true" />
        </template>
      </FlatInput>
      <FlatButton
        v-if="searchValue"
        class="tuff-aside-search__clear"
        mini
        :aria-label="props.clearLabel"
        @click="handleClear"
      >
        <i class="i-carbon-close" aria-hidden="true" />
      </FlatButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tuff-aside-search {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tuff-aside-search__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--el-text-color-secondary);
}

.tuff-aside-search__field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.tuff-aside-search__field :deep(.FlatInput-Container) {
  width: 100%;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.tuff-aside-search__input {
  flex: 1;
}

.tuff-aside-search__clear {
  min-width: 32px;
  min-height: 32px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--el-text-color-placeholder);
}

.tuff-aside-search__clear > div {
  gap: 0;
  padding: 0;
  justify-content: center;
}

.tuff-aside-search__clear:hover {
  background: transparent;
  color: var(--el-text-color-primary);
}
</style>
