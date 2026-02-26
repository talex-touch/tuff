<script setup lang="ts" name="CoreBoxEditorOverlay">
import type { CanvasAreaOption, CanvasConfig } from './canvas-types'
import { TxButton, TxStatusBadge } from '@talex-touch/tuffex'
import { appSettingOriginData } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import { appSetting } from '~/modules/channel/storage'
import CanvasGridEditor from './CanvasGridEditor.vue'

defineProps<{
  source?: HTMLElement | null
}>()

const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()

const areaOptions: CanvasAreaOption[] = [
  { area: 'logo', label: 'Logo' },
  { area: 'input', label: 'Input' },
  { area: 'tags', label: 'Tags' },
  { area: 'actions', label: 'Actions' },
  { area: 'results', label: 'Results' },
  { area: 'addon', label: 'Addon' },
  { area: 'footer', label: 'Footer' }
]

function cloneConfig<T extends CanvasConfig>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

type CoreBoxCanvasSetting = typeof appSettingOriginData.coreBoxCanvasConfig

const defaultConfig = computed<CoreBoxCanvasSetting>(() => {
  return cloneConfig(appSettingOriginData.coreBoxCanvasConfig)
})

const editingConfig = ref<CoreBoxCanvasSetting>(cloneConfig(defaultConfig.value))

watch(
  () => visible.value,
  (opened) => {
    if (!opened) return

    const current = (appSetting.coreBoxCanvasConfig || defaultConfig.value) as CoreBoxCanvasSetting
    editingConfig.value = cloneConfig(current)
  }
)

function handleSave(close: () => void): void {
  appSetting.coreBoxCanvasConfig = cloneConfig(
    editingConfig.value
  ) as typeof appSetting.coreBoxCanvasConfig
  close()
}

function handleCancel(close: () => void): void {
  const current = (appSetting.coreBoxCanvasConfig || defaultConfig.value) as CoreBoxCanvasSetting
  editingConfig.value = cloneConfig(current)
  close()
}
</script>

<template>
  <FlipDialog v-model="visible" :reference="source" size="xl">
    <template #default="{ close }">
      <div class="CoreBoxEditorOverlay">
        <div class="CoreBoxEditorOverlay-Header">
          <div class="CoreBoxEditorOverlay-TitleBlock">
            <div class="CoreBoxEditorOverlay-Title">
              {{ t('layoutSection.customizeCoreBox', 'Customize CoreBox') }}
            </div>
            <div class="CoreBoxEditorOverlay-Subtitle">
              {{ t('layoutSection.customizeCoreBoxDesc', 'Adjust search box logo, input style') }}
            </div>
          </div>
          <div class="CoreBoxEditorOverlay-Actions">
            <TxStatusBadge text="Beta" status="warning" size="sm" />
            <TxButton variant="flat" size="sm" @click="handleCancel(close)">
              {{ t('common.cancel', 'Cancel') }}
            </TxButton>
            <TxButton variant="flat" size="sm" @click="handleSave(close)">
              {{ t('common.confirm', 'Save') }}
            </TxButton>
          </div>
        </div>

        <div class="CoreBoxEditorOverlay-Body">
          <CanvasGridEditor
            v-model="editingConfig"
            :default-config="defaultConfig"
            :areas="areaOptions"
            :title="t('layoutSection.customizeCoreBox', 'Customize CoreBox')"
            :description="
              t('layoutSection.customizeCoreBoxDesc', 'Adjust search box logo, input style')
            "
          />
        </div>
      </div>
    </template>
  </FlipDialog>
</template>

<style scoped lang="scss">
.CoreBoxEditorOverlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.CoreBoxEditorOverlay-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.CoreBoxEditorOverlay-Title {
  font-size: 20px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.CoreBoxEditorOverlay-Subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.CoreBoxEditorOverlay-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.CoreBoxEditorOverlay-Body {
  flex: 1;
  min-height: 0;
  padding: 16px;
}
</style>
