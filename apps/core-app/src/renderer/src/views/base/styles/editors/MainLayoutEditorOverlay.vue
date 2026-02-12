<script setup lang="ts" name="MainLayoutEditorOverlay">
import type { CanvasAreaOption, CanvasConfig } from './canvas-types'
import { TxButton, TxFlipOverlay, TxStatusBadge } from '@talex-touch/tuffex'
import { appSettingOriginData } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { appSetting } from '~/modules/channel/storage'
import CanvasGridEditor from './CanvasGridEditor.vue'

defineProps<{
  source?: HTMLElement | null
}>()

const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()

const areaOptions: CanvasAreaOption[] = [
  { area: 'header', label: 'Header' },
  { area: 'aside', label: 'Sidebar' },
  { area: 'view', label: 'View' }
]

function cloneConfig<T extends CanvasConfig>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

type MainCanvasSetting = typeof appSettingOriginData.layoutCanvasConfig

const defaultConfig = computed<MainCanvasSetting>(() => {
  return cloneConfig(appSettingOriginData.layoutCanvasConfig)
})

const editingConfig = ref<MainCanvasSetting>(cloneConfig(defaultConfig.value))

watch(
  () => visible.value,
  (opened) => {
    if (!opened) return

    const current = (appSetting.layoutCanvasConfig || defaultConfig.value) as MainCanvasSetting
    editingConfig.value = cloneConfig(current)
  }
)

function handleSave(close: () => void): void {
  appSetting.layoutCanvasConfig = cloneConfig(
    editingConfig.value
  ) as typeof appSetting.layoutCanvasConfig
  appSetting.layout = 'custom'
  close()
}

function handleCancel(close: () => void): void {
  const current = (appSetting.layoutCanvasConfig || defaultConfig.value) as MainCanvasSetting
  editingConfig.value = cloneConfig(current)
  close()
}
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="source"
      :duration="420"
      :rotate-x="6"
      :rotate-y="8"
      :speed-boost="1.1"
      transition-name="LayoutEditorOverlay-Mask"
      mask-class="LayoutEditorOverlay-Mask"
      card-class="LayoutEditorOverlay-Card"
    >
      <template #default="{ close }">
        <div class="LayoutEditorOverlay">
          <div class="LayoutEditorOverlay-Header">
            <div class="LayoutEditorOverlay-TitleBlock">
              <div class="LayoutEditorOverlay-Title">
                {{ t('layoutSection.customizeMain', 'Customize Main Layout') }}
              </div>
              <div class="LayoutEditorOverlay-Subtitle">
                {{ t('layoutSection.customizeMainDesc', 'Adjust header, sidebar, view styles') }}
              </div>
            </div>
            <div class="LayoutEditorOverlay-Actions">
              <TxStatusBadge text="Beta" status="warning" size="sm" />
              <TxButton variant="flat" size="sm" @click="handleCancel(close)">
                {{ t('common.cancel', 'Cancel') }}
              </TxButton>
              <TxButton variant="flat" size="sm" @click="handleSave(close)">
                {{ t('common.confirm', 'Save') }}
              </TxButton>
            </div>
          </div>

          <div class="LayoutEditorOverlay-Body">
            <CanvasGridEditor
              v-model="editingConfig"
              :default-config="defaultConfig"
              :areas="areaOptions"
              :title="t('layoutSection.customizeMain', 'Customize Main Layout')"
              :description="
                t('layoutSection.customizeMainDesc', 'Adjust header, sidebar, view styles')
              "
            />
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped lang="scss">
.LayoutEditorOverlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.LayoutEditorOverlay-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.LayoutEditorOverlay-Title {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.LayoutEditorOverlay-Subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.LayoutEditorOverlay-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.LayoutEditorOverlay-Body {
  flex: 1;
  min-height: 0;
  padding: 16px;
}
</style>

<style lang="scss">
.LayoutEditorOverlay-Mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1850;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.LayoutEditorOverlay-Mask-enter-active,
.LayoutEditorOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.LayoutEditorOverlay-Mask-enter-from,
.LayoutEditorOverlay-Mask-leave-to {
  opacity: 0;
}

.LayoutEditorOverlay-Card {
  width: min(1160px, 94vw);
  height: min(820px, 90vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
