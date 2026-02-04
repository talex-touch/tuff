<script lang="ts" name="LayoutShell" setup>
import type { LayoutAtomConfig } from '@talex-touch/utils'
import { computed } from 'vue'
import { resolveLayoutAtomsToCSSVars } from '~/modules/layout/atoms'
import { sanitizeUserCss } from '~/modules/style/sanitizeUserCss'
import LayoutFooter from './LayoutFooter.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
    preview?: boolean
    variant: 'simple' | 'flat'
    isWindows?: boolean
    atomConfig?: LayoutAtomConfig | null
  }>(),
  {
    display: false,
    preview: false,
    isWindows: false,
    atomConfig: undefined
  }
)

const isDisplayMode = computed(() => props.display)
const isPreviewMode = computed(() => props.preview)
const shouldRenderSlots = computed(() => !isDisplayMode.value || isPreviewMode.value)
const isWindows = computed(() => props.isWindows)
const variantClass = computed(() => (props.variant === 'simple' ? 'Simple' : 'Flat'))

const atomCSSVars = computed(() => {
  if (!props.atomConfig) return undefined
  return resolveLayoutAtomsToCSSVars(props.atomConfig, isDisplayMode.value) as Record<
    string,
    string
  >
})

const asidePosition = computed(() => props.atomConfig?.aside?.position ?? 'left')
const asideVisible = computed(() => (props.atomConfig?.aside?.position ?? 'left') !== 'hidden')
const isAsideBottom = computed(() => asidePosition.value === 'bottom')
const customCss = computed(() => sanitizeUserCss(props.atomConfig?.customCSS ?? ''))
</script>

<template>
  <div
    class="AppLayout-Container"
    :class="[
      { 'is-display': isDisplayMode, 'is-preview': isPreviewMode, 'is-windows': isWindows },
      variantClass,
      {
        'aside-hidden': !asideVisible,
        'aside-bottom': isAsideBottom,
        [`aside-${asidePosition}`]: asideVisible
      }
    ]"
    :data-variant="atomConfig ? atomConfig.preset : variant"
    :data-aside-position="asidePosition"
    :style="atomCSSVars"
  >
    <div class="AppLayout-Header fake-background">
      <slot name="header" />
    </div>
    <div class="AppLayout-Main">
      <div class="AppLayout-Aside fake-background">
        <slot name="aside" />
        <div class="AppLayout-IconFooter">
          <slot v-if="shouldRenderSlots" name="icon" />
          <LayoutFooter v-if="!isDisplayMode" />
          <div v-else class="LayoutDisplay-Footer" />
        </div>
      </div>
      <div class="AppLayout-View fake-background">
        <slot v-if="shouldRenderSlots" name="view" />
        <div v-else class="LayoutDisplay-View" />
      </div>
    </div>
    <component :is="'style'" v-if="customCss">{{ customCss }}</component>
  </div>
</template>

<style lang="scss" scoped>
@use '~/styles/layout/layout-shell' as *;

.AppLayout-Container {
  @include layout-shell-base;
  @include layout-shell-display;
}

.AppLayout-Container[data-variant='simple'] {
  --layout-view-radius: 0;
  --layout-header-border: 1px solid var(--el-border-color);
  --layout-header-fake-opacity: 1;
  --layout-aside-border: 1px solid var(--el-border-color);
  --layout-aside-opacity: 0.5;
  --layout-display-ctr-height: 26px;
  --layout-display-nav-width: 68px;
  --layout-display-padding: 0.5rem;
  --layout-display-header-gap: 8px;
  --layout-display-main-gap: 6px;
  --layout-display-aside-padding: 2px 4px;
  --layout-display-footer-height: 32px;
  --layout-display-menu-padding: 0.25rem;
  --layout-display-menu-margin: 0.2rem;
  --layout-display-menu-opacity: 0.4;
  --layout-display-placeholder-opacity: 0.6;
  --layout-display-footer-bar: 32px;
  --layout-display-footer-margin: 6px;
}

.AppLayout-Container[data-variant='flat'] {
  --layout-view-radius: 8px 0 0 0;
  --layout-display-ctr-height: 28px;
  --layout-display-nav-width: 64px;
  --layout-display-padding: 6px 8px;
  --layout-display-header-gap: 10px;
  --layout-display-aside-padding: 4px;
  --layout-display-footer-height: 36px;
  --layout-display-menu-padding: 0.3rem;
  --layout-display-menu-margin: 0.15rem;
  --layout-display-menu-opacity: 0.35;
  --layout-display-placeholder-opacity: 0.65;
  --layout-display-footer-bar: 34px;
  --layout-display-footer-margin: 8px;
}

.AppLayout-Container[data-variant='simple'].is-windows {
  .AppLayout-Aside {
    padding-left: 8px;
  }
}

.AppLayout-Container.aside-hidden {
  .AppLayout-Aside {
    display: none;
  }

  .AppLayout-View {
    width: 100%;
  }
}

.AppLayout-Container.aside-right .AppLayout-Main {
  flex-direction: row-reverse;

  .AppLayout-Aside {
    border-right: none;
    border-left: var(--layout-aside-border, none);
  }
}

.AppLayout-Container.aside-bottom .AppLayout-Main {
  flex-direction: column;

  .AppLayout-Aside {
    order: 2;
    width: 100%;
    min-width: unset;
    max-width: none;
    height: var(--layout-dock-height, 56px);
    min-height: var(--layout-dock-height, 56px);
    flex: 0 0 var(--layout-dock-height, 56px);
    border-right: none;
    border-top: var(--layout-aside-border, none);
    flex-direction: row;
    justify-content: center;
    align-items: center;
    padding: 4px 8px;
    gap: 4px;
  }

  .AppLayout-Aside .AppLayout-IconFooter {
    position: relative;
    flex-direction: row;
    width: auto;
    height: auto;
    min-height: 0;
    gap: 4px;
  }

  .AppLayout-Aside > ul,
  .AppLayout-Aside .SimpleNavBar-Home,
  .AppLayout-Aside .FlatNavBar-Home {
    flex-direction: row;
    margin: 0;
    padding: 0;
  }

  .AppLayout-View {
    order: 1;
    width: 100%;
  }
}
</style>
