<template>
  <div class="plugin-info-container">
    <!-- Enhanced Plugin Header -->
    <div class="plugin-header">
      <div class="plugin-header-main">
        <div class="plugin-icon">
          <i v-if="plugin.icon?.value" class="plugin-icon-img" />
          <i v-else class="i-ri-puzzle-line default-icon" />
        </div>
        <div class="plugin-meta">
          <h1 class="plugin-name">{{ plugin.name }}</h1>
          <p class="plugin-description">{{ plugin.desc }}</p>
          <div class="plugin-badges">
            <span v-if="plugin.dev?.enable" class="badge dev-badge">
              <i class="i-ri-code-line" />
              Development
            </span>
            <span class="badge version-badge">
              <i class="i-ri-price-tag-3-line" />
              v{{ plugin.version }}
            </span>
            <span :class="['badge', 'status-badge', statusClass]">
              <i :class="statusIcon" />
              {{ statusText }}
            </span>
          </div>
        </div>
      </div>

      <!-- Plugin Actions -->
      <div class="plugin-actions">
        <FlatButton
          class="action-btn-sm explore-btn"
          title="Open plugin directory"
          :disabled="loadingStates.openFolder"
          @click="handleOpenPluginFolder"
        >
          <i v-if="!loadingStates.openFolder" class="i-ri-external-link-line" />
          <i v-else class="i-ri-loader-4-line animate-spin" />
        </FlatButton>

        <FlatButton
          v-if="plugin.dev?.enable"
          class="action-btn-sm dev-btn"
          title="Open development tools"
          :disabled="loadingStates.openDevTools"
          @click="handleOpenDevTools"
        >
          <i v-if="!loadingStates.openDevTools" class="i-ri-terminal-line" />
          <i v-else class="i-ri-loader-4-line animate-spin" />
        </FlatButton>

        <FlatButton
          class="action-btn-sm settings-btn"
          title="Plugin settings"
          :disabled="loadingStates.openSettings"
          @click="handlePluginSettings"
        >
          <i v-if="!loadingStates.openSettings" class="i-ri-settings-3-line" />
          <i v-else class="i-ri-loader-4-line animate-spin" />
        </FlatButton>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-container">
      <div class="tabs-nav">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: activeTab === tab.id }"
          @click="setActiveTab(tab.id)"
        >
          <i :class="tab.icon" />
          <span>{{ tab.label }}</span>
          <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </div>
        <div class="tab-indicator" :style="tabIndicatorStyle" />
      </div>

      <!-- Tab Content -->
      <div class="tabs-content">
        <TouchScroll class="tab-scroll">
          <transition :name="slideDirection" mode="out-in">
            <!-- Overview Tab -->
            <div v-if="activeTab === 'overview'" key="overview" class="tab-panel overview-panel">
              <!-- Status Section -->
              <div class="section">
                <h3 class="section-title">
                  <i class="i-ri-pulse-line" />
                  Status & Health
                </h3>
                <div class="section-content">
                  <plugin-status :plugin="plugin" />
                </div>
              </div>

              <!-- Environment Section -->
              <div v-if="platforms && Object.keys(platforms).length" class="section">
                <h3 class="section-title">
                  <i class="i-ri-computer-line" />
                  Environment Support
                </h3>
                <div class="section-content">
                  <div class="platform-grid">
                    <div
                      v-for="(platform, platformName) in platforms"
                      :key="platformName"
                      class="platform-card"
                      :class="{ enabled: platform?.enable }"
                    >
                      <div class="platform-header">
                        <OSIcon class="platform-icon" :os="platformName" />
                        <span class="platform-name">{{ platformName }}</span>
                        <span v-if="platform?.enable" class="status-dot enabled" />
                        <span v-else class="status-dot disabled" />
                      </div>
                      <div v-if="platform?.enable" class="platform-tags">
                        <el-tag
                          v-for="(tag, index) in platform.os"
                          :key="`os-${index}`"
                          size="small"
                          type="primary"
                        >
                          {{ tag }}
                        </el-tag>
                        <el-tag
                          v-for="(tag, index) in platform.arch"
                          :key="`arch-${index}`"
                          size="small"
                          type="info"
                        >
                          {{ tag }}
                        </el-tag>
                      </div>
                      <span v-else class="not-supported">Not supported</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Readme Section -->
              <div v-if="plugin.readme" class="section readme-section">
                <h3 class="section-title">
                  <i class="i-ri-file-text-line" />
                  Documentation
                </h3>
                <div class="section-content">
                  <div class="readme-content">
                    <FlatMarkdown v-model="readme" :readonly="true" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Features Tab -->
            <div v-else-if="activeTab === 'features'" key="features" class="tab-panel features-panel">
              <div v-if="plugin.features?.length" class="features-container">
                <div class="features-stats">
                  <div class="stat-card">
                    <i class="i-ri-function-line" />
                    <div class="stat-info">
                      <span class="stat-number">{{ plugin.features.length }}</span>
                      <span class="stat-label">Features</span>
                    </div>
                  </div>
                  <div class="stat-card">
                    <i class="i-ri-terminal-line" />
                    <div class="stat-info">
                      <span class="stat-number">{{ totalCommands }}</span>
                      <span class="stat-label">Commands</span>
                    </div>
                  </div>
                </div>

                <div class="features-list">
                  <div
                    v-for="feature in plugin.features"
                    :key="feature.id"
                    class="feature-card"
                    :class="{ expanded: expandedFeatures.has(feature.id) }"
                    @click="toggleFeatureDetails(feature.id)"
                  >
                    <div class="feature-header">
                      <div class="feature-info">
                        <h4 class="feature-name">{{ feature.name }}</h4>
                        <p class="feature-desc">{{ feature.desc }}</p>
                      </div>
                      <div class="feature-meta">
                        <span class="commands-count">{{ feature.commands.length }} commands</span>
                        <i class="i-ri-arrow-down-s-line expand-icon" />
                      </div>
                    </div>

                    <transition name="feature-expand">
                      <div v-if="expandedFeatures.has(feature.id)" class="feature-details">
                        <div class="commands-grid">
                          <div
                            v-for="command in feature.commands"
                            :key="command.name"
                            class="command-card"
                          >
                            <div class="command-header">
                              <span class="command-name">{{ command.name }}</span>
                              <span v-if="command.shortcut" class="command-shortcut">{{ command.shortcut }}</span>
                            </div>
                            <p v-if="command.desc" class="command-desc">{{ command.desc }}</p>
                          </div>
                        </div>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
              <div v-else class="empty-state">
                <i class="i-ri-function-line empty-icon" />
                <h3>No Features Available</h3>
                <p>This plugin doesn't expose any features yet.</p>
              </div>
            </div>

            <!-- Details Tab -->
            <div v-else-if="activeTab === 'details'" key="details" class="tab-panel details-panel">
              <div class="details-grid">
                <div class="detail-card">
                  <h4 class="detail-title">
                    <i class="i-ri-information-line" />
                    Basic Information
                  </h4>
                  <div class="detail-list">
                    <div class="detail-row">
                      <span class="label">Plugin ID</span>
                      <span class="value code">{{ plugin.name }}</span>
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

                <div class="detail-card">
                  <h4 class="detail-title">
                    <i class="i-ri-settings-3-line" />
                    Configuration
                  </h4>
                  <div class="detail-list">
                    <div class="detail-row">
                      <span class="label">Auto Start</span>
                      <span class="value toggle">
                        <i class="i-ri-checkbox-circle-line enabled" />
                        Enabled
                      </span>
                    </div>
                    <div class="detail-row">
                      <span class="label">Hot Reload</span>
                      <span class="value toggle">
                        <i v-if="plugin.dev?.enable" class="i-ri-checkbox-circle-line enabled" />
                        <i v-else class="i-ri-checkbox-blank-circle-line disabled" />
                        {{ plugin.dev?.enable ? 'Enabled' : 'Disabled' }}
                      </span>
                    </div>
                    <div class="detail-row">
                      <span class="label">Permissions</span>
                      <span class="value">Standard</span>
                    </div>
                  </div>
                </div>

                <div class="detail-card">
                  <h4 class="detail-title">
                    <i class="i-ri-folder-line" />
                    File System
                  </h4>
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

                <div class="detail-card">
                  <h4 class="detail-title">
                    <i class="i-ri-time-line" />
                    Performance
                  </h4>
                  <div class="detail-list">
                    <div class="detail-row">
                      <span class="label">Load Time</span>
                      <span class="value">156ms</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">Memory Usage</span>
                      <span class="value">8.2 MB</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">CPU Usage</span>
                      <span class="value">0.3%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Logs Tab -->
            <div v-else-if="activeTab === 'logs'" key="logs" class="tab-panel logs-panel">
              <div class="logs-header">
                <div class="logs-controls">
                  <div class="log-levels">
                    <button
                      v-for="level in logLevels"
                      :key="level.name"
                      class="log-level-btn"
                      :class="{ active: activeLogLevel === level.name }"
                      @click="setActiveLogLevel(level.name)"
                    >
                      <i :class="level.icon" />
                      {{ level.label }}
                    </button>
                  </div>
                  <div class="logs-actions">
                    <FlatButton class="action-btn-xs" @click="clearLogs">
                      <i class="i-ri-delete-bin-line" />
                      Clear
                    </FlatButton>
                    <FlatButton class="action-btn-xs" @click="refreshLogs">
                      <i class="i-ri-refresh-line" />
                      Refresh
                    </FlatButton>
                  </div>
                </div>
              </div>
              <div class="logs-content">
                <div v-if="filteredLogs.length" class="logs-list">
                  <div
                    v-for="log in filteredLogs"
                    :key="log.id"
                    class="log-entry"
                    :class="log.level"
                  >
                    <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                    <span class="log-level">{{ log.level.toUpperCase() }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
                <div v-else class="empty-logs">
                  <i class="i-ri-file-text-line empty-icon" />
                  <h3>No Logs Available</h3>
                  <p>No {{ activeLogLevel }} logs found for this plugin.</p>
                </div>
              </div>
            </div>

            <!-- Storage Tab -->
            <div v-else-if="activeTab === 'storage'" key="storage" class="tab-panel storage-panel">
              <div class="storage-overview">
                <div class="storage-stats">
                  <div class="storage-stat">
                    <i class="i-ri-database-line" />
                    <div class="stat-content">
                      <span class="stat-value">2.4 MB</span>
                      <span class="stat-label">Total Storage</span>
                    </div>
                  </div>
                  <div class="storage-stat">
                    <i class="i-ri-file-line" />
                    <div class="stat-content">
                      <span class="stat-value">156</span>
                      <span class="stat-label">Files</span>
                    </div>
                  </div>
                  <div class="storage-stat">
                    <i class="i-ri-folder-line" />
                    <div class="stat-content">
                      <span class="stat-value">8</span>
                      <span class="stat-label">Directories</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="storage-breakdown">
                <h4 class="breakdown-title">Storage Breakdown</h4>
                <div class="storage-items">
                  <div class="storage-item">
                    <div class="item-info">
                      <i class="i-ri-settings-line" />
                      <div class="item-details">
                        <span class="item-name">Configuration</span>
                        <span class="item-path">config/</span>
                      </div>
                    </div>
                    <span class="item-size">1.2 MB</span>
                  </div>
                  <div class="storage-item">
                    <div class="item-info">
                      <i class="i-ri-image-line" />
                      <div class="item-details">
                        <span class="item-name">Cache</span>
                        <span class="item-path">cache/</span>
                      </div>
                    </div>
                    <span class="item-size">856 KB</span>
                  </div>
                  <div class="storage-item">
                    <div class="item-info">
                      <i class="i-ri-file-text-line" />
                      <div class="item-details">
                        <span class="item-name">Logs</span>
                        <span class="item-path">logs/</span>
                      </div>
                    </div>
                    <span class="item-size">384 KB</span>
                  </div>
                  <div class="storage-item">
                    <div class="item-info">
                      <i class="i-ri-database-line" />
                      <div class="item-details">
                        <span class="item-name">Data</span>
                        <span class="item-path">data/</span>
                      </div>
                    </div>
                    <span class="item-size">128 KB</span>
                  </div>
                </div>
              </div>

              <div class="storage-actions">
                <FlatButton class="action-btn danger" @click="clearCache">
                  <i class="i-ri-delete-bin-line" />
                  Clear Cache
                </FlatButton>
                <FlatButton class="action-btn" @click="openDataFolder">
                  <i class="i-ri-folder-open-line" />
                  Open Data Folder
                </FlatButton>
                <FlatButton class="action-btn" @click="exportData">
                  <i class="i-ri-download-line" />
                  Export Data
                </FlatButton>
              </div>
            </div>
          </transition>
        </TouchScroll>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="PluginInfo" setup>
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue'
import TouchScroll from '@comp/base/TouchScroll.vue'
import type { ITouchPlugin, IPlatform } from '@talex-touch/utils/plugin'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import OSIcon from '../icon/OSIcon.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// SDK and state
const touchSdk = useTouchSDK()

// Individual loading states for different operations
const loadingStates = ref({
  openFolder: false,
  openDevTools: false,
  openSettings: false
})

// Computed properties
const platforms = computed<IPlatform>(() => props.plugin?.platforms || {})
const readme = computed<string>(() => props.plugin.readme)

// Tabs configuration
const tabs = ref([
  {
    id: 'overview',
    label: 'Overview',
    icon: 'i-ri-dashboard-line',
    badge: null
  },
  {
    id: 'features',
    label: 'Features',
    icon: 'i-ri-function-line',
    badge: computed(() => props.plugin.features?.length || 0)
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: 'i-ri-database-line',
    badge: null
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: 'i-ri-file-text-line',
    badge: null
  },
  {
    id: 'details',
    label: 'Details',
    icon: 'i-ri-information-line',
    badge: null
  }
])

// Active tab state
const activeTab = ref('overview')
const previousTab = ref('overview')
const slideDirection = ref('slide-left')

// Tab indicator position
const tabIndicatorStyle = ref({})

// Features state
const expandedFeatures = ref(new Set<string>())
const totalCommands = computed(() =>
  props.plugin.features?.reduce((total, feature) => total + feature.commands.length, 0) || 0
)

// Logs state
const activeLogLevel = ref('all')
const logLevels = [
  { name: 'all', label: 'All', icon: 'i-ri-list-line' },
  { name: 'error', label: 'Error', icon: 'i-ri-error-warning-line' },
  { name: 'warn', label: 'Warning', icon: 'i-ri-alert-line' },
  { name: 'info', label: 'Info', icon: 'i-ri-information-line' },
  { name: 'debug', label: 'Debug', icon: 'i-ri-bug-line' }
]

// Mock logs data
const logs = ref([
  { id: 1, timestamp: Date.now() - 1000, level: 'info', message: 'Plugin initialized successfully' },
  { id: 2, timestamp: Date.now() - 2000, level: 'debug', message: 'Loading configuration files' },
  { id: 3, timestamp: Date.now() - 3000, level: 'warn', message: 'Deprecated API usage detected' },
  { id: 4, timestamp: Date.now() - 4000, level: 'error', message: 'Failed to connect to external service' },
  { id: 5, timestamp: Date.now() - 5000, level: 'info', message: 'Feature "translation" registered' }
])

const filteredLogs = computed(() => {
  if (activeLogLevel.value === 'all') return logs.value
  return logs.value.filter(log => log.level === activeLogLevel.value)
})

// Status mapping for better maintainability
const statusMap = {
  enabled: { class: 'status-active', icon: 'i-ri-play-circle-line', text: 'Enabled' },
  active: { class: 'status-active', icon: 'i-ri-play-circle-line', text: 'Active' },
  disabled: { class: 'status-disabled', icon: 'i-ri-pause-circle-line', text: 'Disabled' },
  crashed: { class: 'status-error', icon: 'i-ri-error-warning-line', text: 'Crashed' }
} as const

const statusClass = computed(() => {
  if (!props.plugin) return 'status-inactive'
  return statusMap[props.plugin.status]?.class || 'status-inactive'
})

const statusIcon = computed(() => {
  if (!props.plugin) return 'i-ri-stop-circle-line'
  return statusMap[props.plugin.status]?.icon || 'i-ri-stop-circle-line'
})

const statusText = computed(() => {
  if (!props.plugin) return 'Inactive'
  return statusMap[props.plugin.status]?.text || 'Unknown'
})

// Tab management
function setActiveTab(tabId: string) {
  if (tabId === activeTab.value) return

  const currentIndex = tabs.value.findIndex(tab => tab.id === activeTab.value)
  const newIndex = tabs.value.findIndex(tab => tab.id === tabId)

  slideDirection.value = newIndex > currentIndex ? 'slide-left' : 'slide-right'
  previousTab.value = activeTab.value
  activeTab.value = tabId

  updateTabIndicator()
}

function updateTabIndicator() {
  nextTick(() => {
    const activeIndex = tabs.value.findIndex(tab => tab.id === activeTab.value)
    const tabWidth = 100 / tabs.value.length
    tabIndicatorStyle.value = {
      transform: `translateX(${activeIndex * tabWidth}%)`,
      width: `${tabWidth}%`
    }
  })
}

// Features management
function toggleFeatureDetails(featureId: string): void {
  if (expandedFeatures.value.has(featureId)) {
    expandedFeatures.value.delete(featureId)
  } else {
    expandedFeatures.value.add(featureId)
  }
}

// Logs management
function setActiveLogLevel(level: string) {
  activeLogLevel.value = level
}

function clearLogs() {
  logs.value = []
}

function refreshLogs() {
  // Mock refresh
  console.log('Refreshing logs...')
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}

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

// Action handlers
async function handleOpenPluginFolder(): Promise<void> {
  if (!props.plugin || loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await touchSdk.openPluginFolder(props.plugin.name)
  } catch (error) {
    console.error('Failed to open plugin folder:', error)
  } finally {
    loadingStates.value.openFolder = false
  }
}

async function handleOpenDevTools(): Promise<void> {
  if (!props.plugin?.dev?.enable || loadingStates.value.openDevTools) return

  loadingStates.value.openDevTools = true
  try {
    if (props.plugin.dev.address) {
      await touchSdk.openExternalUrl(props.plugin.dev.address)
    }
  } catch (error) {
    console.error('Failed to open dev tools:', error)
  } finally {
    loadingStates.value.openDevTools = false
  }
}

async function handlePluginSettings(): Promise<void> {
  if (!props.plugin || loadingStates.value.openSettings) return

  loadingStates.value.openSettings = true
  try {
    // TODO: Implement plugin settings dialog
    console.log('Opening plugin settings for:', props.plugin.name)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } catch (error) {
    console.error('Failed to open plugin settings:', error)
  } finally {
    loadingStates.value.openSettings = false
  }
}

// Initialize tab indicator on mount
onMounted(() => {
  updateTabIndicator()
})
</script>

<style lang="scss" scoped>
.plugin-info-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
}

