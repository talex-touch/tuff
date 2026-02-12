<script lang="ts" name="AppLayoutCustom" setup>
import type { LayoutCanvasConfig, LayoutCanvasItem } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils'
import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { computed } from 'vue'
import { resolveLayoutAtomsToCSSVars, useLayoutAtoms } from '~/modules/layout/atoms'
import { sanitizeUserCss } from '~/modules/style/sanitizeUserCss'
import LayoutShell from '../shared/LayoutShell.vue'
import LayoutFooter from '../shared/LayoutFooter.vue'
import SimpleController from '../simple/SimpleController.vue'
import SimpleNavBar from '../simple/SimpleNavBar.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
    preview?: boolean
  }>(),
  {
    display: false,
    preview: false
  }
)

const { atomConfig } = useLayoutAtoms()
const isDisplayMode = computed(() => props.display)
const isPreviewMode = computed(() => props.preview)
const shouldRenderSlots = computed(() => !isDisplayMode.value || isPreviewMode.value)
const isWindows = process.platform === 'win32'

function normalizeCanvasConfig(value: unknown): LayoutCanvasConfig {
  const fallback = appSettingOriginData.layoutCanvasConfig
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const parsed = value as Partial<LayoutCanvasConfig>
  if (!Array.isArray(parsed.items)) {
    return fallback
  }

  const columns = Math.max(4, Math.min(24, Number(parsed.columns) || fallback.columns))
  const rowHeight = Math.max(12, Math.min(96, Number(parsed.rowHeight) || fallback.rowHeight))
  const gap = Math.max(0, Math.min(24, Number(parsed.gap) || fallback.gap))
  const items = parsed.items.map((item) => {
    const current = item as LayoutCanvasItem
    const width = Math.max(1, Number(current.w) || 1)
    const height = Math.max(1, Number(current.h) || 1)
    return {
      ...current,
      x: Math.max(0, Math.min(columns - width, Number(current.x) || 0)),
      y: Math.max(0, Number(current.y) || 0),
      w: width,
      h: height
    }
  })

  return {
    enabled: parsed.enabled === true,
    preset: parsed.preset || fallback.preset,
    columns,
    rowHeight,
    gap,
    items,
    colorVars: parsed.colorVars,
    customCSS: parsed.customCSS
  }
}

const canvasConfig = computed<LayoutCanvasConfig>(() => {
  return normalizeCanvasConfig(
    appSettingsData?.layoutCanvasConfig ?? appSettingOriginData.layoutCanvasConfig
  )
})

const isCanvasEnabled = computed(() => canvasConfig.value.enabled === true)

const canvasGridStyle = computed<Record<string, string>>(() => {
  const config = canvasConfig.value
  const maxRows = config.items.reduce((rows, item) => {
    if (item.visible === false) {
      return rows
    }
    return Math.max(rows, item.y + item.h)
  }, 12)

  return {
    '--layout-canvas-columns': String(config.columns),
    '--layout-canvas-row-height': `${config.rowHeight}px`,
    '--layout-canvas-gap': `${config.gap}px`,
    '--layout-canvas-rows': String(Math.max(8, maxRows))
  }
})

const areaMap = computed(() => {
  const map = new Map<string, LayoutCanvasItem>()
  for (const item of canvasConfig.value.items) {
    map.set(item.area, item)
  }
  return map
})

