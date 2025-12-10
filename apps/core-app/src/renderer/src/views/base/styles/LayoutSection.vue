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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.25rem;
  padding: 0.5rem;
}

.LayoutSection-Item {
  display: flex;
  flex-direction: column;
  border: 1.5px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background: var(--el-bg-color);
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.LayoutSection-Item:hover {
  border-color: var(--el-border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.LayoutSection-Item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.LayoutSection-Item.active {
  border-color: var(--el-color-primary);
  background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, var(--el-bg-color) 100%);
  box-shadow: 0 4px 20px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.15);
}

.LayoutSection-Item.active:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.2);
}

.LayoutSection-Preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  position: relative;
}

.LayoutSection-Item.active .LayoutSection-Preview {
  border-bottom-color: var(--el-color-primary-light-7);
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
  transform: scale(0.95);
  transform-origin: center center;

  :deep(.AppLayout-Container) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
}

.LayoutSection-PreviewSkeleton {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.LayoutSection-Skeleton-Header {
  height: 20px;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.LayoutSection-Skeleton-Body {
  flex: 1;
  display: flex;
  gap: 4px;
}

.LayoutSection-Skeleton-Sidebar {
  width: 28px;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.LayoutSection-Skeleton-Main {
  flex: 1;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.LayoutSection-Info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  gap: 0.5rem;
}

.LayoutSection-Name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--el-text-color-primary);
}

.LayoutSection-Item.active .LayoutSection-Name {
  color: var(--el-color-primary);
}

.LayoutSection-Status {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}
</style>
