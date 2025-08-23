<template>
  <div class="relative flex w-full h-full transition-cubic overflow-hidden">
    <!-- Plugin List Sidebar -->
    <div
      class="relative w-76 h-full border-r border-[var(--el-border-color-lighter)] flex flex-col transition-all duration-300 ease-out"
    >
      <PluginList
        :plugins="[...plugins]"
        @select="selectPlugin"
        @add-plugin="drawerVisible = true"
      />

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
    <div
      ref="pluginInfoRef"
      class="relative flex-1 h-full overflow-hidden transition-all duration-250 ease-out bg-[var(--el-bg-color)]"
    >
      <div v-if="select && curSelect" class="h-full flex flex-col">
        <div class="flex-1 overflow-auto p-0">
          <PluginInfo :plugin="curSelect" />
        </div>
      </div>

      <!-- Simplified Empty State -->
      <div
        v-else
        class="relative w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
      >
        <div
          class="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--el-color-primary-light-9)] to-[var(--el-color-primary-light-8)] flex items-center justify-center mb-6 shadow-lg"
        >
          <i class="i-ri-puzzle-line text-3xl text-[var(--el-color-primary)]" />
        </div>
        <div class="max-w-96">
          <p class="text-[var(--el-text-color-regular)] opacity-80 mb-6">
            Choose a plugin to view details
          </p>
          <FlatButton class="cta-button text-sm" @click="() => $router.push('/market')">
            <i class="i-ri-store-line" />
            Explore Market
          </FlatButton>
        </div>
      </div>
    </div>

    <!-- New Plugin Drawer -->
    <el-drawer v-model="drawerVisible" direction="ltr" size="100%" :with-header="false">
      <PluginNew @close="drawerVisible = false" />
    </el-drawer>
  </div>
</template>

<script lang="ts" name="Plugin" setup>
import { ref, watch, computed, nextTick } from 'vue'
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import { sleep } from '@talex-touch/utils/common/utils'
import PluginList from '@comp/plugin/layout/PluginList.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import PluginNew from './plugin/PluginNew.vue'
import { usePluginStore } from '~/modules/adapter/plugin-adapter/store'
import { storeToRefs } from 'pinia'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { useDebounceFn } from '@vueuse/core'

const pluginStore = usePluginStore()
const { plugins: pluginMap, activePlugin } = storeToRefs(pluginStore)
const plugins = computed(() => [...pluginMap.value.values()])
const pluginInfoRef = ref<HTMLElement>()
const select = ref<string>()
const curSelect = ref<any>()
const drawerVisible = ref(false)

const touchSdk = useTouchSDK()

// Individual loading states for different operations
const loadingStates = ref({
  openFolder: false,
  selectPlugin: false
})

// Watch for plugin selection changes with debouncing
const updateSelectedPlugin = useDebounceFn(() => {
  if (!plugins.value || !select.value) {
    curSelect.value = null
    return
  }
  curSelect.value = plugins.value.find((item) => item.name === select.value) || null
}, 50)

watch(() => select.value, updateSelectedPlugin, { immediate: true })

watch(
  () => plugins,
  (newPlugins, oldPlugins) => {
    if (!select.value || !newPlugins || !oldPlugins) return
    // @ts-ignore - map to array
    if (newPlugins.size === oldPlugins.size) return

    const temp = select.value
    select.value = ''
    nextTick(() => {
      setTimeout(() => (select.value = temp), 200)
    })
  },
  { deep: true }
)

console.log("plugins", plugins)

// Enhanced plugin selection with smooth animation and error handling
async function selectPlugin(index: string): Promise<void> {
  if (index === select.value || !pluginInfoRef.value || loadingStates.value.selectPlugin) return

  loadingStates.value.selectPlugin = true
  try {
    const style = pluginInfoRef.value.style

    // Smooth exit animation
    style.opacity = '0'
    style.transform = 'translateX(100%) perspective(100px) rotateY(10deg) scale(.85)'

    await sleep(50)
    select.value = undefined
    await sleep(10)
    select.value = index
    activePlugin.value = index
    await sleep(50)

    // Smooth enter animation
    style.transform = 'translateX(0) perspective(100px) rotateY(0deg) scale(1)'
    style.opacity = '1'
  } catch (error) {
    console.error('Error during plugin selection animation:', error)
    select.value = index
  } finally {
    loadingStates.value.selectPlugin = false
  }
}

async function handleOpenPluginFolder(): Promise<void> {
  if (loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await touchSdk.openModuleFolder('plugins')
  } catch (error) {
    console.error('Failed to open plugin folder:', error)
    // TODO: Show error notification to user
  } finally {
    loadingStates.value.openFolder = false
  }
}
</script>

<style lang="scss" scoped>
:deep(.new-plus) {
  &:before,
  &:after {
    content: '';
    position: absolute;

    left: 50%;
    top: 50%;

    width: 2px;
    height: 50%;

    filter: invert(1);
    transform: translate(-50%, -50%);
    background-color: var(--el-bg-color);
    transition: all 0.75s 0.5s;
  }

  &:after {
    width: 50%;
    height: 2px;
  }

  &:hover {
    opacity: 0.5;
  }

  &.active {
    &:before {
      height: 40%;
      transform: translate(-50%, -50%) translateY(-4px) rotate(45deg);
    }

    &:after {
      width: 40%;
      transform: translate(-50%, -50%) translateY(4px) rotate(45deg);
    }
  }

  .state & {
    opacity: 1;
  }

  position: relative;

  width: 32px;
  height: 32px;

  cursor: pointer;
  transition:
    transform 0.5s,
    opacity 0s;

  transform: translate(var(--x), calc(var(--y) - 100%));
}

.blur-children .plugin-sidebar,
.blur-children .plugin-info-panel {
  filter: blur(4px);
  pointer-events: none;
}

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

.cta-button :deep(.FlatButton-Container) {
  @apply px-8 py-3 bg-[var(--el-color-primary)] text-white rounded-full font-semibold flex items-center gap-3 transition-all duration-300 ease-out relative overflow-hidden;
}

.cta-button :deep(.FlatButton-Container:hover) {
  @apply bg-[var(--el-color-primary-dark-2)] -translate-y-0.5 scale-105;
  box-shadow: 0 12px 30px rgba(var(--el-color-primary-rgb), 0.4);
}

.cta-button :deep(.FlatButton-Container) i {
  @apply text-lg;
}

.floating-add-btn {
  @apply relative w-11 h-11 rounded-full bg-white cursor-pointer transition-all duration-300 ease-out border-2 border-[var(--el-color-primary-light-7)];
  transform: translate(var(--x), calc(var(--y) - 100%));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.floating-add-btn:hover {
  @apply opacity-80 scale-110;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
}

.floating-add-btn::before,
.floating-add-btn::after {
  @apply content-empty absolute left-1/2 top-1/2 bg-[var(--el-color-primary)] transition-all duration-300 ease-out rounded-sm;
}

.floating-add-btn::before {
  @apply w-0.5 h-4 -translate-x-1/2 -translate-y-1/2;
}

.floating-add-btn::after {
  @apply w-4 h-0.5 -translate-x-1/2 -translate-y-1/2;
}

.floating-add-btn.active::before {
  @apply h-3 rotate-45;
}

.floating-add-btn.active::after {
  @apply w-3 rotate-45;
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
