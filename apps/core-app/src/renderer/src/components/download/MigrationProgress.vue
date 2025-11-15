<template>
  <div v-if="visible" class="migration-overlay">
    <div class="migration-dialog">
      <div class="migration-header">
        <h2>{{ $t('download.migration.title') }}</h2>
        <p class="migration-subtitle">{{ $t('download.migration.subtitle') }}</p>
      </div>

      <div class="migration-content">
        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              :style="{ width: `${progress.percentage}%` }"
              :class="progressClass"
            ></div>
          </div>
          <div class="progress-text">
            {{ progress.percentage }}%
          </div>
        </div>

        <!-- Phase Indicator -->
        <div class="phase-indicator">
          <div 
            v-for="phase in phases" 
            :key="phase.key"
            class="phase-item"
            :class="{ 
              active: progress.phase === phase.key,
              completed: isPhaseCompleted(phase.key)
            }"
          >
            <div class="phase-icon">
              <i v-if="isPhaseCompleted(phase.key)" class="icon-check"></i>
              <i v-else-if="progress.phase === phase.key" class="icon-spinner"></i>
              <i v-else :class="phase.icon"></i>
            </div>
            <div class="phase-label">{{ $t(`download.migration.phase.${phase.key}`) }}</div>
          </div>
        </div>

        <!-- Status Message -->
        <div class="status-message" :class="messageClass">
          <i :class="messageIcon"></i>
          <span>{{ progress.message }}</span>
        </div>

        <!-- Details -->
        <div v-if="showDetails" class="migration-details">
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.migration.tasks') }}:</span>
            <span class="detail-value">{{ result?.migratedTasks || 0 }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.migration.history') }}:</span>
            <span class="detail-value">{{ result?.migratedHistory || 0 }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">{{ $t('download.migration.config') }}:</span>
            <span class="detail-value">
              {{ result?.migratedConfig ? $t('common.yes') : $t('common.no') }}
            </span>
          </div>
          <div v-if="result?.duration" class="detail-item">
            <span class="detail-label">{{ $t('download.migration.duration') }}:</span>
            <span class="detail-value">{{ formatDuration(result.duration) }}</span>
          </div>
        </div>

        <!-- Errors -->
        <div v-if="result?.errors && result.errors.length > 0" class="migration-errors">
          <h3>{{ $t('download.migration.errors') }}</h3>
          <ul>
            <li v-for="(error, index) in result.errors" :key="index">{{ error }}</li>
          </ul>
        </div>
      </div>

      <div class="migration-footer">
        <button 
          v-if="progress.phase === 'complete'" 
          class="btn-primary"
          @click="handleClose"
        >
          {{ $t('common.close') }}
        </button>
        <button 
          v-else-if="progress.phase === 'error'" 
          class="btn-secondary"
          @click="handleRetry"
        >
          {{ $t('common.retry') }}
        </button>
        <div v-else class="loading-text">
          {{ $t('download.migration.pleaseWait') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface MigrationProgress {
  phase: 'scanning' | 'migrating' | 'validating' | 'complete' | 'error'
  current: number
  total: number
  message: string
  percentage: number
}

interface MigrationResult {
  success: boolean
  migratedTasks: number
  migratedHistory: number
  migratedConfig: boolean
  errors: string[]
  duration: number
}

const visible = ref(false)
const progress = ref<MigrationProgress>({
  phase: 'scanning',
  current: 0,
  total: 100,
  message: '',
  percentage: 0
})
const result = ref<MigrationResult | null>(null)

const phases = [
  { key: 'scanning', icon: 'icon-search' },
  { key: 'migrating', icon: 'icon-download' },
  { key: 'validating', icon: 'icon-check-circle' },
  { key: 'complete', icon: 'icon-success' }
]

const showDetails = computed(() => {
  return progress.value.phase === 'complete' || progress.value.phase === 'error'
})

const progressClass = computed(() => {
  return {
    'progress-error': progress.value.phase === 'error',
    'progress-success': progress.value.phase === 'complete'
  }
})

const messageClass = computed(() => {
  return {
    'message-error': progress.value.phase === 'error',
    'message-success': progress.value.phase === 'complete'
  }
})

const messageIcon = computed(() => {
  switch (progress.value.phase) {
    case 'error':
      return 'icon-error'
    case 'complete':
      return 'icon-success'
    default:
      return 'icon-info'
  }
})

function isPhaseCompleted(phase: string): boolean {
  const phaseOrder = ['scanning', 'migrating', 'validating', 'complete']
  const currentIndex = phaseOrder.indexOf(progress.value.phase)
  const phaseIndex = phaseOrder.indexOf(phase)
  return phaseIndex < currentIndex || progress.value.phase === 'complete'
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function handleClose() {
  visible.value = false
}

function handleRetry() {
  window.electron?.ipcRenderer.send('download:retry-migration')
}

function handleProgress(_event: any, data: MigrationProgress) {
  progress.value = data
}

function handleResult(_event: any, data: MigrationResult) {
  result.value = data
}

async function checkMigrationNeeded() {
  try {
    const needed = await window.electron?.ipcRenderer.invoke('download:check-migration-needed')
    if (needed) {
      visible.value = true
      window.electron?.ipcRenderer.send('download:start-migration')
    }
  } catch (error) {
    console.error('Failed to check migration status:', error)
  }
}

onMounted(() => {
  window.electron?.ipcRenderer.on('download:migration-progress', handleProgress)
  window.electron?.ipcRenderer.on('download:migration-result', handleResult)
  
  // Check if migration is needed on mount
  checkMigrationNeeded()
})

onUnmounted(() => {
  window.electron?.ipcRenderer.removeListener('download:migration-progress', handleProgress)
  window.electron?.ipcRenderer.removeListener('download:migration-result', handleResult)
})
</script>

<style scoped>
.migration-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.migration-dialog {
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 24px;
  max-width: 600px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.migration-header {
  margin-bottom: 24px;
  text-align: center;
}

.migration-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: var(--text-primary);
}

.migration-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.migration-content {
  margin-bottom: 24px;
}

.progress-container {
  margin-bottom: 24px;
}

.progress-bar {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 4px;
}

.progress-fill.progress-error {
  background: var(--color-error);
}

.progress-fill.progress-success {
  background: var(--color-success);
}

.progress-text {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.phase-indicator {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 0 16px;
}

.phase-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}

.phase-item.active,
.phase-item.completed {
  opacity: 1;
}

.phase-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-secondary);
}

.phase-item.active .phase-icon {
  background: var(--color-primary);
  color: white;
}

.phase-item.completed .phase-icon {
  background: var(--color-success);
  color: white;
}

.phase-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.status-message {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.status-message.message-error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
}

.status-message.message-success {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
}

.migration-details {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-label {
  color: var(--text-secondary);
  font-size: 14px;
}

.detail-value {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.migration-errors {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--color-error);
  border-radius: 8px;
  padding: 16px;
}

.migration-errors h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: var(--color-error);
}

.migration-errors ul {
  margin: 0;
  padding-left: 20px;
}

.migration-errors li {
  color: var(--text-primary);
  font-size: 14px;
  margin-bottom: 4px;
}

.migration-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-primary,
.btn-secondary {
  padding: 10px 24px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
}

.loading-text {
  color: var(--text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-spinner {
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
