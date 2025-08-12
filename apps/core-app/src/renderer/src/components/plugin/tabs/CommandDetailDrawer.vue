<template>
  <transition name="drawer">
    <div v-if="visible" class="command-drawer-overlay" @click.self="closeDrawer">
      <div class="command-drawer">
        <div class="drawer-header">
          <h3>Command Details</h3>
          <button class="close-button" @click="closeDrawer">
            <i class="i-ri-close-line" />
          </button>
        </div>

        <div class="drawer-content">
          <div class="command-overview glass-card">
            <div class="overview-header">
              <code class="command-name">{{ commandData?.name }}</code>
              <span v-if="commandData?.shortcut" class="command-shortcut">{{ commandData?.shortcut }}</span>
            </div>
            <p v-if="commandData?.desc" class="command-description">{{ commandData?.desc }}</p>
          </div>

          <div class="command-json glass-card">
            <div class="card-header">
              <i class="i-ri-code-s-slash-line" />
              <h4>Command Data</h4>
            </div>
            <pre class="json-content">{{ JSON.stringify(command, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import type { IFeatureCommand } from '@talex-touch/utils/plugin'

interface CommandData {
  name?: string
  shortcut?: string
  desc?: string
  [key: string]: any
}

const props = defineProps<{
  visible: boolean
  command: IFeatureCommand | null
  commandData?: CommandData
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function closeDrawer(): void {
  emit('close')
}
</script>

<style lang="scss" scoped>
.command-drawer-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.command-drawer {
  width: 450px;
  max-width: 90vw;
  height: 100%;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.close-button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-5);
    color: var(--el-color-danger);
  }
}

.drawer-content {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
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

.command-overview {
  .overview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .command-name {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--el-color-primary);
    background: rgba(var(--el-color-primary-rgb), 0.1);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
  }

  .command-shortcut {
    font-size: 0.75rem;
    color: var(--el-text-color-secondary);
    background: rgba(var(--el-fill-color-rgb), 0.8);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    border: 1px solid var(--el-border-color);
  }

  .command-description {
    margin: 0;
    color: var(--el-text-color-regular);
    line-height: 1.5;
  }
}

.command-json {
  flex: 1;
  display: flex;
  flex-direction: column;

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;

    i {
      font-size: 1.25rem;
      color: var(--el-color-primary);
    }

    h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .json-content {
    flex: 1;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-extra-light);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--el-border-color);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
  }
}

.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.drawer-enter-to,
.drawer-leave-from {
  transform: translateX(0);
  opacity: 1;
}

@media (max-width: 768px) {
  .command-drawer {
    width: 100%;
  }
}
</style>
