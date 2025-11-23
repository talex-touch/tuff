<script lang="ts" name="LayoutSection" setup>
import type { Component } from 'vue'
import { markRaw, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useDynamicTuffLayout } from '~/modules/layout'

const { t } = useI18n()

const { currentLayoutName, availableLayouts, switchLayout } = useDynamicTuffLayout()

interface LayoutPreviewState {
  component: Component | null
  loading: boolean
}

const layoutPreviewStates = reactive<Record<string, LayoutPreviewState>>({})

watch(
  availableLayouts,
  (layouts) => {
    Object.entries(layouts).forEach(([key, layout]) => {
      if (layoutPreviewStates[key]) return

      layoutPreviewStates[key] = reactive<LayoutPreviewState>({
        component: null,
        loading: true
      })

      layout.component
        .then((module) => {
          layoutPreviewStates[key].component = markRaw(module.default)
        })
        .catch((error) => {
          console.error(`[LayoutSection] Failed to load preview for layout "${key}":`, error)
        })
        .finally(() => {
          layoutPreviewStates[key].loading = false
        })
    })
  },
  { immediate: true }
)

function getLayoutLabel(layoutKey: string, fallbackName?: string): string {
  return t(`layoutSection.layouts.${layoutKey}`, fallbackName || layoutKey)
}

async function handleLayoutSelect(layoutName: string): Promise<void> {
  if (layoutName === currentLayoutName.value) return

  try {
    await switchLayout(layoutName)
  } catch (error) {
    console.error('[LayoutSection] Failed to switch layout:', error)
    ElMessage.error(t('layoutSection.switchError'))
  }
}
</script>

<template>
  <TuffGroupBlock
    :name="t('layoutSection.title')"
    :description="t('layoutSection.tip')"
    class="LayoutSection-Wrapper"
  >
    <div class="LayoutSection-List p-2">
      <button
        v-for="(layout, key) in availableLayouts"
        :key="key"
        type="button"
        class="LayoutSection-Item"
        :class="{ active: currentLayoutName === key }"
        :aria-pressed="currentLayoutName === key"
        @click="handleLayoutSelect(key)"
      >
        <div class="LayoutSection-Preview">
          <div v-if="layoutPreviewStates[key]?.component" class="LayoutSection-PreviewLayout">
            <component
              :is="layoutPreviewStates[key].component"
              class="LayoutSection-PreviewLayout-Inner"
              display
            />
          </div>
          <div v-else class="LayoutSection-PreviewSkeleton">
            <div class="LayoutSection-Skeleton-Header" />
            <div class="LayoutSection-Skeleton-Body">
              <div class="LayoutSection-Skeleton-Sidebar" />
              <div class="LayoutSection-Skeleton-Main" />
            </div>
          </div>
        </div>
        <div class="LayoutSection-Info">
          <span class="LayoutSection-Name">
            {{ getLayoutLabel(key, layout.displayName) }}
          </span>
          <span v-if="currentLayoutName === key" class="LayoutSection-Status">
            {{ t('layoutSection.currentTag') }}
          </span>
        </div>
      </button>
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.LayoutSection-List {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.LayoutSection-Item {
  display: flex;
  flex-direction: column;
  width: 220px;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-bg-color);
  cursor: pointer;
  padding: 0;
  gap: 0.5rem;
}

.LayoutSection-Item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.LayoutSection-Item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.LayoutSection-Preview {
  width: 100%;
  height: 140px;
  border-radius: 10px 10px 0 0;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.LayoutSection-PreviewLayout,
.LayoutSection-PreviewSkeleton {
  width: 100%;
  height: 100%;
}

.LayoutSection-PreviewLayout-Inner {
  width: 100%;
  height: 100%;
  pointer-events: none;

  :deep(.AppLayout-Container) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
}

.LayoutSection-PreviewSkeleton {
  display: flex;
  flex-direction: column;
}

.LayoutSection-Skeleton-Header {
  height: 28px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}

.LayoutSection-Skeleton-Body {
  flex: 1;
  display: flex;
}

.LayoutSection-Skeleton-Sidebar {
  width: 36px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
}

.LayoutSection-Skeleton-Main {
  flex: 1;
  background: var(--el-bg-color-page);
}

.LayoutSection-Info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem 1rem;
}

.LayoutSection-Name {
  font-weight: 500;
}

.LayoutSection-Status {
  font-size: 0.75rem;
  color: var(--el-color-primary);
}
</style>
