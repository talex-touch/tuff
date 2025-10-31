<!--
  MarketItemCard Component
  
  Enhanced market item component with smooth animations and interactive hover effects
  Based on TopPlugins design for consistency
-->
<script setup lang="ts" name="MarketItemCard">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '@comp/base/button/FlatButton.vue'
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'

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
  metadata?: Record<string, unknown>
}

interface MarketItemCardProps {
  item: MarketItem
  index?: number
  installing?: boolean
  installTask?: PluginInstallProgressEvent
}

const props = defineProps<MarketItemCardProps>()

const emits = defineEmits<{
  (e: 'install'): void
  (e: 'open'): void
}>()

const { t } = useI18n()

const isInstalling = computed(() => props.installing === true)
const activeStages = new Set<PluginInstallProgressEvent['stage']>([
  'queued',
  'downloading',
  'awaiting-confirmation',
  'installing'
])

const installStage = computed<PluginInstallProgressEvent['stage'] | null>(() => {
  if (props.installTask?.stage) return props.installTask.stage
  return isInstalling.value ? 'installing' : null
})

const isActiveStage = computed(() =>
  installStage.value ? activeStages.has(installStage.value) : false
)

const progressValue = computed(() => {
  if (typeof props.installTask?.progress === 'number') {
    const normalized = Math.round(props.installTask.progress)
    return Math.max(0, Math.min(100, normalized))
  }
  if (installStage.value === 'installing') return 100
  return null
})

const showProgressCircle = computed(
  () => installStage.value === 'downloading' && progressValue.value !== null
)

const progressCircleStyle = computed(() =>
  showProgressCircle.value
    ? ({ '--progress': `${progressValue.value}%` } as Record<string, string>)
    : {}
)

const progressDisplay = computed(() =>
  progressValue.value !== null ? `${progressValue.value}` : ''
)

const showSpinner = computed(() => installStage.value === 'installing' && !showProgressCircle.value)

const buttonIcon = computed(() => {
  switch (installStage.value) {
    case 'queued':
      return 'i-ri-time-line'
    case 'awaiting-confirmation':
      return 'i-ri-shield-keyhole-line'
    case 'completed':
      return 'i-ri-check-line'
    case 'failed':
      return 'i-ri-error-warning-line'
    case 'cancelled':
      return 'i-ri-close-line'
    default:
      return ''
  }
})

const buttonLabel = computed(() => {
  switch (installStage.value) {
    case 'queued':
      return t('market.installation.status.queued')
    case 'downloading':
      return t('market.installation.status.downloading')
    case 'awaiting-confirmation':
      return t('market.installation.status.awaitingConfirm')
    case 'installing':
      return t('market.installation.status.installing')
    case 'completed':
      return t('market.installation.status.completed')
    case 'failed':
      return t('market.installation.status.failed')
    case 'cancelled':
      return t('market.installation.status.cancelled')
    default:
      return isInstalling.value ? t('market.installing') : t('market.install')
  }
})

const disableInstall = computed(() => isActiveStage.value)

const iconClass = computed(() => {
  if (!props.item) return ''

  const fromProp = typeof props.item.icon === 'string' ? props.item.icon.trim() : ''
  if (fromProp) {
    return fromProp.startsWith('i-') ? fromProp : `i-${fromProp}`
  }

  const metadata = props.item.metadata as Record<string, unknown> | undefined
  if (metadata) {
    const metaIconClass = typeof metadata.icon_class === 'string' ? metadata.icon_class.trim() : ''
    if (metaIconClass) return metaIconClass

    const metaIcon = typeof metadata.icon === 'string' ? metadata.icon.trim() : ''
    if (metaIcon) return metaIcon.startsWith('i-') ? metaIcon : `i-${metaIcon}`
  }

  return ''
})

function handleInstall(event: MouseEvent): void {
  event.stopPropagation()
  emits('install')
}

function handleOpen(): void {
  if (isInstalling.value) return
  emits('open')
}
</script>

<template>
  <div class="market-item-card" @click="handleOpen">
    <!-- Card content -->
    <div class="market-item-content">
      <!-- Icon section -->
      <div class="market-item-icon">
        <i v-if="iconClass" :class="iconClass" />
        <i v-else class="i-ri-puzzle-line" />
      </div>

      <!-- Info section -->
      <div class="market-item-info">
        <div class="market-item-header">
          <h3 class="market-item-title">{{ item.name || 'Unnamed Plugin' }}</h3>
          <span v-if="item.official" class="official-badge">
            <i class="i-ri-shield-check-fill" />
            {{ t('market.officialBadge') }}
          </span>
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
        <FlatButton :primary="true" mini :disabled="disableInstall" @click="handleInstall">
          <div class="install-button-content">
            <div v-if="showProgressCircle" class="install-progress" :style="progressCircleStyle">
              <span>{{ progressDisplay }}</span>
            </div>
            <i v-else-if="showSpinner" class="i-ri-loader-4-line animate-spin" />
            <i v-else-if="buttonIcon" :class="buttonIcon" />
            <span>{{ buttonLabel }}</span>
          </div>
        </FlatButton>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.market-item-card {
  position: relative;
  min-height: 140px;
  background: var(--el-bg-color-overlay);
  border-radius: 20px;
  border: 1px solid transparent;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    background 0.25s ease;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.35);
    background: var(--el-fill-color-light);
  }
}

.market-item-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  padding: 1.4rem 1.5rem;
  min-height: 140px;
  box-sizing: border-box;
}

.market-item-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb), 0.18),
    rgba(var(--el-color-primary-rgb), 0.05)
  );
  border-radius: 16px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.15);
  transition: all 0.25s ease;

  i {
    font-size: 26px;
    color: var(--el-color-primary);
    transition: color 0.25s ease;
  }
}

.market-item-card:hover .market-item-icon {
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb), 0.24),
    rgba(var(--el-color-primary-rgb), 0.08)
  );
  border-color: rgba(var(--el-color-primary-rgb), 0.3);

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
  flex-wrap: wrap;
}

.market-item-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
  transition: color 0.3s ease;
}

.official-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(var(--el-color-primary-rgb), 0.16);
  color: var(--el-color-primary);
  letter-spacing: 0.5px;

  i {
    font-size: 0.85rem;
  }
}

.market-item-description {
  margin: 0;
  font-size: 0.85rem;
  color: var(--el-text-color-regular);
  opacity: 0.85;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.market-item-stats {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 0.75rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
  opacity: 0.75;
  transition: opacity 0.3s ease;

  i {
    font-size: 0.8rem;
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
  padding: 0.35rem 0.6rem;
  border-radius: 14px;
  background: var(--el-fill-color);
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);

  i {
    font-size: 0.85rem;
  }
}

.market-item-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem;
}

.install-button-content {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.install-progress {
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: conic-gradient(
    var(--el-color-primary) var(--progress),
    rgba(var(--el-color-primary-rgb), 0.15) 0
  );
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  font-weight: 600;
  font-size: 0.65rem;
}

.install-progress::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--el-bg-color-overlay);
}

.install-progress span {
  position: relative;
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
