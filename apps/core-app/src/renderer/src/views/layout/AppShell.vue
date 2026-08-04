<script lang="ts" name="AppShell" setup>
import { computed, onMounted } from 'vue'
import ShellSidebar from '~/components/shell/ShellSidebar.vue'
import ShellTopBar from '~/components/shell/ShellTopBar.vue'
import { useWallpaper } from '~/modules/layout/useWallpaper'
import { reportPerfToMain } from '~/modules/perf/perf-report'
import {
  normalizeWindowPreference,
  themeStyle,
  triggerThemeTransition,
  type ThemeWindowPreference
} from '~/modules/storage/theme-style'

const windowPreference = computed<ThemeWindowPreference>(() =>
  normalizeWindowPreference(themeStyle.value.theme.window)
)
const isRefractionWindow = computed(() => windowPreference.value === 'refraction')
const isFilterWindow = computed(() => windowPreference.value === 'filter')
const isPureWindow = computed(() => windowPreference.value === 'pure')
const coloring = computed(() => themeStyle.value.theme.addon.coloring)
const contrast = computed(() => themeStyle.value.theme.addon.contrast)
const routeTransitionStyle = computed(() => themeStyle.value.theme.transition?.route ?? 'slide')
const routeTransitionName = computed(() => {
  switch (routeTransitionStyle.value) {
    case 'fade':
      return 'route-fade'
    case 'zoom':
      return 'route-zoom'
    case 'slide':
    default:
      return 'route-slide'
  }
})
const { wallpaperActive, wallpaperStyle } = useWallpaper()
const touchBlur = computed(
  () => isRefractionWindow.value || isFilterWindow.value || wallpaperActive.value
)
const windowOpacityVars = computed<Record<string, string>>(() => {
  switch (windowPreference.value) {
    case 'pure':
      return {
        '--layout-window-header-opacity': '1',
        '--layout-window-aside-opacity': '1'
      }
    case 'refraction':
      return {
        '--layout-window-header-opacity': '0.85',
        '--layout-window-aside-opacity': '0.45'
      }
    case 'filter':
      return {
        '--layout-window-header-opacity': '0.8',
        '--layout-window-aside-opacity': '0.4'
      }
    default:
      return {
        '--layout-window-header-opacity': '1',
        '--layout-window-aside-opacity': '1'
      }
  }
})
const wrapperStyle = computed<Record<string, string | number>>(() => {
  const style: Record<string, string | number> = { ...windowOpacityVars.value }
  if (wallpaperActive.value) {
    style['--fake-index'] = -2
  }
  return style
})

const routeTransitionStartedAt = new Map<string, number>()

function isKeepAliveRoute(route: { meta?: Record<string, unknown> } | null | undefined): boolean {
  return Boolean(route?.meta && (route.meta as { keepAlive?: boolean }).keepAlive)
}

function resolveRouteCacheKey(route: {
  name?: unknown
  fullPath?: string
  meta?: Record<string, unknown>
}): string {
  const metaKey = typeof route?.meta?.keepAliveKey === 'string' ? route.meta.keepAliveKey : ''
  if (metaKey) {
    return metaKey
  }

  return typeof route?.name === 'string' && route.name.length > 0
    ? route.name
    : route?.fullPath || 'unknown-route'
}

function onRouteEnterStart(fullPath: string): void {
  routeTransitionStartedAt.set(fullPath, performance.now())
}

function onRouteEnterEnd(fullPath: string): void {
  const startedAt = routeTransitionStartedAt.get(fullPath)
  if (startedAt === undefined) {
    return
  }
  routeTransitionStartedAt.delete(fullPath)

  const durationMs = performance.now() - startedAt
  if (durationMs < 500 && fullPath !== '/details') {
    return
  }

  reportPerfToMain({
    kind: 'ui.route.transition',
    eventName: fullPath,
    durationMs,
    at: Date.now(),
    meta: {
      transition: routeTransitionName.value,
      style: routeTransitionStyle.value,
      phase: 'enter'
    }
  })
}

onMounted(() => {
  triggerThemeTransition(
    [innerWidth / 2, innerHeight / 2],
    themeStyle.value.theme.style.auto
      ? 'auto'
      : themeStyle.value.theme.style.dark
        ? 'dark'
        : 'light'
  )
})
</script>

<template>
  <div
    class="AppShell fake-background"
    :class="{
      'window-pure': isPureWindow,
      'window-refraction': isRefractionWindow,
      'window-filter': isFilterWindow,
      coloring,
      contrast,
      'touch-blur': touchBlur
    }"
    :style="wrapperStyle"
  >
    <div v-if="wallpaperActive" class="AppWallpaper" :style="wallpaperStyle" />

    <ShellSidebar />

    <main class="AppShell-Main">
      <ShellTopBar />

      <div class="AppShell-View">
        <router-view v-slot="{ Component, route }">
          <transition
            :name="routeTransitionName"
            appear
            @before-enter="() => onRouteEnterStart(route.fullPath)"
            @after-enter="() => onRouteEnterEnd(route.fullPath)"
          >
            <KeepAlive v-if="Component && isKeepAliveRoute(route)">
              <component :is="Component" :key="resolveRouteCacheKey(route)" />
            </KeepAlive>
            <component :is="Component" v-else-if="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style lang="scss">
@keyframes viewEnter {
  from {
    opacity: 0;
    transform: translateX(100%) scale(0.85);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.route-slide-enter-active,
.route-slide-leave-active,
.route-fade-enter-active,
.route-fade-leave-active,
.route-zoom-enter-active,
.route-zoom-leave-active {
  position: absolute !important;
  inset: 0 !important;
  width: 100%;
  height: 100%;
  transition:
    opacity 0.35s cubic-bezier(0.25, 0.8, 0.25, 1),
    transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1),
    filter 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
  will-change: transform, opacity;
}

.route-slide-enter-active,
.route-fade-enter-active,
.route-zoom-enter-active {
  z-index: 2;
}

.route-slide-leave-active,
.route-fade-leave-active,
.route-zoom-leave-active {
  z-index: 1;
  pointer-events: none;
}

.route-slide-enter-from {
  opacity: 0;
  transform: translate3d(80px, 0, 0) scale(0.96);
  filter: brightness(1.05);
}

.route-slide-leave-to {
  opacity: 0;
  transform: translate3d(-40px, 0, 0) scale(0.92);
  filter: brightness(0.85);
}

.route-fade-enter-from {
  opacity: 0;
}

.route-fade-leave-to {
  opacity: 0;
}

.route-zoom-enter-from {
  opacity: 0;
  transform: scale(0.98);
  filter: blur(2px);
}

.route-zoom-leave-to {
  opacity: 0;
  transform: scale(1.02);
  filter: blur(2px);
}

.AppWallpaper {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-size: cover;
  background-position: center;
  pointer-events: none;
  transition:
    opacity 200ms ease,
    filter 200ms ease;
}

.AppShell {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  --fake-opacity: var(--layout-window-aside-opacity, 0.5);

  &.window-refraction,
  &.window-filter {
    --fake-inner-opacity: 0.5;
  }

  &.window-pure {
    background: var(--shell-bg);
  }

  &.window-refraction .AppShell-View,
  &.window-filter .AppShell-View {
    --fake-opacity: 0.85;
  }
}

.AppShell-Main {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
}

.AppShell-View {
  z-index: 1;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
</style>
