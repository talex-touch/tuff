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
    mainAriaLive?: string
  }>(),
  {
    modelValue: '',
    searchLabel: '',
    searchPlaceholder: '',
    searchId: 'tuff-aside-template-search',
    searchable: true,
    clearLabel: 'Clear search',
    mainAriaLive: 'polite'
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'search', value: string): void
  (event: 'clear'): void
}>()
</script>

<template>
  <div class="TuffAsideTemplate">
    <aside class="TuffAsideTemplate-Aside w-76" aria-label="Tuff aside layout">
      <slot name="aside">
        <TouchScroll class="TuffAsideTemplate-AsideDefault">
          <template #header>
            <header
              v-if="$slots['aside-header']"
              class="TuffAsideTemplate-AsideHeader fake-background"
            >
              <slot name="aside-header" />
            </header>

            <header v-if="props.searchable" class="TuffAsideTemplate-Search fake-background">
              <TuffAsideSearchBar
                :model-value="props.modelValue"
                :search-label="props.searchLabel"
                :search-placeholder="props.searchPlaceholder"
                :search-id="props.searchId"
                :clear-label="props.clearLabel"
                @update:model-value="emit('update:modelValue', $event)"
                @search="emit('search', $event)"
                @clear="emit('clear')"
              />
            </header>
          </template>

          <div v-if="$slots.filter" class="TuffAsideTemplate-Filters">
            <slot name="filter" />
          </div>

          <div class="TuffAsideTemplate-AsideBody">
            <slot />
          </div>
        </TouchScroll>
      </slot>
      <div v-if="$slots.footer" class="TuffAsideTemplate-Footer fake-background">
        <slot name="footer" />
      </div>
    </aside>

    <section class="TuffAsideTemplate-Main" :aria-live="props.mainAriaLive">
      <Transition name="fade-slide" mode="out-in">
        <slot name="main" />
      </Transition>
    </section>
  </div>
</template>

<style scoped lang="scss">
.TuffAsideTemplate {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.TuffAsideTemplate-Aside {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.TuffAsideTemplate-AsideDefault {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  width: 100%;
}

.TuffAsideTemplate-AsideHeader {
  padding: 1.5rem;
}

.TuffAsideTemplate-Filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.TuffAsideTemplate-AsideBody {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.TuffAsideTemplate-Footer {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 0.5rem 0.5rem;
}

.TuffAsideTemplate-Main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