function getAreaStyle(area: 'header' | 'aside' | 'view'): Record<string, string> {
  const item = areaMap.value.get(area)
  if (!item || item.visible === false) {
    return { display: 'none' }
  }

  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`
  }
}

const atomCSSVars = computed<Record<string, string> | undefined>(() => {
  if (!atomConfig.value) {
    return undefined
  }
  return resolveLayoutAtomsToCSSVars(atomConfig.value, isDisplayMode.value) as Record<
    string,
    string
  >
})

const wrapperStyle = computed<Record<string, string>>(() => {
  return {
    ...(atomCSSVars.value || {}),
    ...(canvasConfig.value.colorVars || {}),
    ...canvasGridStyle.value
  }
})

const customCss = computed(() => {
  const cssText = [atomConfig.value?.customCSS, canvasConfig.value.customCSS]
    .filter(Boolean)
    .join('\n')
  return sanitizeUserCss(cssText)
})
</script>

<template>
  <LayoutShell
    v-if="!isCanvasEnabled"
    variant="simple"
    :atom-config="atomConfig"
    :display="isDisplayMode"
    :preview="isPreviewMode"
    :is-windows="isWindows"
  >
    <template #header>
      <SimpleController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="shouldRenderSlots" #title>
          <slot name="title" />
        </template>
      </SimpleController>
    </template>
    <template #aside>
      <SimpleNavBar>
        <slot name="navbar" />
        <template #plugins>
          <slot name="plugins" />
        </template>
      </SimpleNavBar>
    </template>
    <template #icon>
      <slot name="icon" />
    </template>
    <template #view>
      <slot name="view" />
    </template>
  </LayoutShell>

  <div
    v-else
    class="AppLayout-Container CustomLayout-Container"
    :class="{ 'is-display': isDisplayMode, 'is-preview': isPreviewMode, 'is-windows': isWindows }"
    data-variant="custom"
    :style="wrapperStyle"
  >
    <div class="CustomLayout-Grid">
      <div class="AppLayout-Header fake-background" :style="getAreaStyle('header')">
        <SimpleController>
          <template #nav>
            <slot name="nav" />
          </template>
          <template v-if="shouldRenderSlots" #title>
            <slot name="title" />
          </template>
        </SimpleController>
      </div>

      <div class="AppLayout-Aside fake-background" :style="getAreaStyle('aside')">
        <SimpleNavBar>
          <slot name="navbar" />
          <template #plugins>
            <slot name="plugins" />
          </template>
        </SimpleNavBar>
        <div class="AppLayout-IconFooter">
          <slot v-if="shouldRenderSlots" name="icon" />
          <LayoutFooter v-if="!isDisplayMode" />
          <div v-else class="LayoutDisplay-Footer" />
        </div>
      </div>

      <div class="AppLayout-View fake-background" :style="getAreaStyle('view')">
        <slot v-if="shouldRenderSlots" name="view" />
        <div v-else class="LayoutDisplay-View" />
      </div>
    </div>

    <component :is="'style'" v-if="customCss">{{ customCss }}</component>
  </div>
</template>

<style scoped lang="scss">
@use '~/styles/layout/layout-shell' as *;

.CustomLayout-Container {
  @include layout-shell-base;
  @include layout-shell-display;

  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  padding: 6px;
}

.CustomLayout-Grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(var(--layout-canvas-columns), minmax(0, 1fr));
  grid-auto-rows: var(--layout-canvas-row-height);
  grid-template-rows: repeat(var(--layout-canvas-rows), var(--layout-canvas-row-height));
  gap: var(--layout-canvas-gap);
}

.CustomLayout-Grid > .AppLayout-Header,
.CustomLayout-Grid > .AppLayout-Aside,
.CustomLayout-Grid > .AppLayout-View {
  position: relative;
  top: auto;
  left: auto;
  width: auto;
  min-width: 0;
  max-width: none;
  height: auto;
  min-height: 0;
  flex: initial;
}

.CustomLayout-Grid > .AppLayout-Header {
  border-bottom: var(--layout-header-border, none);
}

.CustomLayout-Grid > .AppLayout-Aside {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 4px;
  border-right: var(--layout-aside-border, none);
}

.CustomLayout-Grid > .AppLayout-Aside .AppLayout-IconFooter {
  position: relative;
  width: 100%;
  left: auto;
  bottom: auto;
  margin-top: auto;
  height: auto;
  min-height: 32px;
}

.CustomLayout-Grid > .AppLayout-View {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  --fake-radius: var(--layout-view-radius, 0);
  border-radius: var(--layout-view-radius, 0);
}

.CustomLayout-Container.is-display {
  pointer-events: none;
}
</style>
