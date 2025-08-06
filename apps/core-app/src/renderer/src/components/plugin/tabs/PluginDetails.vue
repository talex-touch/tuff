<template>
  <div class="plugin-details">
    <div class="details-grid">
      <div class="glass-card">
        <div class="card-header">
          <i class="i-ri-information-line" />
          <h3>Basic Information</h3>
        </div>
        <div class="detail-list">
          <div class="detail-row">
            <span class="label">Plugin ID</span>
            <div class="value-with-copy">
              <code class="value">{{ plugin.name }}</code>
              <button 
                class="copy-mini"
                :class="{ copied: copyState.pluginId }"
                @click="copyToClipboard(plugin.name, 'pluginId')"
                title="Copy plugin ID"
              >
                <i :class="copyState.pluginId ? 'i-ri-check-line' : 'i-ri-file-copy-line'" />
              </button>
            </div>
          </div>
          <div class="detail-row">
            <span class="label">Version</span>
            <span class="value version">{{ plugin.version }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Mode</span>
            <span v-if="plugin.dev?.enable" class="value dev-mode">Development</span>
            <span v-else class="value prod-mode">Production</span>
          </div>
          <div v-if="plugin.dev?.address" class="detail-row">
            <span class="label">Dev Address</span>
            <a :href="plugin.dev.address" class="value link" target="_blank">
              {{ plugin.dev.address }}
              <i class="i-ri-external-link-line" />
            </a>
          </div>
        </div>
      </div>

      <div class="glass-card">
        <div class="card-header">
          <i class="i-ri-settings-3-line" />
          <h3>Configuration</h3>
        </div>
        <div class="detail-list">
          <div class="detail-row">
            <span class="label">Auto Start</span>
            <div class="toggle-indicator enabled">
              <div class="toggle-dot"></div>
              <span>Enabled</span>
            </div>
          </div>
          <div class="detail-row">
            <span class="label">Hot Reload</span>
            <div class="toggle-indicator" :class="{ enabled: plugin.dev?.enable }">
              <div class="toggle-dot"></div>
              <span>{{ plugin.dev?.enable ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-card">
        <div class="card-header">
          <i class="i-ri-folder-line" />
          <h3>File System</h3>
        </div>
        <div class="detail-list">
          <div class="detail-row">
            <span class="label">Plugin Path</span>
            <span class="value code truncate">~/plugins/{{ plugin.name }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Data Directory</span>
            <span class="value code truncate">~/data/{{ plugin.name }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Cache Size</span>
            <span class="value">2.4 MB</span>
          </div>
        </div>
      </div>

      <div class="glass-card">
        <div class="card-header">
          <i class="i-ri-time-line" />
          <h3>Performance</h3>
        </div>
        <div class="performance-metrics">
          <div class="metric">
            <span class="metric-label">Load Time</span>
            <span class="metric-value">156ms</span>
          </div>
          <div class="metric">
            <span class="metric-label">Memory</span>
            <span class="metric-value">8.2 MB</span>
          </div>
          <div class="metric">
            <span class="metric-label">CPU</span>
            <span class="metric-value">0.3%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Copy states
const copyState = ref({
  pluginId: false
})

// Copy functionality
async function copyToClipboard(text: string, type: string) {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value[type] = true
    setTimeout(() => {
      copyState.value[type] = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}
</script>

<style lang="scss" scoped>
.plugin-details {
  display: flex;
  flex-direction: column;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.glass-card {
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;

  i {
    font-size: 1.25rem;
    color: var(--el-color-primary);
  }

  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(var(--el-border-color-rgb), 0.2);

  &:last-child {
    border-bottom: none;
  }

  .label {
    font-weight: 500;
    color: var(--el-text-color-regular);
  }

  .value {
    color: var(--el-text-color-primary);
    text-align: right;

    &.code {
      font-family: 'SF Mono', Monaco, monospace;
      background: rgba(var(--el-fill-color-rgb), 0.6);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--el-border-color);
    }

    &.version {
      font-weight: 600;
      color: var(--el-color-success);
    }

    &.dev-mode {
      color: var(--el-color-info);
      font-weight: 500;
    }

    &.prod-mode {
      color: var(--el-color-success);
      font-weight: 500;
    }

    &.link {
      color: var(--el-color-primary);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.25rem;

      &:hover {
        text-decoration: underline;
      }
    }

    &.truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 150px;
    }
  }
}

.value-with-copy {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .value {
    font-family: 'SF Mono', Monaco, monospace;
    background: rgba(var(--el-fill-color-rgb), 0.6);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--el-border-color);
  }
}

.copy-mini {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: rgba(var(--el-fill-color-rgb), 0.6);
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
  }

  &.copied {
    background: var(--el-color-success-light-9);
    border-color: var(--el-color-success-light-5);
    color: var(--el-color-success);
  }

  i {
    font-size: 0.875rem;
  }
}

.toggle-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .toggle-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-text-color-disabled);
  }

  &.enabled .toggle-dot {
    background: var(--el-color-success);
    animation: pulse 2s infinite;
  }
}

.performance-metrics {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: rgba(var(--el-fill-color-rgb), 0.4);
  border-radius: 8px;
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  transition: all 0.3s ease;

  &:hover {
    background: rgba(var(--el-fill-color-rgb), 0.6);
    border-color: rgba(var(--el-color-primary-rgb), 0.2);
  }

  .metric-label {
    color: var(--el-text-color-regular);
  }

  .metric-value {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (max-width: 768px) {
  .details-grid {
    grid-template-columns: 1fr;
  }

  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;

    .value {
      text-align: left;
    }
  }
}
</style>