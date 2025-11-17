<script setup lang="ts" name="TuffAsideTemplate">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    searchLabel?: string
    searchPlaceholder?: string
    searchId?: string
    searchable?: boolean
    clearLabel?: string
  }>(),
  {
    modelValue: '',
    searchLabel: '',
    searchPlaceholder: '',
    searchId: 'tuff-aside-template-search',
    searchable: true,
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
  <div class="tuff-aside-template">
    <aside class="tuff-aside-template__aside" aria-label="Tuff aside layout">
      <slot name="aside">
        <div class="tuff-aside-template__aside-default">
          <div v-if="$slots['aside-header']" class="tuff-aside-template__aside-header">
            <slot name="aside-header" />
          </div>

          <div v-if="props.searchable" class="tuff-aside-template__search">
            <label
              v-if="props.searchLabel"
              class="tuff-aside-template__search-label"
              :for="props.searchId"
            >
              {{ props.searchLabel }}
            </label>
            <div class="tuff-aside-template__search-field">
              <i class="i-carbon-search" aria-hidden="true" />
              <input
                :id="props.searchId"
                v-model="searchValue"
                class="tuff-aside-template__search-input"
                type="search"
                :placeholder="props.searchPlaceholder"
                autocomplete="off"
              />
              <button
                v-if="searchValue"
                class="tuff-aside-template__search-clear"
                type="button"
                :aria-label="props.clearLabel"
                @click="handleClear"
              >
                <i class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div v-if="$slots.filter" class="tuff-aside-template__filters">
            <slot name="filter" />
          </div>

          <div class="tuff-aside-template__aside-body">
            <slot />
          </div>
        </div>
      </slot>
    </aside>

    <section class="tuff-aside-template__main">
      <slot name="main" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.tuff-aside-template {
  display: flex;
  height: 100%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.tuff-aside-template__aside {
  width: 22rem;
  min-width: 20rem;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  padding: 1.25rem;
  overflow-y: auto;
}

.tuff-aside-template__aside-default {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.tuff-aside-template__search {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tuff-aside-template__search-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--el-text-color-secondary);
}

.tuff-aside-template__search-field {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--el-border-color);
  border-radius: 0.75rem;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);

  i {
    font-size: 1rem;
    color: var(--el-text-color-placeholder);
  }
}

.tuff-aside-template__search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font: inherit;
  color: inherit;

  &::placeholder {
    color: var(--el-text-color-placeholder);
  }
}

.tuff-aside-template__search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--el-text-color-placeholder);
  cursor: pointer;

  &:hover {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
  }
}

.tuff-aside-template__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tuff-aside-template__aside-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tuff-aside-template__main {
  flex: 1;
  background: var(--el-bg-color);
  padding: 1.5rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
