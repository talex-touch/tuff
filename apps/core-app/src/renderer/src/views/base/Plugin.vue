<template>
  <div
    class="relative flex w-full h-full transition-cubic overflow-hidden"
    :class="{ 'blur-children': toggleOptions.status }"
  >
    <!-- Plugin List Sidebar -->
    <div
      class="relative w-76 h-full border-r border-[var(--el-border-color-lighter)] flex flex-col transition-all duration-300 ease-out"
    >
      <PluginList :plugins="[...plugins]" @select="selectPlugin" />

      <!-- Quick Actions -->
      <div
        class="p-3 mt-auto flex flex-col gap-2 border-t border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-lighter)]"
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

    <!-- New Plugin Overlay -->
    <div
      class="absolute top-0 left-0 rounded-lg border border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color)] backdrop-blur-20px"
      :style="toggleOptions.style"
    >
      <div
        id="floating-plus"
        :style="`z-index: 100;--x: ${toggleOptions.x}px;--y: ${toggleOptions.y}px`"
        :class="{ active: toggleOptions.status }"
        class="floating-add-btn"
        title="Create new plugin"
        @click="toggleNewPlugin"
      />
      <PluginNew class="-mt-9" />
    </div>
  </div>
</template>

<script lang="ts" name="Plugin" setup>
import PluginInfo from '@comp/plugin/PluginInfo.vue'
import { sleep } from '@talex-touch/utils/common/utils'
import PluginList from '@comp/plugin/layout/PluginList.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
import PluginNew from './plugin/PluginNew.vue'
import { computePosition } from '@floating-ui/vue'
import { useDebounceFn } from '@vueuse/core'
import { useTouchSDK } from '@talex-touch/utils/renderer'

// Types for better type safety
interface Plugin {
  name: string
  desc: string
  version: string
  status: 'enabled' | 'active' | 'disabled' | 'crashed'
  icon?: { value?: string }
  dev?: { enable: boolean; address?: string }
}

interface ToggleOptions {
  points: Array<{ x: number; y: number }>
  x: number
  y: number
  status: boolean
  state: boolean
  style: ComputedRef<string>
}

const plugins = inject<Ref<Plugin[]>>('plugins')!
const pluginInfoRef = ref<HTMLElement>()
const select = ref<string>()
const curSelect = ref<Plugin | null>(null)

const touchSdk = useTouchSDK()

// Individual loading states for different operations
const loadingStates = ref({
  openFolder: false,
  selectPlugin: false
})

// Status mapping for better maintainability (removed since moved to PluginInfo.vue)

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
  () => plugins.value,
  (newPlugins, oldPlugins) => {
    if (!select.value || !newPlugins || !oldPlugins) return
    if (newPlugins.length === oldPlugins.length) return

    const temp = select.value
    select.value = ''
    nextTick(() => {
      setTimeout(() => (select.value = temp), 200)
    })
  },
  { deep: true }
)

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
    select.value = ''
    await sleep(10)
    select.value = index
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

// Plugin action handlers with improved error handling and individual loading states
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

// New plugin overlay toggle logic with better typing
const toggleOptions = reactive<ToggleOptions>({
  points: [],
  x: 0,
  y: 0,
  status: false,
  state: true,
  style: computed(() => {
    const [a, b, c, d] = toggleOptions.points

    if (!a || !b || !c || !d) return 'display: none;'

    return `
      clip-path: polygon(${a.x}% ${a.y}%, ${b.x}% ${b.y}%, ${c.x}% ${c.y}%, ${d.x}% ${d.y}%);
      --fake-opacity: .75;
      width: 100%; height: 100%; z-index: 1;
      transition: clip-path .35s cubic-bezier(0.4, 0, 0.2, 1), opacity .5s ease;
    `
  })
})

const toggleNewPlugin = (() => {
  let status = true
  let _ele: HTMLElement | undefined

  return async (ele?: HTMLElement) => {
    if (ele) {
      _ele = ele
      return
    }

    const floatingPlus = document.getElementById('floating-plus')
    if (!floatingPlus) return

    status = !status
    toggleOptions.status = status

    setTimeout(() => {
      toggleOptions.state = status
    }, 500)

    if (status) {
      if (!_ele) return
      const floating = await computePosition(_ele, floatingPlus as HTMLElement)

      toggleOptions.x = floating.x
      toggleOptions.y = floating.y + 8

      toggleOptions.points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
    } else {
      const el = document.getElementById('newPluginBtn')
      if (!el) return

      const floating = await computePosition(el, floatingPlus as HTMLElement)

      toggleOptions.x = floating.x
      toggleOptions.y = floating.y

      const ww =
        window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
      const wh =
        window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight
      const { width, height } = el.getBoundingClientRect()

      const l = floating.x + width
      const t = floating.y - height

      const [a, b, c, d] = [l / ww, l / ww, (t + height) / wh, (t + height) / wh]

      toggleOptions.points = [
        { x: a * 100, y: c * 100 },
        { x: b * 100, y: c * 100 },
        { x: b * 100, y: d * 100 },
        { x: a * 100, y: d * 100 }
      ]
    }
  }
})()

provide('toggleNewPlugin', toggleNewPlugin)

onMounted(() => {
  setTimeout(toggleNewPlugin, 200)
})

window.addEventListener('resize', () => {
  toggleNewPlugin()
  setTimeout(toggleNewPlugin, 5)
})
</script>

<style scoped>
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