/* ===== PLUGIN HEADER ===== */
.plugin-header {
  position: relative;
  padding: 1.5rem 2rem 1rem;
  background: linear-gradient(135deg, var(--el-fill-color-extra-light) 0%, var(--el-bg-color) 100%);
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2rem;
  flex-shrink: 0;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 300px;
    height: 100%;
    background: radial-gradient(
      circle at top right,
      var(--el-color-primary-light-9) 0%,
      transparent 70%
    );
    opacity: 0.5;
    pointer-events: none;
  }
}

.plugin-header-main {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  position: relative;
  z-index: 1;
}

.plugin-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  .default-icon {
    font-size: 1.75rem;
    color: var(--el-color-primary);
  }

  .plugin-icon-img {
    width: 100%;
    height: 100%;
    border-radius: 10px;
    object-fit: cover;
  }
}

.plugin-meta {
  flex: 1;
  min-width: 0;
}

.plugin-name {
  margin: 0 0 0.375rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.plugin-description {
  margin: 0 0 0.75rem 0;
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  opacity: 0.8;
  line-height: 1.4;
}

.plugin-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 16px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;

  i {
    font-size: 0.75rem;
  }

  &.dev-badge {
    background: var(--el-color-info-light-9);
    color: var(--el-color-info);
    border: 1px solid var(--el-color-info-light-7);
  }

  &.version-badge {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
    border: 1px solid var(--el-color-success-light-7);
  }

  &.status-badge {
    &.status-active {
      background: var(--el-color-success-light-9);
      color: var(--el-color-success);
      border: 1px solid var(--el-color-success-light-7);
    }

    &.status-disabled {
      background: var(--el-color-warning-light-9);
      color: var(--el-color-warning);
      border: 1px solid var(--el-color-warning-light-7);
    }

    &.status-error {
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
      border: 1px solid var(--el-color-danger-light-7);
    }

    &.status-inactive {
      background: var(--el-fill-color);
      color: var(--el-text-color-placeholder);
      border: 1px solid var(--el-border-color);
    }
  }
}

