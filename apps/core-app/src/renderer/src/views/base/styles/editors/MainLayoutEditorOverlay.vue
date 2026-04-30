<script setup lang="ts" name="MainLayoutEditorOverlay">
import type { CanvasAreaOption, CanvasConfig } from './canvas-types'
import { TxButton, TxStatusBadge } from '@talex-touch/tuffex'
import { appSettingOriginData } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import { appSetting } from '~/modules/storage/app-storage'
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
  <FlipDialog v-model="visible" :reference="source" size="xl">
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
  </FlipDialog>
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
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.LayoutEditorOverlay-Title {
  font-size: 20px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.LayoutEditorOverlay-Subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
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
