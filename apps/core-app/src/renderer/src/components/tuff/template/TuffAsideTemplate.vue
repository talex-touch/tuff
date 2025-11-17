<script setup lang="ts" name="TuffAsideTemplate">
import TuffAsideSearchBar from './TuffAsideSearchBar.vue'

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
            <TuffAsideSearchBar
              :modelValue="props.modelValue"
              :searchLabel="props.searchLabel"
              :searchPlaceholder="props.searchPlaceholder"
              :searchId="props.searchId"
              :clearLabel="props.clearLabel"
              @update:modelValue="emit('update:modelValue', $event)"
              @search="emit('search', $event)"
              @clear="emit('clear')"
            />
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
