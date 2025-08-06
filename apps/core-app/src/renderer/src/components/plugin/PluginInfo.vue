<template>
  <div class="plugin-info-container">
    <!-- Enhanced Plugin Header with Glass Effect -->
    <div class="plugin-header">
      <div class="header-background"></div>
      <div class="header-content">
        <div class="plugin-main-info">
          <div class="plugin-icon-wrapper">
            <div class="plugin-icon">
              <i v-if="plugin.icon?.value" class="plugin-icon-img" />
              <i v-else class="i-ri-puzzle-line default-icon" />
            </div>
            <div class="plugin-status-indicator" :class="statusClass">
              <div class="status-dot"></div>
            </div>
          </div>

          <div class="plugin-meta">
            <div class="plugin-title-row">
              <h1 class="plugin-name">{{ plugin.name }}</h1>
            </div>
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
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="plugin-info-quick-actions">
          <el-tooltip content="Open plugin folder" placement="bottom">
            <button
              class="plugin-info-icon-button"
              :disabled="loadingStates.openFolder"
              @click="handleOpenPluginFolder"
            >
              <i v-if="!loadingStates.openFolder" class="i-ri-folder-open-line" />
              <i v-else class="i-ri-loader-4-line animate-spin" />
            </button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- Status Component Integration -->
    <div class="status-section">
      <PluginStatus :plugin="plugin" class="enhanced-status" />
    </div>

    <!-- Tabs Section -->
    <div class="tabs-section">
      <TvTabs v-model="tabsModel">
        <TvTabItem icon="dashboard" name="Overview">
          <PluginOverview :plugin="plugin" />
        </TvTabItem>

        <TvTabItem icon="function" name="Features">
          <PluginFeatures :plugin="plugin" />
        </TvTabItem>

        <TvTabItem icon="database" name="Storage">
          <PluginStorage :plugin="plugin" />
        </TvTabItem>

        <TvTabItem icon="file-text" name="Logs">
          <PluginLogs :plugin="plugin" />
        </TvTabItem>

        <TvTabItem icon="information" name="Details">
          <PluginDetails :plugin="plugin" />
        </TvTabItem>
      </TvTabs>
    </div>

  </div>
</template>

<script lang="ts" name="PluginInfo" setup>
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import TvTabs from '@comp/tabs/vertical/TvTabs.vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import PluginOverview from './tabs/PluginOverview.vue'
import PluginFeatures from './tabs/PluginFeatures.vue'
import PluginStorage from './tabs/PluginStorage.vue'
import PluginLogs from './tabs/PluginLogs.vue'
import PluginDetails from './tabs/PluginDetails.vue'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { ElTooltip } from 'element-plus'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// SDK and state
const touchSdk = useTouchSDK()

// Tabs state
const tabsModel = ref({ 1: 'Overview' })

// Loading states
const loadingStates = ref({
  openFolder: false
})


// Status mapping
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

</script>

<style lang="scss" scoped>
.plugin-info-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* ===== ENHANCED HEADER ===== */
.plugin-header {
  position: relative;
  padding: 1.5rem 2rem;
  background: linear-gradient(
    135deg,
    rgba(var(--el-color-primary-rgb), 0.08) 0%,
    rgba(var(--el-color-primary-rgb), 0.03) 100%
  );
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  flex-shrink: 0;
}

.header-background {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at top right,
    rgba(var(--el-color-primary-rgb), 0.1) 0%,
    transparent 70%
  );
  pointer-events: none;
}

.header-content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 2rem;
  align-items: flex-start;
}

.plugin-main-info {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.plugin-icon-wrapper {
  position: relative;
}

.plugin-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: rgba(var(--el-color-primary-rgb), 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);

  .default-icon {
    font-size: 1.75rem;
    color: var(--el-color-primary);
  }
}

.plugin-status-indicator {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--el-bg-color);

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-success);
  }

  &.status-active .status-dot {
    background: var(--el-color-success);
    animation: pulse 2s infinite;
  }

  &.status-disabled .status-dot {
    background: var(--el-color-warning);
  }

  &.status-error .status-dot {
    background: var(--el-color-danger);
  }
}

.plugin-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.plugin-name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  background: linear-gradient(
    135deg,
    var(--el-text-color-primary) 0%,
    var(--el-color-primary) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}


.plugin-description {
  margin: 0 0 0.75rem 0;
  color: var(--el-text-color-regular);
  opacity: 0.85;
  line-height: 1.4;
}

.plugin-badges {
  display: flex;
  gap: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  backdrop-filter: blur(10px);

  i {
    font-size: 0.75rem;
  }

  &.dev-badge {
    background: rgba(var(--el-color-info-rgb), 0.1);
    color: var(--el-color-info);
    border: 1px solid rgba(var(--el-color-info-rgb), 0.2);
  }

  &.version-badge {
    background: rgba(var(--el-color-success-rgb), 0.1);
    color: var(--el-color-success);
    border: 1px solid rgba(var(--el-color-success-rgb), 0.2);
  }
}

.status-section {
  display: flex;
  align-items: center;
}

.plugin-info-quick-actions {
  display: flex;
  gap: 0.75rem;
}

.plugin-info-icon-button {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(var(--el-fill-color-rgb), 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  &:hover:not(:disabled) {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(var(--el-color-primary-rgb), 0.2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }

  i {
    font-size: 1.125rem;
  }
}


/* ===== TABS SECTION ===== */
.tabs-section {
  flex: 1;
  overflow: hidden;
  background: var(--el-bg-color);
}


/* ===== ANIMATIONS ===== */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* ===== RESPONSIVE DESIGN ===== */
@media (max-width: 768px) {
  .plugin-header {
    padding: 1rem;
  }

  .header-content {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .plugin-main-info {
    flex-direction: row;
    align-items: center;
  }

  .plugin-info-quick-actions {
    justify-content: center;
    flex-wrap: wrap;
  }

  .plugin-info-icon-button {
    width: 36px;
    height: 36px;

    i {
      font-size: 1rem;
    }
  }
}
</style>
