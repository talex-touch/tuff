<template>
  <div class="plugin-features">
    <div class="features-header">
      <div class="stats-row">
        <div class="stat-item">
          <i class="i-ri-function-line" />
          <div class="stat-info">
            <span class="stat-number">{{ plugin.features?.length || 0 }}</span>
            <span class="stat-label">Features</span>
          </div>
        </div>
        <div class="stat-item">
          <i class="i-ri-terminal-line" />
          <div class="stat-info">
            <span class="stat-number">{{ totalCommands }}</span>
            <span class="stat-label">Commands</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="plugin.features?.length" class="features-list">
      <div
        v-for="feature in plugin.features"
        :key="feature.id"
        class="feature-card glass-card"
      >
        <div class="feature-header">
          <div class="feature-info">
            <h4 class="feature-name">{{ feature.name }}</h4>
            <p class="feature-desc">{{ feature.desc }}</p>
          </div>
          <div class="feature-meta">
            <span class="commands-badge">{{ feature.commands.length }}</span>
          </div>
        </div>

        <div class="feature-details">
          <div class="commands-grid">
            <div
              v-for="(command, index) in feature.commands"
              :key="index"
              class="command-item"
              @click="showCommandDetails(command, feature)"
            >
              <div class="command-header">
                <code class="command-name">{{ getCommandName(command, feature) }}</code>
                <span v-if="getCommandShortcut(command, feature)" class="command-shortcut">{{ getCommandShortcut(command, feature) }}</span>
              </div>
              <p v-if="getCommandDesc(command, feature)" class="command-desc">{{ getCommandDesc(command, feature) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <i class="i-ri-function-line empty-icon" />
      <h3>No Features Available</h3>
      <p>This plugin doesn't expose any features yet.</p>
    </div>

    <CommandDetailDrawer
      :visible="showDrawer"
      :command="selectedCommand"
      :command-data="selectedCommandData"
      @close="showDrawer = false"
    />
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin, IFeatureCommand } from '@talex-touch/utils/plugin'
import CommandDetailDrawer from './CommandDetailDrawer.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Features state
const totalCommands = computed(() =>
  props.plugin.features?.reduce((total, feature) => total + feature.commands.length, 0) || 0
)

// Drawer state
const showDrawer = ref(false)
const selectedCommand = ref<IFeatureCommand | null>(null)
const selectedCommandData = ref<any>(null)

// Helper functions to extract command properties
function getCommandName(command: IFeatureCommand, feature: any): string {
  // Try to get name from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].name || command.type
  }
  return command.type
}

function getCommandShortcut(command: IFeatureCommand, feature: any): string | undefined {
  // Try to get shortcut from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].shortcut
  }
  return undefined
}

function getCommandDesc(command: IFeatureCommand, feature: any): string | undefined {
  // Try to get description from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].desc
  }
  return undefined
}

// Command details management
function showCommandDetails(command: IFeatureCommand, feature: any): void {
  selectedCommand.value = command

  // Create command data object with available properties
  selectedCommandData.value = {
    name: getCommandName(command, feature),
    shortcut: getCommandShortcut(command, feature),
    desc: getCommandDesc(command, feature)
  }

  showDrawer.value = true
}
</script>

<style lang="scss" scoped>
.plugin-features {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  width: 100%;
}

.features-header {
  margin-bottom: 1rem;
}

.stats-row {
  display: flex;
  gap: 1.5rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  border-radius: 12px;
  flex: 1;

  i {
    font-size: 1.5rem;
    color: var(--el-color-primary);
  }
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
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
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.feature-card {
  cursor: default;
}

.feature-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.feature-info {
  flex: 1;
}

.feature-name {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.feature-desc {
  margin: 0;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.feature-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.commands-badge {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
}

.expand-icon {
  font-size: 1.25rem;
  color: var(--el-text-color-secondary);
  transition: transform 0.3s ease;
}

.feature-details {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(var(--el-border-color-rgb), 0.3);
}

.commands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.command-item {
  background: rgba(var(--el-fill-color-rgb), 0.6);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.4);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.command-name {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.command-shortcut {
  font-size: 0.625rem;
  color: var(--el-text-color-secondary);
  background: rgba(var(--el-fill-color-rgb), 0.8);
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;

  .empty-icon {
    font-size: 3rem;
    color: var(--el-text-color-disabled);
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    color: var(--el-text-color-regular);
    opacity: 0.8;
  }
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

@media (max-width: 768px) {
  .stats-row {
    flex-direction: column;
    gap: 1rem;
  }

  .commands-grid {
    grid-template-columns: 1fr;
  }
}
</style>
