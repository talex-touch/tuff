<script lang="ts" name="LayoutSection" setup>
import type { Component } from 'vue'
import { TxCard } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { markRaw, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LayoutPreviewFrame from '~/components/layout/LayoutPreviewFrame.vue'
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
      <TxCard
        v-for="(layout, key) in availableLayouts"
        :key="key"
        variant="solid"
        background="mask"
        shadow="none"
        :radius="18"
        :padding="0"
        clickable
        class="LayoutSection-Item"
        :class="{ active: currentLayoutName === key }"
        role="button"
        tabindex="0"
        :aria-pressed="currentLayoutName === key"
        @click="handleLayoutSelect(key)"
        @keydown.enter.prevent="handleLayoutSelect(key)"
        @keydown.space.prevent="handleLayoutSelect(key)"
      >
        <div class="LayoutSection-Preview">
          <div v-if="layoutPreviewStates[key]?.component" class="LayoutSection-PreviewLayout">
            <LayoutPreviewFrame
              :layout="layoutPreviewStates[key].component"
              class="LayoutSection-PreviewLayout-Inner"
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
          <div class="LayoutSection-NameRow">
            <span class="LayoutSection-NameGroup">
              <span v-if="currentLayoutName === key" class="LayoutSection-CurrentDot" />
              <span class="LayoutSection-Name">
                {{ getLayoutLabel(key, layout.displayName) }}
              </span>
            </span>
          </div>
        </div>
      </TxCard>
    </div>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.LayoutSection-List {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
  padding: 0.5rem;
}

.LayoutSection-Item {
  display: flex;
  flex-direction: column;
  position: relative;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.LayoutSection-Item:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.LayoutSection-Item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.LayoutSection-Item.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 6px 18px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.18);
}

.LayoutSection-Item.active:hover {
  box-shadow: 0 8px 22px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.2);
}

.LayoutSection-Preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--el-fill-color-light);
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

.LayoutSection-PreviewLayout {
  padding: 4px;
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
}

.LayoutSection-PreviewLayout-Inner {
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: scale(0.96);
  transform-origin: center center;
  border-radius: 10px;
  overflow: hidden;

  :deep(.AppLayout-Container) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    border-radius: 10px;
    overflow: hidden;
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
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 4px;
  padding: 0.6rem 0.75rem 0.45rem;
  border-radius: 10px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}

.LayoutSection-NameRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.6rem;
}

.LayoutSection-NameGroup {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.18));
}

.LayoutSection-Name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--el-text-color-primary);
  text-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);
  padding: 0.2rem 0.2rem;
}

.LayoutSection-Item.active .LayoutSection-Name {
  color: var(--el-color-primary);
}

.LayoutSection-CurrentDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-8);
}
</style>
