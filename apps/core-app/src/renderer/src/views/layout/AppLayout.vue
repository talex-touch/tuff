<script lang="ts" name="AppLayout" setup>
import { computed } from 'vue'
import DynamicLayout from '~/components/layout/DynamicLayout.vue'
import LayoutBackButton from '~/components/layout/LayoutBackButton.vue'
import { useSecondaryNavigation } from '~/modules/layout/useSecondaryNavigation'
import { reportPerfToMain } from '~/modules/perf/perf-report'
import { themeStyle, triggerThemeTransition } from '~/modules/storage/theme-style'

const mica = computed(() => themeStyle.value.theme.window === 'Mica')
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
const { canNavigateBack, navigateBack } = useSecondaryNavigation({
  debugLabel: 'AppLayout'
})

const routeTransitionStartedAt = new Map<string, number>()

function isKeepAliveRoute(route: { meta?: Record<string, unknown> } | null | undefined): boolean {
  return Boolean(route?.meta && (route.meta as { keepAlive?: boolean }).keepAlive)
}

function resolveRouteCacheKey(route: { name?: unknown; fullPath?: string; meta?: any }): string {
  const metaKey =
    route?.meta && typeof route.meta.keepAliveKey === 'string' ? route.meta.keepAliveKey : ''
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
  <div class="AppLayout-Wrapper fake-background" :class="{ mica, coloring, contrast }">
    <DynamicLayout>
      <template #view>
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
      </template>
      <template #nav>
        <LayoutBackButton :visible="canNavigateBack" @click="navigateBack" />
      </template>
      <template #title>
        <slot name="title" />
      </template>
      <template #icon>
        <slot name="icon" />
      </template>
      <template #navbar>
        <slot name="navbar" />
      </template>
      <template #plugins>
        <slot name="plugins" />
      </template>
    </DynamicLayout>
  </div>
</template>

<style lang="scss">
.AppLayout-Aside {
  .NavBar-Home {
    max-height: 300px;
  }

  z-index: 1000;
  position: relative;
  padding: 0.1rem 0.5rem;
  display: flex;

  flex-direction: column;

  left: 0;

  width: var(--nav-width, 30px);
  min-width: var(--nav-width, 30px);
  max-width: var(--nav-width, 30px);
  // height: 100%;

  flex: 0 0 var(--nav-width, 30px);
  // flex-shrink: 0;

  box-sizing: border-box;

  --fake-inner-opacity: 0;
  --fake-radius: 0;

  transition:
    margin-right 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    left 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    width 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    opacity 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

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

.AppLayout-Main {
  position: relative;
  display: flex;

  flex: 1;
  height: calc(100% - var(--ctr-height, 40px));
  min-height: 0;
  min-width: 0;

  overflow: hidden;
}

.AppLayout-Header {
  z-index: 1000;
  position: sticky;
  padding: 0 10px;
  display: flex;

  top: 0;

  height: var(--ctr-height, 40px);

  align-items: center;
  justify-content: center;

  box-sizing: border-box;

  --fake-inner-opacity: 0;
  --fake-radius: 8px 8px 0 0;

  transition:
    margin-bottom 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    top 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    height 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    opacity 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.AppLayout-Controller {
  position: relative;
  margin: 0;

  display: flex;

  justify-content: flex-start;

  width: 100%;
  height: 5%;

  list-style: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.mica.AppLayout-Wrapper {
  --fake-inner-opacity: 0.5;
}

.AppLayout-Wrapper {
  span.tag.version {
    margin-left: 10px;

    width: 110px;

    opacity: 0.75;
    font-size: 12px;
  }

  .AppLayout-View {
    z-index: 100;
    position: relative;

    //width: calc(100% - 70px);
    // height: calc(100% - 30px);
    flex: 1;

    box-sizing: border-box;

    opacity: 0;
    --fake-opacity: 1;
    -webkit-app-region: no-drag;
    animation: viewEnter 0.25s 0.5s forwards;
  }

  .AppLayout-Container {
    position: relative;
    //padding: 10px;

    height: 100%;
    width: 100%;

    box-sizing: border-box;
  }

  --nav-width: 70px;
  --ctr-height: 40px;

  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
  -webkit-app-region: drag;
}
</style>
