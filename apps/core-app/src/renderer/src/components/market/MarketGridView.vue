<script setup lang="ts" name="MarketGridView">
/**
 * MarketGridView - Grid/List view for displaying market plugins
 *
 * Features:
 * - Responsive grid layout with smooth animations
 * - FLIP animation for view type transitions
 * - Shows loading, empty, and plugin list states
 */
import gsap from 'gsap'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MarketPluginListItem } from '~/composables/market/useMarketData'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import MarketItemCard from './MarketItemCard.vue'

const props = defineProps<{
  /** List of plugins to display */
  plugins: MarketPluginListItem[]
  /** View mode: grid or list */
  viewType: 'grid' | 'list'
  /** Whether data is loading */
  loading: boolean
  /** Set of installed plugin names */
  installedNames?: Set<string>
}>()

// Get install task tracker
const { getInstallTask } = useMarketInstall()

const emit = defineEmits<{
  install: [plugin: MarketPluginListItem]
  'open-detail': [plugin: MarketPluginListItem]
}>()

const { t } = useI18n()
const gridRef = ref<HTMLElement | null>(null)
const isTransitioning = ref(false)

// Smooth animation functions using GSAP
function onBeforeEnter(el: Element) {
  gsap.set(el, {
    opacity: 0,
    y: 30,
    scale: 0.9,
    rotateX: -15
  })
}

function onEnter(el: Element, done: () => void) {
  const index = Number.parseInt((el as HTMLElement).dataset.index || '0')

  gsap.to(el, {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    duration: 0.6,
    delay: index * 0.1,
    ease: 'back.out(1.2)',
    onComplete: done
  })
}

function onLeave(el: Element, done: () => void) {
  const index = Number.parseInt((el as HTMLElement).dataset.index || '0')

  gsap.to(el, {
    opacity: 0,
    y: -20,
    scale: 0.95,
    duration: 0.4,
    delay: index * 0.05,
    ease: 'power2.in',
    onComplete: done
  })
}

// FLIP animation for grid/list view transition
watch(
  () => props.viewType,
  async (_newType, _oldType) => {
    if (!gridRef.value || isTransitioning.value) return

    isTransitioning.value = true
    const items = Array.from(gridRef.value.children) as HTMLElement[]

    // First: capture initial positions
    const firstPositions = items.map((item) => ({
      element: item,
      rect: item.getBoundingClientRect()
    }))

    // Last: wait for DOM to update to new layout
    await nextTick()

    // Invert & Play: calculate differences and animate
    firstPositions.forEach(({ element, rect: first }) => {
      const last = element.getBoundingClientRect()
      const deltaX = first.left - last.left
      const deltaY = first.top - last.top
      const deltaW = first.width / last.width
      const deltaH = first.height / last.height

      // Set initial transform (invert)
      gsap.set(element, {
        x: deltaX,
        y: deltaY,
        scaleX: deltaW,
        scaleY: deltaH,
        transformOrigin: 'top left'
      })

      // Animate to final position (play)
      gsap.to(element, {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: 0.5,
        ease: 'power2.out',
        onComplete: () => {
          isTransitioning.value = false
        }
      })
    })
  }
)
</script>

<template>
  <div class="market-grid-view">
    <div v-if="loading" class="market-loading">
      <i class="i-ri-loader-4-line animate-spin" />
      <span>{{ t('market.loading') }}</span>
    </div>

    <TransitionGroup
      v-else-if="plugins.length > 0"
      ref="gridRef"
      name="market-items"
      tag="div"
      class="market-grid"
      :class="[{ 'list-view': viewType === 'list' }]"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @leave="onLeave"
    >
      <MarketItemCard
        v-for="(item, index) in plugins"
        :key="item.id || item.name || index"
        :item="item"
        :index="index"
        :data-index="index"
        :is-installed="installedNames?.has(item.name) ?? false"
        :install-task="getInstallTask(item.id)"
        class="market-grid-item"
        @install="emit('install', item)"
        @open="emit('open-detail', item)"
      />
    </TransitionGroup>

    <div v-else class="market-empty">
      <div class="empty-icon">
        <i class="i-ri-search-line" />
      </div>
      <h3>{{ t('market.empty.title') }}</h3>
      <p>{{ t('market.empty.subtitle') }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.market-grid-view {
  flex: 1;
  overflow: auto;
  padding: 0.5rem 0;
}

.market-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem 0;
  color: var(--el-text-color-secondary);

  i {
    font-size: 2rem;
    color: var(--el-color-primary);
  }
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 1400px) {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 2rem;
  }

  &.list-view {
    grid-template-columns: 1fr;
    gap: 1rem;

    .market-grid-item {
      height: 100px;
    }
  }
}

.market-grid-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Transition Animations */
.market-items-move,
.market-items-enter-active,
.market-items-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.market-items-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

.market-items-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.market-items-leave-active {
  position: absolute;
  width: 100%;
}

/* Empty State */
.market-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;

  .empty-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--el-fill-color-light);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;

    i {
      font-size: 2rem;
      color: var(--el-text-color-placeholder);
    }
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    color: var(--el-text-color-regular);
    opacity: 0.8;
    max-width: 400px;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
