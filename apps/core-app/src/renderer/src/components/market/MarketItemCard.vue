<!--
  MarketItemCard Component
  
  Enhanced market item component with smooth animations and interactive hover effects
  Based on TopPlugins design for consistency
-->
<script setup lang="ts" name="MarketItemCard">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '@comp/base/button/FlatButton.vue'

interface MarketItem {
  id?: string
  name: string
  description: string
  version?: string
  author?: string
  downloads?: string
  rating?: number
  icon?: string
  category?: string
  official?: boolean
}

interface MarketItemCardProps {
  item: MarketItem
  index?: number
  installing?: boolean
}

const props = defineProps<MarketItemCardProps>()

const emits = defineEmits<{
  (e: 'install'): void
}>()

const { t } = useI18n()

const isInstalling = computed(() => props.installing === true)

/**
 * Handle mouse move event to create interactive hover effect
 * Updates CSS variables based on mouse position relative to the element
 */
function handleMove(event: MouseEvent): void {
  const element = event.currentTarget as HTMLElement
  const rect = element.getBoundingClientRect()

  const distanceX = event.clientX - rect.left
  const distanceY = event.clientY - rect.top

  element.style.setProperty('--x', distanceX + 'px')
  element.style.setProperty('--y', distanceY + 'px')
  element.style.setProperty('--op', '1')
}

/**
 * Reset hover effect when mouse leaves
 */
function handleLeave(event: MouseEvent): void {
  const element = event.currentTarget as HTMLElement
  element.style.setProperty('--op', '0')
}

function handleInstall(event: MouseEvent): void {
  event.stopPropagation()
  emits('install')
}
</script>

<template>
  <div class="market-item-card" @mousemove="handleMove" @mouseleave="handleLeave">
    <!-- Interactive hover effect background -->
    <div class="hover-effect" />

    <!-- Card content -->
    <div class="market-item-content">
      <!-- Icon section -->
      <div class="market-item-icon">
        <i v-if="item.icon" :class="`i-${item.icon}`" />
        <i v-else class="i-ri-puzzle-line" />
      </div>

      <!-- Info section -->
      <div class="market-item-info">
        <div class="market-item-header">
          <h3 class="market-item-title">{{ item.name || 'Unnamed Plugin' }}</h3>
          <span v-if="item.official" class="official-badge">{{ t('market.officialBadge') }}</span>
        </div>
        <p class="market-item-description">{{ item.description || 'No description available' }}</p>

        <!-- Stats section -->
        <div class="market-item-stats">
          <span v-if="item.downloads" class="stat-item downloads">
            <i class="i-ri-download-line" />
            {{ item.downloads }}
          </span>
          <span v-if="item.rating" class="stat-item rating">
            <i class="i-ri-star-fill" />
            {{ item.rating }}
          </span>
          <span v-if="item.version" class="stat-item version">
            <i class="i-ri-price-tag-3-line" />
            v{{ item.version }}
          </span>
        </div>

        <div class="market-item-meta">
          <span v-if="item.author" class="meta-chip">
            <i class="i-ri-user-line" />
            {{ item.author }}
          </span>
          <span v-if="item.category" class="meta-chip">
            <i class="i-ri-folder-3-line" />
            {{ item.category }}
          </span>
        </div>
      </div>

      <div class="market-item-actions">
        <FlatButton :primary="true" mini :disabled="isInstalling" @click="handleInstall">
          <i v-if="isInstalling" class="i-ri-loader-4-line animate-spin" />
          <span>{{ isInstalling ? t('market.installing') : t('market.install') }}</span>
        </FlatButton>
      </div>
    </div>

    <!-- Background mask -->
    <div class="background-mask" />
  </div>
</template>

<style lang="scss" scoped>
.market-item-card {
  position: relative;
  min-height: 140px;
  background: var(--el-fill-color-light);
  border-radius: 16px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  }
}

/* Interactive hover effect */
.hover-effect {
  position: absolute;
  inset: -2px;
  opacity: var(--op, 0);
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 18px;
  background: radial-gradient(
    200px circle at var(--x, 50%) var(--y, 50%),
    var(--el-color-primary-light-7) 0%,
    transparent 100%
  );
  filter: blur(8px);
  z-index: 0;
}

.market-item-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem;
  min-height: 140px;
  box-sizing: border-box;
}

.market-item-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-primary-light-9);
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  i {
    font-size: 24px;
    color: var(--el-color-primary);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

.market-item-card:hover .market-item-icon {
  background: var(--el-color-primary-light-8);
  transform: scale(1.05);

  i {
    color: var(--el-color-primary-dark-2);
  }
}

.market-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
}

.market-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-item-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
  transition: color 0.3s ease;
}

.official-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.12);
  color: var(--el-color-primary);
  letter-spacing: 0.4px;
}

.market-item-description {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  opacity: 0.8;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.market-item-stats {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
  opacity: 0.7;
  transition: opacity 0.3s ease;

  i {
    font-size: 12px;
  }

  &.downloads {
    color: var(--el-color-info);
  }

  &.rating {
    color: var(--el-color-warning);

    i {
      color: #f7ba2a;
    }
  }

  &.version {
    color: var(--el-color-success);
  }
}

.market-item-card:hover .stat-item {
  opacity: 0.9;
}

.market-item-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color);
  font-size: 11px;
  color: var(--el-text-color-secondary);

  i {
    font-size: 12px;
  }
}

.market-item-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
}

.background-mask {
  position: absolute;
  inset: 0;
  background: var(--el-fill-color);
  border-radius: 16px;
  z-index: 1;
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