/* ===== PLUGIN ACTIONS ===== */
.plugin-actions {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  position: relative;
  z-index: 1;
}

.action-btn-sm {
  :deep(.FlatButton-Container) {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-fill-color);
    border: 1px solid var(--el-border-color);
    color: var(--el-text-color-regular);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    i {
      font-size: 1rem;
    }

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }
  }

  &.explore-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
  }

  &.dev-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
    background: var(--el-color-info-light-9);
    border-color: var(--el-color-info-light-5);
    color: var(--el-color-info);
  }

  &.settings-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
    background: var(--el-color-warning-light-9);
    border-color: var(--el-color-warning-light-5);
    color: var(--el-color-warning);
  }
}

/* ===== TABS ===== */
.tabs-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tabs-nav {
  position: relative;
  display: flex;
  background: var(--el-fill-color-extra-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 1rem;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--el-text-color-regular);
  border-radius: 8px 8px 0 0;
  margin-bottom: -1px;

  i {
    font-size: 1rem;
  }

  &:hover {
    color: var(--el-color-primary);
    background: var(--el-fill-color);
  }

  &.active {
    color: var(--el-color-primary);
    background: var(--el-bg-color);
    font-weight: 600;
  }

  .tab-badge {
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    min-width: 1.25rem;
    text-align: center;
  }
}

