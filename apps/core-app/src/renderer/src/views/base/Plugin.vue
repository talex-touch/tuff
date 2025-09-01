<template>
  <div class="relative flex w-full h-full transition-cubic overflow-hidden">
    <!-- Plugin List Sidebar -->
    <div
      class="relative w-76 h-full border-r border-[var(--el-border-color-lighter)] flex flex-col transition-all duration-300 ease-out"
    >
      <PluginList :plugins="plugins" @select="selectPlugin" @add-plugin="drawerVisible = true" />

      <!-- Quick Actions -->
      <div
        class="p-3 mt-auto flex flex-col gap-2 border-t border-[var(--el-border-color-lighter)] fake-background"
      >
        <FlatButton
          class="action-btn folder-btn text-sm"
          :disabled="loadingStates.openFolder"
          @click="handleOpenPluginFolder"
        >
          <i v-if="!loadingStates.openFolder" block class="i-ri-folder-open-line" />
          <i v-else block class="i-ri-loader-4-line animate-spin" />
          <span block>{{ loadingStates.openFolder ? 'Opening...' : 'Open Folder' }}</span>
        </FlatButton>
      </div>
    </div>

    <!-- Plugin Info Panel -->
    <div class="relative flex-1 h-full overflow-hidden bg-[var(--el-bg-color)]">
      <Transition name="fade-slide" mode="out-in">
        <div v-if="curSelect" :key="curSelect.name" class="h-full flex flex-col">
          <div class="flex-1 overflow-auto p-0">
            <PluginInfo :plugin="curSelect" />
          </div>
        </div>
        <PluginEmptyState v-else />
      </Transition>
    </div>

    <!-- New Plugin Drawer -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="100%" :with-header="false">
      <PluginNew @close="drawerVisible = false" />
    </el-drawer>
  </div>
</template>

<script lang="ts" name="Plugin" setup>
import { ref } from 'vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import PluginList from '@comp/plugin/layout/PluginList.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import PluginNew from './plugin/PluginNew.vue'
import PluginEmptyState from '@comp/plugin/layout/PluginEmptyState.vue'
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'
import { useTouchSDK } from '@talex-touch/utils/renderer'

const { plugins, curSelect, selectPlugin } = usePluginSelection()

const drawerVisible = ref(false)
const touchSdk = useTouchSDK()

const loadingStates = ref({
  openFolder: false
})

async function handleOpenPluginFolder(): Promise<void> {
  if (loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await touchSdk.openModuleFolder('plugins')
  } catch (error) {
    console.error('Failed to open plugin folder:', error)
  } finally {
    loadingStates.value.openFolder = false
  }
}
</script>

<style lang="scss" scoped>
.action-btn :deep(.FlatButton-Container) {
  @apply w-full h-11 flex items-center justify-center gap-3 font-medium rounded-xl transition-all duration-300 ease-out;
}

.action-btn :deep(.FlatButton-Container) i {
  @apply text-lg;
}

.action-btn :deep(.FlatButton-Container:disabled) {
  @apply opacity-60 cursor-not-allowed;
  transform: none !important;
}

.folder-btn :deep(.FlatButton-Container) {
  @apply bg-[var(--el-fill-color)] text-[var(--el-text-color-primary)] border border-[var(--el-border-color)];
}

.folder-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
  @apply bg-[var(--el-fill-color-light)] border-[var(--el-color-primary-light-5)] text-[var(--el-color-primary)] -translate-y-px;
}

/* Transition Styles */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
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
</style>
