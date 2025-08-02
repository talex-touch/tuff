<template>
  <div
    class="plugin-container"
    :class="{ 'overlay-active': toggleOptions.state, 'blur-active': toggleOptions.status }"
  >
    <!-- Plugin List Sidebar -->
    <div class="plugin-sidebar">
      <div class="sidebar-header">
        <h2 class="sidebar-title">Plugins</h2>
        <div class="plugin-stats">
          <span class="stat-item">
            <i class="i-ri-puzzle-line" />
            {{ plugins.length }} installed
          </span>
          <span class="stat-item">
            <i class="i-ri-check-line" />
            {{ enabledCount }} active
          </span>
        </div>
      </div>

      <PluginList :plugins="[...plugins]" @select="selectPlugin" />

      <!-- Quick Actions -->
      <div class="quick-actions">
        <FlatButton
          class="action-btn folder-btn text-sm"
          :disabled="loadingStates.openFolder"
          @click="handleOpenPluginFolder"
        >
          <i v-if="!loadingStates.openFolder" block class="i-ri-folder-open-line" />
          <i v-else block class="i-ri-loader-4-line animate-spin" />
          <span block>{{ loadingStates.openFolder ? 'Opening...' : 'Open Plugin Folder' }}</span>
        </FlatButton>
      </div>
    </div>

    <!-- Plugin Info Panel -->
    <div ref="pluginInfoRef" class="plugin-info-panel">
      <div v-if="select && curSelect" class="plugin-details">
        <!-- Plugin Content -->
        <div class="plugin-content">
          <PluginInfo :plugin="curSelect" />
        </div>
      </div>

      <!-- Enhanced Empty State -->
      <div v-else class="plugin-empty-state">
        <div class="empty-animation">
          <div class="empty-main-icon">
            <i class="i-ri-puzzle-line" />
          </div>
          <div
            v-for="i in 6"
            :key="i"
            class="floating-bubble"
            :style="`--delay: ${i * 0.8}s; --index: ${i}`"
          />
        </div>

        <div class="empty-content">
          <h3>No Plugin Selected</h3>
          <p>Choose a plugin from the sidebar to view its details and manage settings</p>
          <div class="empty-actions">
            <FlatButton class="cta-button text-sm" @click="() => $router.push('/market')">
              <i class="i-ri-store-line" />
              Explore Plugin Market
            </FlatButton>
          </div>
        </div>

        <!-- Background Elements -->
        <div class="background-grid" />
        <div class="background-dots" />
      </div>
    </div>

    <!-- New Plugin Overlay -->
    <div
      class="new-plugin-overlay"
      rounded
      bd-lg
      absolute
      top-0
      left-0
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
      <PluginNew mt--9 />
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

// Computed property for any loading state
const isAnyLoading = computed(() => Object.values(loadingStates.value).some(Boolean))

// Computed properties for enhanced UI
const enabledCount = computed(() => {
  if (!plugins.value) return 0
  return plugins.value.filter(
    (plugin: Plugin) => plugin.status === 'enabled' || plugin.status === 'active'
  ).length
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
    await touchSdk.openModuleFolder("plugins")
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
  let _ele

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

<style lang="scss" scoped>
/* ===== MAIN CONTAINER ===== */
.plugin-container {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--el-bg-color);
  overflow: hidden;

  &.blur-active {
    .plugin-sidebar,
    .plugin-info-panel {
      filter: blur(4px);
      pointer-events: none;
    }
  }
}

/* ===== PLUGIN SIDEBAR ===== */
.plugin-sidebar {
  position: relative;
  width: 320px;
  height: 100%;
  background: var(--el-fill-color-extra-light);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    width: 280px;
  }
}

.sidebar-header {
  padding: 2rem 1.5rem 1.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(
    135deg,
    var(--el-fill-color-extra-light) 0%,
    var(--el-fill-color-light) 100%
  );
  backdrop-filter: blur(10px);
}

.sidebar-title {
  margin: 0 0 1rem 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.025em;
  background: linear-gradient(
    135deg,
    var(--el-text-color-primary) 0%,
    var(--el-color-primary) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.plugin-stats {
  display: flex;
  gap: 1rem;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--el-text-color-regular);
    opacity: 0.8;
    transition: all 0.3s ease;

    i {
      font-size: 1rem;
      color: var(--el-color-primary);
    }

    &:hover {
      opacity: 1;
      transform: translateY(-1px);
    }
  }
}

.quick-actions {
  padding: 1rem 1.5rem;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.action-btn {
  :deep(.FlatButton-Container) {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-weight: 500;
    border-radius: 12px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    i {
      font-size: 1.125rem;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
    }
  }

  &.market-btn :deep(.FlatButton-Container) {
    background: var(--el-color-primary);
    color: white;

    &:hover:not(:disabled) {
      background: var(--el-color-primary-dark-2);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(var(--el-color-primary-rgb), 0.3);
    }
  }

  &.folder-btn :deep(.FlatButton-Container) {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--el-border-color);

    &:hover:not(:disabled) {
      background: var(--el-fill-color-light);
      border-color: var(--el-color-primary-light-5);
      color: var(--el-color-primary);
      transform: translateY(-1px);
    }
  }
}

/* ===== PLUGIN INFO PANEL ===== */
.plugin-info-panel {
  position: relative;
  flex: 1;
  height: 100%;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--el-bg-color);
}

