<script setup lang="ts" name="MarketItemCard">
/**
 * MarketItemCard - Card component for displaying a plugin in the market list
 *
 * Shows plugin icon, name, description and install button.
 * Delegates installation state logic to MarketInstallButton component.
 */
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'
import { useI18n } from 'vue-i18n'
import MarketIcon from '~/components/market/MarketIcon.vue'
import MarketInstallButton from '~/components/market/MarketInstallButton.vue'

interface MarketItem {
  id?: string
  name: string
  description?: string
  version?: string
  author?: string
  downloads?: string
  rating?: number
  icon?: string
  category?: string
  official?: boolean
  providerTrustLevel?: string
  metadata?: Record<string, unknown>
}

interface MarketItemCardProps {
  /** Plugin item data */
  item: MarketItem
  /** Card index in list (for animations) */
  index?: number
  /** Current installation task progress */
  installTask?: PluginInstallProgressEvent
  /** Whether plugin is already installed locally */
  isInstalled?: boolean
  /** Installed version (if installed) */
  installedVersion?: string
  /** Whether a newer version is available in market */
  hasUpgrade?: boolean
}

defineProps<MarketItemCardProps>()

const emit = defineEmits<{
  /** Emitted when install button is clicked */
  (e: 'install'): void
  /** Emitted when card is clicked to open details */
  (e: 'open'): void
}>()

const { t } = useI18n()

/**
 * Handles card click to open plugin details
 */
function handleOpen(): void {
  emit('open')
}

/**
 * Handles install button click
 */
function handleInstall(): void {
  emit('install')
}
</script>

<template>
  <div class="market-item-card" :class="{ 'official-provider': item.providerTrustLevel === 'official' }" @click="handleOpen">
    <div class="market-item-content">
      <MarketIcon
        v-shared-element:plugin-market-icon
        :item="item"
        :view-transition-name="`market-icon-${item.id}`"
      />

      <div class="market-item-info">
        <div class="market-item-header">
          <h3 class="market-item-title" :style="{ viewTransitionName: `market-title-${item.id}` }">
            {{ item.name || 'Unnamed Plugin' }}
          </h3>
          <i v-if="item.official" class="i-ri-verified-badge-fill official-badge" title="Official Plugin" />
        </div>
        <p
          v-if="item.description"
          class="market-item-description"
          :style="{ viewTransitionName: `market-description-${item.id}` }"
        >
          {{ item.description }}
        </p>
        <p v-else class="market-item-description placeholder">
          {{ t('market.noDescription') }}
        </p>
      </div>

      <div class="market-item-actions">
        <MarketInstallButton
          :plugin-name="item.name"
          :is-installed="isInstalled"
          :has-upgrade="hasUpgrade"
          :installed-version="installedVersion"
          :market-version="item.version"
          :install-task="installTask"
          @install="handleInstall"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.market-item-card {
  &.official-provider {
    &::before {
      content: '';
      position: absolute;

      inset: 0;

      border-radius: 22px;
      border-style: solid;
      border-image-slice: 1;
      border-image-source: linear-gradient(100deg, #3f5c1e 0%, #4d9375 68%);
      border-width: 8px;

      margin: -7px;

      opacity: 0.5;
      filter: blur(4px);
      mix-blend-mode: hard-light;
    }
  }

  position: relative;
  border-radius: 22px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.35);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    background 0.25s ease;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.5);
  }
}

.market-item-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  box-sizing: border-box;
}

.market-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
}

.market-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.market-item-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  transition: color 0.3s ease;
}

.market-item-description {
  margin: 0;
  font-size: 0.8rem;
  color: var(--el-text-color-regular);
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.official-badge {
  flex-shrink: 0;
  font-size: 1rem;
  color: #4d9375;
}
</style>
