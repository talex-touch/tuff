<script setup lang="ts" name="MarketInstallButton">
/**
 * MarketInstallButton - Reusable plugin installation button component
 *
 * Displays different states based on installation progress and whether
 * the plugin is already installed locally.
 *
 * @example
 * ```vue
 * <MarketInstallButton
 *   :plugin-name="plugin.name"
 *   :is-installed="isInstalled"
 *   :install-task="installTask"
 *   @install="handleInstall"
 * />
 * ```
 */
import type { PluginInstallProgressEvent } from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'

interface Props {
  /** Name of the plugin (used for display/tracking) */
  pluginName?: string
  /** Whether the plugin is already installed locally */
  isInstalled?: boolean
  /** Whether a newer version is available */
  hasUpgrade?: boolean
  /** Currently installed version */
  installedVersion?: string
  /** Market version available */
  marketVersion?: string
  /** Current installation task progress (if any) */
  installTask?: PluginInstallProgressEvent | null
  /** Whether to show in mini mode (smaller button) */
  mini?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pluginName: '',
  isInstalled: false,
  hasUpgrade: false,
  installedVersion: '',
  marketVersion: '',
  installTask: null,
  mini: true
})

const emit = defineEmits<{
  /** Emitted when user clicks install button */
  (e: 'install'): void
}>()

const { t } = useI18n()

/** Set of stages that indicate active installation */
const ACTIVE_STAGES = new Set<PluginInstallProgressEvent['stage']>([
  'queued',
  'downloading',
  'verifying',
  'awaiting-confirmation',
  'installing'
])

/** Current installation stage from task */
const installStage = computed<PluginInstallProgressEvent['stage'] | null>(() => {
  return props.installTask?.stage ?? null
})

/** Whether installation is currently in progress */
const isActiveStage = computed(() =>
  installStage.value ? ACTIVE_STAGES.has(installStage.value) : false
)

/** Download progress percentage (0-100) */
const progressValue = computed(() => {
  if (typeof props.installTask?.progress === 'number') {
    return Math.max(0, Math.min(100, Math.round(props.installTask.progress)))
  }
  if (installStage.value === 'installing') return 100
  return null
})

/** Whether to show circular progress indicator */
const showProgressCircle = computed(
  () =>
    (installStage.value === 'downloading' || installStage.value === 'verifying') &&
    progressValue.value !== null
)

/** CSS variable for progress circle */
const progressCircleStyle = computed(() =>
  showProgressCircle.value
    ? ({ '--progress': `${progressValue.value}%` } as Record<string, string>)
    : {}
)

/** Progress percentage display text */
const progressDisplay = computed(() =>
  progressValue.value !== null ? `${progressValue.value}` : ''
)

/** Whether to show spinning loader */
const showSpinner = computed(() => installStage.value === 'installing' && !showProgressCircle.value)

/** Button icon based on current state */
const buttonIcon = computed(() => {
  // Has upgrade available - show upload/upgrade icon
  if (props.isInstalled && props.hasUpgrade && !installStage.value) {
    return 'i-ri-arrow-up-circle-line'
  }

  // Already installed and up to date - show double checkmark
  if (props.isInstalled && !installStage.value) {
    return 'i-ri-check-double-line'
  }

  switch (installStage.value) {
    case 'queued':
      return 'i-ri-time-line'
    case 'verifying':
      return 'i-ri-shield-check-line'
    case 'awaiting-confirmation':
      return 'i-ri-shield-keyhole-line'
    case 'completed':
      return 'i-ri-check-line'
    case 'failed':
      return 'i-ri-error-warning-line'
    case 'cancelled':
      return 'i-ri-close-line'
    default:
      return 'i-ri-download-line'
  }
})

/** Button label text based on current state */
const buttonLabel = computed(() => {
  // Has upgrade available
  if (props.isInstalled && props.hasUpgrade && !installStage.value) {
    return t('market.upgrade')
  }

  // Already installed and up to date
  if (props.isInstalled && !installStage.value) {
    return t('market.installed')
  }

  switch (installStage.value) {
    case 'queued':
      return t('market.installation.status.queued')
    case 'downloading':
      return t('market.installation.status.downloading')
    case 'verifying':
      return t('market.installation.status.verifying')
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
      return t('market.install')
  }
})

/** Whether install button should be disabled */
const isDisabled = computed(() => {
  // Disabled during active installation
  if (isActiveStage.value) return true
  // Disabled if installed AND no upgrade available
  if (props.isInstalled && !props.hasUpgrade) return true
  return false
})

/**
 * Handles install button click
 */
function handleClick(event: MouseEvent): void {
  event.stopPropagation()
  if (!isDisabled.value) {
    emit('install')
  }
}
</script>

<template>
  <FlatButton
    :primary="!isInstalled || hasUpgrade"
    :mini="mini"
    :disabled="isDisabled"
    :class="{ 'upgrade-available': hasUpgrade && isInstalled && !isActiveStage }"
    @click="handleClick"
  >
    <div class="install-button-content">
      <div v-if="showProgressCircle" class="install-progress" :style="progressCircleStyle">
        <span>{{ progressDisplay }}</span>
      </div>
      <i v-else-if="showSpinner" class="i-ri-loader-4-line animate-spin" />
      <i v-else :class="buttonIcon" />
      <span>{{ buttonLabel }}</span>
    </div>
  </FlatButton>
</template>

<style lang="scss" scoped>
.install-button-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
