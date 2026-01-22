<script setup lang="ts" name="MarketGridView">
import type { MarketPluginListItem } from '~/composables/market/useMarketData'
import { TxAutoSizer, TxSpinner } from '@talex-touch/tuffex'
/**
 * MarketGridView - Grid/List view for displaying market plugins
 *
 * Features:
 * - Responsive grid layout with smooth animations
 * - FLIP animation for view type transitions
 * - Shows loading, empty, and plugin list states
 */
import gsap from 'gsap'
import type { ComponentPublicInstance } from 'vue'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarketInstall } from '~/composables/market/useMarketInstall'
import { hasUpgradeAvailable } from '~/composables/market/useVersionCompare'
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
  /** Map of installed plugin names to their versions */
  installedVersions?: Map<string, string>
}>()

const emit = defineEmits<{
  install: [plugin: MarketPluginListItem]
  'open-detail': [plugin: MarketPluginListItem]
}>()

// Get install task tracker
const { getInstallTask } = useMarketInstall()

const { t } = useI18n()
const gridRef = ref<HTMLElement | ComponentPublicInstance | null>(null)
const isTransitioning = ref(false)
const enterStagger = 0.04
const flipStagger = 0.02
const bounceEase = 'back.out(1.6)'

// Smooth animation functions using GSAP
function onBeforeEnter(el: Element) {
  gsap.set(el, {
    opacity: 0,
    y: 16,
    scale: 0.96,
    rotateX: -8
  })
}

function onEnter(el: Element, done: () => void) {
  const index = Number.parseInt((el as HTMLElement).dataset.index || '0')
  const delay = index * enterStagger

  gsap.killTweensOf(el)
  gsap.to(el, {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    duration: 0.5,
    delay,
    ease: bounceEase,
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
    const gridEl =
      gridRef.value instanceof HTMLElement
        ? gridRef.value
        : (gridRef.value as ComponentPublicInstance | null)?.$el
    if (!gridEl) {
      isTransitioning.value = false
      return
    }
    const items = Array.from(gridEl.children) as HTMLElement[]
    if (items.length === 0) {
      isTransitioning.value = false
      return
    }
    let remaining = items.length

    // First: capture initial positions
    const firstPositions = items.map((item) => ({
      element: item,
      rect: item.getBoundingClientRect()
    }))

    // Last: wait for DOM to update to new layout
    await nextTick()

    // Invert & Play: calculate differences and animate
    firstPositions.forEach(({ element, rect: first }, index) => {
      const last = element.getBoundingClientRect()
      const deltaX = first.left - last.left
      const deltaY = first.top - last.top
      const deltaW = first.width / last.width
      const deltaH = first.height / last.height
      const delay = index * flipStagger

      gsap.killTweensOf(element)
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
        duration: 0.45,
        delay,
        ease: 'power2.out',
        onComplete: () => {
          remaining -= 1
          if (remaining <= 0) isTransitioning.value = false
        }
      })
    })
  }
)
</script>

<template>
  <div class="market-grid-view p-4">
    <div v-if="loading" class="flex flex-col w-full h-full items-center justify-center gap-4">
      <TxSpinner :size="32" />
      <span class="text-sm text-black/70 dark:text-light/70">{{ t('market.loading') }}</span>
    </div>

    <TransitionGroup
      v-else-if="plugins.length > 0"
      ref="gridRef"
      name="market-items"
      tag="div"
      class="market-grid"
      :class="[{ 'list-view': viewType === 'list' }, { 'is-flipping': isTransitioning }]"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @leave="onLeave"
    >
      <TxAutoSizer
        v-for="(item, index) in plugins"
        :key="`${item.providerId}::${item.id}` || item.name || index"
        :data-index="index"
        :width="true"
        :height="true"
        :duration-ms="240"
        easing="cubic-bezier(0.4, 0, 0.2, 1)"
      >
        <MarketItemCard
          :item="item"
          :index="index"
          :is-installed="installedNames?.has(item.name) ?? false"
          :installed-version="installedVersions?.get(item.name)"
          :has-upgrade="hasUpgradeAvailable(installedVersions?.get(item.name), item.version)"
          :install-task="getInstallTask(item.id, item.providerId)"
          class="market-grid-item"
          @install="emit('install', item)"
          @open="emit('open-detail', item)"
        />
      </TxAutoSizer>
    </TransitionGroup>

    <div v-else class="market-empty w-full h-full flex flex-col items-center justify-center">
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

.market-grid.is-flipping {
  .market-grid-item {
    transition: none;
  }

  .market-items-move,
  .market-items-enter-active,
  .market-items-leave-active {
    transition: none;
  }
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
