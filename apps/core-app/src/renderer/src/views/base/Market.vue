<template>
  <div class="market-container">
    <!-- Header Section -->
    <div class="market-header">
      <div class="market-header-title">
        <h2>Plugin Market</h2>
        <span class="market-subtitle">Discover amazing plugins for your workflow</span>
      </div>

      <div class="market-header-search">
        <FlatCompletion :fetch="fetch" placeholder="Search plugins..." />
        <div
          :class="{ _disabled: sourceEditorShow }"
          class="market-sources"
          flex
          items-center
          gap-2
        >
          <FlatButton mini @click="toggleSourceEditorShow()">
            <div class="i-carbon-list" />
          </FlatButton>
          <span class="source-count">{{ pluginSettings.source.list.length }} sources</span>
        </div>
      </div>

      <div class="market-header-controls">
        <div class="market-tags">
          <button
            v-for="(item, index) in tags"
            :key="item.tag"
            @click="tagInd = index"
            :class="{ active: tagInd === index }"
            class="tag-button"
          >
            {{ item.tag }}
          </button>
        </div>
        <div class="market-view-toggle">
          <TLabelSelect v-model="orderType">
            <TLabelSelectItem value="grid" icon="i-carbon-table-split" />
            <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
          </TLabelSelect>
        </div>
      </div>
    </div>

    <!-- Market Items Grid -->
    <div class="market-content">
      <transition-group
        name="market-items"
        tag="div"
        :class="['market-grid', { 'list-view': orderType === 'list' }]"
        @before-enter="onBeforeEnter"
        @enter="onEnter"
        @leave="onLeave"
      >
        <MarketItemCard
          v-for="(item, index) in value"
          :key="item.name || index"
          :item="item"
          :index="index"
          :data-index="index"
          class="market-grid-item"
        />
      </transition-group>

      <!-- Empty State -->
      <div v-if="value.length === 0" class="market-empty">
        <div class="empty-icon">
          <i class="i-ri-search-line" />
        </div>
        <h3>No plugins found</h3>
        <p>Try adjusting your search or browse different categories</p>
      </div>
    </div>
  </div>

  <MarketSourceEditor :toggle="toggleSourceEditorShow" :show="sourceEditorShow" />
</template>

<script name="Market" setup>
import { pluginSettings } from '~/modules/storage/plugin-settings'
import gsap from 'gsap'
import FlatCompletion from '@comp/base/input/FlatCompletion.vue'
import MarketItemCard from '@comp/market/MarketItemCard.vue'
import MarketSourceEditor from '~/views/base/market/MarketSourceEditor.vue'
import { useToggle } from '@vueuse/core'

const orderType = ref('grid')
const [sourceEditorShow, toggleSourceEditorShow] = useToggle()
const tagInd = ref(0)

const tags = reactive([
  { tag: 'All', filter: '' },
  { tag: 'Feature', filter: 'feature' },
  { tag: 'UI', filter: 'ui' },
  { tag: 'UX', filter: 'ux' },
  { tag: 'Enhancement', filter: 'enhancement' },
  { tag: 'Tools', filter: 'tools' },
  { tag: 'Productivity', filter: 'productivity' }
])

const value = ref([])

// Enhanced fetch function with better mock data
function fetch(key) {
  value.value = []

  const mockPlugins = [
    {
      name: 'Smart Clipboard',
      description:
        'Advanced clipboard manager with history, sync, and smart suggestions for enhanced productivity',
      version: '2.1.0',
      author: 'TalexTeam',
      downloads: '2.3M',
      rating: 4.8,
      icon: 'ri-clipboard-line',
      category: 'productivity'
    },
    {
      name: 'Universal Translator',
      description:
        'Real-time translation for 100+ languages with offline support and context awareness',
      version: '1.5.2',
      author: 'LangTech',
      downloads: '1.8M',
      rating: 4.7,
      icon: 'ri-translate-2',
      category: 'tools'
    },
    {
      name: 'Quick Search Pro',
      description:
        'Lightning-fast search across files, web, and applications with AI-powered suggestions',
      version: '3.0.1',
      author: 'SearchLab',
      downloads: '3.1M',
      rating: 4.9,
      icon: 'ri-search-line',
      category: 'productivity'
    },
    {
      name: 'AI Code Assistant',
      description:
        'Intelligent coding companion with auto-completion, refactoring, and bug detection',
      version: '1.8.0',
      author: 'DevAI',
      downloads: '1.5M',
      rating: 4.6,
      icon: 'ri-robot-line',
      category: 'development'
    },
    {
      name: 'Secure Vault',
      description:
        'Military-grade password manager with biometric authentication and secure sharing',
      version: '4.2.1',
      author: 'SecureTech',
      downloads: '2.7M',
      rating: 4.8,
      icon: 'ri-shield-keyhole-line',
      category: 'security'
    }
  ]

  const filteredPlugins = mockPlugins.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(key.toLowerCase()) ||
      plugin.description.toLowerCase().includes(key.toLowerCase())
  )

  value.value = filteredPlugins.slice(0, Math.min(key.length * 2, 12))

  return []
}

// Smooth animation functions using GSAP
function onBeforeEnter(el) {
  gsap.set(el, {
    opacity: 0,
    y: 30,
    scale: 0.9,
    rotateX: -15
  })
}

function onEnter(el, done) {
  const index = parseInt(el.dataset.index) || 0

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

function onLeave(el, done) {
  const index = parseInt(el.dataset.index) || 0

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

// Initialize with some sample data
onMounted(() => {
  fetch('plugin')
})
</script>

<style lang="scss" scoped>
.market-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}

/* Header Styles */
.market-header {
  position: relative;
  padding: 2rem 2.5rem 1.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-extra-light);
}

.market-header-title {
  margin-bottom: 2rem;

  h2 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
    letter-spacing: -0.025em;
  }

  .market-subtitle {
    font-size: 1rem;
    color: var(--el-text-color-regular);
    opacity: 0.8;
  }
}

.market-header-search {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;

  :deep(.FlatInput-Container) {
    flex: 1;
    max-width: 500px;
    margin: 0;
  }

  .market-sources {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: opacity 0.3s ease;

    &._disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .source-count {
      font-size: 0.875rem;
      color: var(--el-text-color-regular);
      opacity: 0.7;
    }
  }
}

.market-header-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.market-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tag-button {
  position: relative;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--el-border-color);
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    transform: translateY(-1px);
  }

  &.active {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
  }
}

.market-view-toggle {
  display: flex;
  align-items: center;
}

/* Content Styles */
.market-content {
  flex: 1;
  overflow: auto;
  padding: 2rem 2.5rem;
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;

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

/* Responsive Design */
@media (max-width: 768px) {
  .market-header {
    padding: 1.5rem 1rem;
  }

  .market-content {
    padding: 1.5rem 1rem;
  }

  .market-header-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }

  .market-tags {
    order: 2;
  }

  .market-view-toggle {
    order: 1;
    justify-content: flex-end;
  }
}
</style>
