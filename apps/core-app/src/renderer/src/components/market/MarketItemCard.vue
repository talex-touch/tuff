<script setup lang="ts" name="MarketItemCard">
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import MarketIcon from '~/components/market/MarketIcon.vue'

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
  <div class="market-item-card" :class="{ verified: item.official }" @click="handleOpen">
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
  &.verified {
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
