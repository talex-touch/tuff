<script lang="ts" name="LayoutPreviewFrame" setup>
import type { Component } from 'vue'
import LayoutPreviewContent from './LayoutPreviewContent.vue'

defineProps<{
  layout: Component
}>()
</script>

<template>
  <div class="LayoutPreviewFrame" aria-hidden="true">
    <component :is="layout" display preview class="LayoutPreviewFrame-Inner">
      <template #nav>
        <LayoutPreviewContent section="nav" />
      </template>
      <template #title>
        <LayoutPreviewContent section="title" />
      </template>
      <template #navbar>
        <LayoutPreviewContent section="navbar" />
      </template>
      <template #plugins>
        <LayoutPreviewContent section="plugins" />
      </template>
      <template #icon>
        <LayoutPreviewContent section="icon" />
      </template>
      <template #view>
        <LayoutPreviewContent section="view" />
      </template>
    </component>
  </div>
</template>

<style lang="scss" scoped>
.LayoutPreviewFrame {
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.LayoutPreviewFrame-Inner {
  width: 100%;
  height: 100%;
}

.LayoutPreviewFrame {
  :deep(.AppLayout-Container.Simple) {
    --nav-width: 74px;
    border-radius: 12px;
    background: var(--el-bg-color);
    box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
  }

  :deep(.AppLayout-Container.Simple .AppLayout-Header) {
    border-bottom: 1px solid var(--el-border-color);
  }

  :deep(.AppLayout-Container.Simple .AppLayout-Aside) {
    border-right: 1px solid var(--el-border-color);
  }

  :deep(.AppLayout-Container.Simple .LayoutPreview-NavDot) {
    width: 10px;
    height: 10px;
    border-radius: 6px;
    background: var(--el-fill-color);
  }

  :deep(.AppLayout-Container.Simple .LayoutPreview-SidebarItem) {
    background: transparent;
    border: 1px solid var(--el-border-color-lighter);
  }

  :deep(.AppLayout-Container.Simple .LayoutPreview-View) {
    padding: 8px;
    background: transparent;
  }

  :deep(.AppLayout-Container.Flat) {
    --nav-width: 92px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--el-bg-color) 75%, var(--el-fill-color-light));
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
  }

  :deep(.AppLayout-Container.Flat .AppLayout-Header) {
    border-bottom: none;
  }

  :deep(.AppLayout-Container.Flat .AppLayout-View) {
    border-radius: 14px;
  }

  :deep(.AppLayout-Container.Flat .LayoutPreview-NavDot) {
    width: 16px;
    height: 6px;
    border-radius: 999px;
    background: var(--el-fill-color-light);
  }

  :deep(.AppLayout-Container.Flat .LayoutPreview-SidebarItem) {
    background: var(--el-fill-color-lighter);
    border: none;
  }

  :deep(.AppLayout-Container.Flat .LayoutPreview-View) {
    padding: 10px;
    border-radius: 12px;
    background: var(--el-fill-color-light);
    box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
  }

  :deep(.SimpleController-Controller),
  :deep(.FlatLayout-Controller) {
    display: none;
  }

  :deep(.SimpleController .mx-auto > span) {
    display: none;
  }

  :deep(.FlatLayout-Icon + .mx-auto) {
    display: none;
  }
}
</style>