.tab-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  background: var(--el-color-primary);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 1px;
}

.tabs-content {
  flex: 1;
  overflow: hidden;
  background: var(--el-bg-color);
}

.tab-scroll {
  height: 100%;
}

.tab-panel {
  padding: 1.5rem;
  min-height: 100%;
}

/* ===== SECTIONS ===== */
.section {
  background: var(--el-fill-color-extra-light);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  transition: all 0.3s ease;
  margin-bottom: 1.5rem;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  margin: 0;
  padding: 1.25rem 1.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;

  i {
    font-size: 1.125rem;
    color: var(--el-color-primary);
  }
}

.section-content {
  padding: 1rem 1.5rem 1.5rem;
}

/* ===== OVERVIEW PANEL ===== */
.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.platform-card {
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 1rem;
  transition: all 0.3s ease;

  &.enabled {
    border-color: var(--el-color-success-light-5);
    background: var(--el-color-success-light-9);
  }

  &:not(.enabled) {
    opacity: 0.6;
  }
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.platform-icon {
  width: 20px;
  height: 20px;
}

.platform-name {
  font-weight: 500;
  text-transform: capitalize;
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  flex: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.enabled {
    background: var(--el-color-success);
  }

  &.disabled {
    background: var(--el-color-info);
  }
}

.platform-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.not-supported {
  color: var(--el-text-color-disabled);
  font-size: 0.875rem;
}

.readme-content {
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 1.25rem;
  max-height: 400px;
  overflow-y: auto;
}

/* ===== FEATURES PANEL ===== */
.features-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.features-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  i {
    font-size: 1.5rem;
    color: var(--el-color-primary);
  }
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  margin-top: 0.25rem;
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.feature-card {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  &.expanded {
    border-color: var(--el-color-primary-light-5);

    .expand-icon {
      transform: rotate(180deg);
    }
  }
}

.feature-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem;
}

