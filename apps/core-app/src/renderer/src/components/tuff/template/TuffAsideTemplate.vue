<script setup lang="ts" name="TuffAsideTemplate">
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import TuffAsideSearchBar from './TuffAsideSearchBar.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    searchLabel?: string
    searchPlaceholder?: string
    searchId?: string
    searchable?: boolean
    clearLabel?: string
    mainAriaLive?: 'off' | 'polite' | 'assertive' | undefined
    mainEdgeBlur?: boolean
    /** Turns the pane headers into frameless-window drag surfaces without covering their controls. */
    windowDragRegion?: boolean
  }>(),
  {
    modelValue: '',
    searchLabel: '',
    searchPlaceholder: '',
    searchId: 'tuff-aside-template-search',
    searchable: true,
    clearLabel: 'Clear search',
    mainAriaLive: 'polite' as const,
    mainEdgeBlur: true,
    windowDragRegion: false
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'search', value: string): void
  (event: 'clear'): void
}>()
</script>

<template>
  <div class="TuffAsideTemplate" :class="{ 'has-window-drag-region': props.windowDragRegion }">
    <aside class="TuffAsideTemplate-Aside w-76" aria-label="Tuff aside layout">
      <slot name="aside">
        <div class="TuffAsideTemplate-AsideDefault">
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

          <TxScroll class="TuffAsideTemplate-AsideScroll">
            <div v-if="$slots.filter" class="TuffAsideTemplate-Filters">
              <slot name="filter" />
            </div>

            <div class="TuffAsideTemplate-AsideBody">
              <slot />
            </div>
          </TxScroll>
        </div>
      </slot>
      <div v-if="$slots.footer" class="TuffAsideTemplate-Footer fake-background">
        <slot name="footer" />
      </div>
    </aside>

    <section class="TuffAsideTemplate-Main" :aria-live="props.mainAriaLive">
      <template v-if="props.mainEdgeBlur">
        <TxGradualBlur position="top" height="72px" :strength="1.4" :opacity="0.9" :z-index="20" />
        <TxGradualBlur
          position="bottom"
          height="72px"
          :strength="1.4"
          :opacity="0.9"
          :z-index="20"
        />
      </template>
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

.TuffAsideTemplate.has-window-drag-region .TuffAsideTemplate-Search {
  display: flex;
  align-items: center;
  min-height: 44px;
  -webkit-app-region: drag;
}

.TuffAsideTemplate.has-window-drag-region .TuffAsideTemplate-Search :deep(.TuffAsideSearch) {
  width: 100%;
  -webkit-app-region: no-drag;
}

.TuffAsideTemplate-Aside {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tx-border-color-lighter);
  overflow: hidden;
}

.TuffAsideTemplate-AsideDefault {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.TuffAsideTemplate-AsideScroll {
  flex: 1;
  width: 100%;
  min-height: 0;
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
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.TuffAsideTemplate-Footer {
  border-top: 1px solid var(--tx-border-color-lighter);
  padding: 0.5rem 0.5rem;
}

.TuffAsideTemplate-Main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
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
