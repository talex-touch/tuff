<template>
  <div class="plugin-overview">
    <!-- Environment Cards -->
    <div v-if="platforms && Object.keys(platforms).length" class="glass-card">
      <div class="card-header">
        <i class="i-ri-computer-line" />
        <h3>Environment Support</h3>
      </div>
      <div class="platform-grid">
        <div
          v-for="(platform, platformName) in platforms"
          :key="platformName"
          class="platform-card"
          :class="{ enabled: platform?.enable }"
        >
          <OSIcon class="platform-icon" :os="platformName" />
          <span class="platform-name">{{ platformName }}</span>
          <div class="platform-status" :class="{ enabled: platform?.enable }">
            <div class="status-indicator"></div>
          </div>
          <div v-if="platform?.enable" class="platform-tags">
            <span v-for="tag in platform.os" :key="tag" class="tag">{{ tag }}</span>
            <span v-for="tag in platform.arch" :key="tag" class="tag arch">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Documentation -->
    <div v-if="plugin.readme" class="glass-card full-width">
      <div class="card-header">
        <i class="i-ri-file-text-line" />
        <h3>Documentation</h3>
      </div>
      <div class="readme-content">
        <FlatMarkdown v-model="readme" :readonly="true" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import FlatMarkdown from '@comp/base/input/FlatMarkdown.vue'
import OSIcon from '~/components/icon/OSIcon.vue'
import type { ITouchPlugin, IPlatform } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Computed properties
const platforms = computed<IPlatform>(() => props.plugin?.platforms || {})
const readme = computed<string>(() => props.plugin.readme)
</script>

<style lang="scss" scoped>
.plugin-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;

  .full-width {
    grid-column: 1 / -1;
  }
}

.glass-card {
  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.3);
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

.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.platform-card {
  background: rgba(var(--el-fill-color-rgb), 0.6);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  border-radius: 12px;
  padding: 1rem;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  &.enabled {
    border-color: rgba(var(--el-color-success-rgb), 0.3);
    background: rgba(var(--el-color-success-rgb), 0.05);
  }

  &:not(.enabled) {
    opacity: 0.6;
  }
}

.platform-name {
  font-weight: 500;
  text-transform: capitalize;
  color: var(--el-text-color-primary);
}

.platform-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-info);
  }

  &.enabled .status-indicator {
    background: var(--el-color-success);
    animation: pulse 2s infinite;
  }
}

.platform-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;

  .tag {
    background: rgba(var(--el-color-primary-rgb), 0.1);
    color: var(--el-color-primary);
    font-size: 0.625rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);

    &.arch {
      background: rgba(var(--el-color-info-rgb), 0.1);
      color: var(--el-color-info);
      border-color: rgba(var(--el-color-info-rgb), 0.2);
    }
  }
}

.readme-content {
  background: rgba(var(--el-fill-color-rgb), 0.4);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@media (max-width: 768px) {
  .plugin-overview {
    grid-template-columns: 1fr;
  }
}
</style>