.plugin-details {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== PLUGIN CONTENT ===== */
.plugin-content {
  flex: 1;
  overflow: auto;
  padding: 0;
}

/* ===== EMPTY STATE ===== */
.plugin-empty-state {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  animation: fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.empty-animation {
  position: relative;
  margin-bottom: 2rem;
  animation: slideInFromTop 1s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
}

.empty-main-icon {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--el-color-primary-light-9) 0%,
    var(--el-color-primary-light-8) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 2rem;
  animation:
    pulse 3s ease-in-out infinite,
    bounceIn 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s both;
  box-shadow: 0 10px 30px rgba(var(--el-color-primary-rgb), 0.2);

  i {
    font-size: 3rem;
    color: var(--el-color-primary);
  }
}

.floating-bubble {
  position: absolute;
  width: calc(16px + var(--index) * 2px);
  height: calc(16px + var(--index) * 2px);
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--el-color-primary-light-7) 0%,
    var(--el-color-primary-light-8) 100%
  );
  animation:
    float 4s ease-in-out infinite,
    fadeInScale 0.8s cubic-bezier(0.4, 0, 0.2, 1) both;
  animation-delay: var(--delay), calc(var(--delay) + 0.3s);
  opacity: 0;
  box-shadow: 0 4px 15px rgba(var(--el-color-primary-rgb), 0.3);

  &:nth-child(2) {
    top: 20%;
    left: 20%;
  }
  &:nth-child(3) {
    top: 30%;
    right: 25%;
  }
  &:nth-child(4) {
    bottom: 40%;
    left: 15%;
  }
  &:nth-child(5) {
    bottom: 25%;
    right: 20%;
  }
  &:nth-child(6) {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  &:nth-child(7) {
    top: 15%;
    left: 60%;
  }
}

.empty-content {
  position: relative;
  z-index: 1;
  max-width: 480px;
  animation: fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.6s both;

  h3 {
    margin: 0 0 1rem 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
    animation: slideInFromBottom 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.8s both;
  }

  p {
    margin: 0 0 2rem 0;
    font-size: 1rem;
    color: var(--el-text-color-regular);
    opacity: 0.8;
    line-height: 1.6;
    animation: slideInFromBottom 0.8s cubic-bezier(0.4, 0, 0.2, 1) 1s both;
  }
}

.empty-actions {
  display: flex;
  justify-content: center;
  animation: slideInFromBottom 0.8s cubic-bezier(0.4, 0, 0.2, 1) 1.2s both;
}

.cta-button {
  :deep(.FlatButton-Container) {
    padding: 0.75rem 2rem;
    background: var(--el-color-primary);
    color: white;
    border-radius: 50px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      transition: left 0.5s;
    }

    &:hover {
      background: var(--el-color-primary-dark-2);
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 12px 30px rgba(var(--el-color-primary-rgb), 0.4);

      &::before {
        left: 100%;
      }
    }

    i {
      font-size: 1.125rem;
    }
  }
}

.background-grid {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  background-image:
    linear-gradient(var(--el-border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--el-border-color) 1px, transparent 1px);
  background-size: 50px 50px;
  z-index: 0;
  animation: gridPulse 4s ease-in-out infinite;
}

.background-dots {
  position: absolute;
  inset: 0;
  opacity: 0.02;
  background-image: radial-gradient(
    circle at 25% 25%,
    var(--el-color-primary) 2px,
    transparent 2px
  );
  background-size: 100px 100px;
  z-index: 0;
  animation: dotsFloat 6s ease-in-out infinite;
}

/* ===== NEW PLUGIN OVERLAY ===== */
.new-plugin-overlay {
  background: var(--el-fill-color);
  backdrop-filter: blur(20px);
  border: 1px solid var(--el-border-color-lighter);
}

.floating-add-btn {
  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    background-color: var(--el-color-primary);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 2px;
  }

  &::before {
    width: 2px;
    height: 16px;
    transform: translate(-50%, -50%);
  }

  &::after {
    width: 16px;
    height: 2px;
    transform: translate(-50%, -50%);
  }

  &:hover {
    opacity: 0.8;
    transform: translate(var(--x), calc(var(--y) - 100%)) scale(1.1);
  }

  &.active {
    &::before {
      height: 12px;
      transform: translate(-50%, -50%) rotate(45deg);
    }

    &::after {
      width: 12px;
      transform: translate(-50%, -50%) rotate(45deg);
    }
  }

  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translate(var(--x), calc(var(--y) - 100%));
  border: 2px solid var(--el-color-primary-light-7);

  &:hover {
    box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
  }
}

/* ===== ANIMATIONS ===== */
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

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.6;
  }
  50% {
    transform: translateY(-20px) rotate(180deg);
    opacity: 0.8;
  }
}

@keyframes fadeInUp {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInFromTop {
  0% {
    opacity: 0;
    transform: translateY(-50px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInFromBottom {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fadeInScale {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
}

@keyframes gridPulse {
  0%,
  100% {
    opacity: 0.03;
  }
  50% {
    opacity: 0.06;
  }
}

@keyframes dotsFloat {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.02;
  }
  50% {
    transform: translateY(-10px);
    opacity: 0.04;
  }
}

/* ===== RESPONSIVE DESIGN ===== */
@media (max-width: 768px) {
  .empty-main-icon {
    width: 80px;
    height: 80px;

    i {
      font-size: 2rem;
    }
  }

  .empty-content h3 {
    font-size: 1.5rem;
  }
}
</style>