.feature-info {
  flex: 1;
}

.feature-name {
  margin: 0 0 0.375rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.feature-desc {
  margin: 0;
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.feature-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.commands-count {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.expand-icon {
  font-size: 1.125rem;
  color: var(--el-text-color-secondary);
  transition: transform 0.3s ease;
}

.feature-details {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 1.25rem;
}

.commands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.command-card {
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 0.75rem;
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.command-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.command-shortcut {
  font-size: 0.625rem;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}

.command-desc {
  margin: 0;
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  line-height: 1.3;
}

/* ===== DETAILS PANEL ===== */
.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.detail-card {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
}

.detail-title {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;

  i {
    font-size: 1.125rem;
    color: var(--el-color-primary);
  }
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--el-text-color-regular);
    opacity: 0.8;
  }

  .value {
    font-size: 0.875rem;
    color: var(--el-text-color-primary);
    text-align: right;
    max-width: 60%;

    &.code {
      font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace;
      background: var(--el-fill-color);
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

    &.toggle {
      display: flex;
      align-items: center;
      gap: 0.375rem;

      i {
        font-size: 1rem;

        &.enabled {
          color: var(--el-color-success);
        }

        &.disabled {
          color: var(--el-text-color-disabled);
        }
      }
    }

    &.truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

/* ===== LOGS PANEL ===== */
.logs-header {
  margin-bottom: 1.5rem;
}

.logs-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.log-levels {
  display: flex;
  gap: 0.5rem;
}

.log-level-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    font-weight: 500;
  }

  i {
    font-size: 0.875rem;
  }
}

.logs-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn-xs {
  :deep(.FlatButton-Container) {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    height: auto;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 0.375rem;

    i {
      font-size: 0.875rem;
    }
  }
}

.logs-content {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  max-height: 500px;
}

.logs-list {
  display: flex;
  flex-direction: column;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 0.75rem;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  &.error {
    background: var(--el-color-danger-light-9);
    border-left: 3px solid var(--el-color-danger);
  }

  &.warn {
    background: var(--el-color-warning-light-9);
    border-left: 3px solid var(--el-color-warning);
  }

  &.info {
    background: var(--el-color-info-light-9);
    border-left: 3px solid var(--el-color-info);
  }

  &.debug {
    background: var(--el-fill-color);
    border-left: 3px solid var(--el-text-color-disabled);
  }
}

.log-time {
  color: var(--el-text-color-secondary);
  min-width: 80px;
}

.log-level {
  color: var(--el-text-color-regular);
  font-weight: 600;
  min-width: 60px;
  text-transform: uppercase;
}

.log-message {
  flex: 1;
  color: var(--el-text-color-primary);
}

/* ===== STORAGE PANEL ===== */
.storage-overview {
  margin-bottom: 2rem;
}

.storage-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.storage-stat {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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

.storage-breakdown {
  margin-bottom: 2rem;
}

.breakdown-title {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.storage-items {
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}

.storage-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
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
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.item-path {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.item-size {
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.storage-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.action-btn {
  :deep(.FlatButton-Container) {
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    transition: all 0.3s ease;

    i {
      font-size: 1rem;
    }
  }

  &.danger :deep(.FlatButton-Container) {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-7);
    color: var(--el-color-danger);

    &:hover {
      background: var(--el-color-danger-light-8);
      border-color: var(--el-color-danger-light-5);
    }
  }
}

/* ===== EMPTY STATES ===== */
.empty-state,
.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  color: var(--el-text-color-disabled);
  margin-bottom: 1rem;
}

.empty-state h3,
.empty-logs h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  color: var(--el-text-color-primary);
}

.empty-state p,
.empty-logs p {
  margin: 0;
  color: var(--el-text-color-regular);
  opacity: 0.8;
}

/* ===== ANIMATIONS ===== */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.feature-expand-enter-active,
.feature-expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.feature-expand-enter-from,
.feature-expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.feature-expand-enter-to,
.feature-expand-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: translateY(0);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* ===== RESPONSIVE DESIGN ===== */
@media (max-width: 768px) {
  .plugin-header {
    padding: 1rem;
    flex-direction: column;
    gap: 1rem;
  }

  .plugin-header-main {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .plugin-actions {
    justify-content: center;
  }

  .tab-panel {
    padding: 1rem;
  }

  .tabs-nav {
    padding: 0 0.5rem;
    overflow-x: auto;
  }

  .tab-item {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .platform-grid,
  .features-stats,
  .details-grid,
  .storage-stats,
  .commands-grid {
    grid-template-columns: 1fr;
  }

  .logs-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .log-levels {
    flex-wrap: wrap;
  }

  .storage-actions {
    flex-direction: column;
  }
}
</style>
