<script lang="ts" name="LayoutShell" setup>
import LayoutFooter from './LayoutFooter.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
    preview?: boolean
    variant: 'simple' | 'flat'
    isWindows?: boolean
  }>(),
  {
    display: false,
    preview: false,
    isWindows: false
  }
)

const isDisplayMode = computed(() => props.display)
const isPreviewMode = computed(() => props.preview)
const shouldRenderSlots = computed(() => !isDisplayMode.value || isPreviewMode.value)
const isWindows = computed(() => props.isWindows)
const variantClass = computed(() => (props.variant === 'simple' ? 'Simple' : 'Flat'))
</script>

<template>
  <div
    class="AppLayout-Container"
    :class="[
      { 'is-display': isDisplayMode, 'is-preview': isPreviewMode, 'is-windows': isWindows },
      variantClass
    ]"
    :data-variant="variant"
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
</style>
