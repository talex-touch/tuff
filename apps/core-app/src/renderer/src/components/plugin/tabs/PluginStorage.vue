<template>
  <div class="plugin-storage">
    <div class="storage-overview">
      <div class="stats-grid">
        <div class="stat-card">
          <i class="i-ri-database-line" />
          <div class="stat-content">
            <span class="stat-value">2.4 MB</span>
            <span class="stat-label">Total Storage</span>
          </div>
        </div>
        <div class="stat-card">
          <i class="i-ri-file-line" />
          <div class="stat-content">
            <span class="stat-value">156</span>
            <span class="stat-label">Files</span>
          </div>
        </div>
        <div class="stat-card">
          <i class="i-ri-folder-line" />
          <div class="stat-content">
            <span class="stat-value">8</span>
            <span class="stat-label">Directories</span>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="card-header">
        <i class="i-ri-pie-chart-line" />
        <h3>Storage Breakdown</h3>
      </div>
      <div class="storage-items">
        <div v-for="item in storageItems" :key="item.name" class="storage-item">
          <div class="item-info">
            <i :class="item.icon" />
            <div class="item-details">
              <span class="item-name">{{ item.name }}</span>
              <code class="item-path">{{ item.path }}</code>
            </div>
          </div>
          <span class="item-size">{{ item.size }}</span>
        </div>
      </div>
    </div>

    <div class="action-buttons">
      <button class="action-button danger" @click="clearCache">
        <i class="i-ri-delete-bin-line" />
        Clear Cache
      </button>
      <button class="action-button" @click="openDataFolder">
        <i class="i-ri-folder-open-line" />
        Open Data
      </button>
      <button class="action-button" @click="exportData">
        <i class="i-ri-download-line" />
        Export
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Storage items
const storageItems = [
  { name: 'Configuration', path: 'config/', size: '1.2 MB', icon: 'i-ri-settings-line' },
  { name: 'Cache', path: 'cache/', size: '856 KB', icon: 'i-ri-image-line' },
  { name: 'Logs', path: 'logs/', size: '384 KB', icon: 'i-ri-file-text-line' },
  { name: 'Data', path: 'data/', size: '128 KB', icon: 'i-ri-database-line' }
]

// Storage management
function clearCache() {
  console.log('Clearing cache...')
}

function openDataFolder() {
  console.log('Opening data folder...')
}

function exportData() {
  console.log('Exporting data...')
}
</script>

<style lang="scss" scoped>
.plugin-storage {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.storage-overview {
  margin-bottom: 1rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.3);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  i {
    font-size: 1.5rem;
    color: var(--el-color-primary);
  }
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  margin-top: 0.25rem;
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

.storage-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.storage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: rgba(var(--el-fill-color-rgb), 0.4);
  border-radius: 8px;
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  transition: all 0.3s ease;

  &:hover {
    background: rgba(var(--el-fill-color-rgb), 0.6);
    border-color: rgba(var(--el-color-primary-rgb), 0.2);
  }
}

.item-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  i {
    font-size: 1.125rem;
    color: var(--el-color-primary);
  }
}

.item-details {
  display: flex;
  flex-direction: column;
}

.item-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.item-path {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  background: rgba(var(--el-fill-color-rgb), 0.6);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  margin-top: 0.25rem;
  align-self: flex-start;
}

.item-size {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  background: rgba(var(--el-fill-color-rgb), 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;

  &:hover:not(:disabled) {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(var(--el-color-primary-rgb), 0.2);
  }

  &.danger {
    background: rgba(var(--el-color-danger-rgb), 0.1);
    color: var(--el-color-danger);
    border-color: rgba(var(--el-color-danger-rgb), 0.2);

    &:hover:not(:disabled) {
      background: var(--el-color-danger-light-8);
      border-color: var(--el-color-danger-light-5);
    }
  }

  i {
    font-size: 1rem;
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>