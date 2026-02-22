<script lang="ts" name="LayoutAtomEditor" setup>
import type { LayoutAtomConfig } from '@talex-touch/utils'
import {
  TuffInput,
  TuffSelect,
  TuffSelectItem,
  TxButton,
  TxCollapse,
  TxCollapseItem,
  TxSlider
} from '@talex-touch/tuffex'
import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getLayoutAtomPreset, isLayoutPresetKey, usePresetExport } from '~/modules/layout'

const { t } = useI18n()
const { exportPreset, importPreset, isExporting, isImporting } = usePresetExport()

const atomConfig = computed((): LayoutAtomConfig => {
  const saved = appSettingsData?.layoutAtomConfig
  if (saved?.preset === 'custom') return saved
  const layout = appSettingsData?.layout ?? 'simple'
  if (layout === 'custom') return saved ?? getLayoutAtomPreset('simple')
  return isLayoutPresetKey(layout) ? getLayoutAtomPreset(layout) : getLayoutAtomPreset('simple')
})

function applyCustom(config: LayoutAtomConfig) {
  if (!appSettingsData) return
  appSettingsData.layoutAtomConfig = { ...config, preset: 'custom' }
  appSettingsData.layout = 'custom'
}

type HeaderBorder = LayoutAtomConfig['header']['border']
type AsidePosition = LayoutAtomConfig['aside']['position']
type ViewShadow = LayoutAtomConfig['view']['shadow']
type NavStyle = LayoutAtomConfig['nav']['style']

const headerBorderOptions: Array<{ value: HeaderBorder; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'none', label: 'None' },
  { value: 'gradient', label: 'Gradient' }
]

const asidePositionOptions: Array<{ value: AsidePosition; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'hidden', label: 'Hidden' }
]

const navStyleOptions: Array<{ value: NavStyle; label: string }> = [
  { value: 'icon', label: 'Icon' },
  { value: 'icon-text', label: 'Icon + Text' },
  { value: 'text', label: 'Text' }
]

const viewShadowOptions: Array<{ value: ViewShadow; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' }
]
</script>

<template>
  <TuffGroupBlock
    :name="t('layoutSection.atomEditorTitle', 'Customize layout')"
    :description="
      t('layoutSection.atomEditorDesc', 'Adjust layout atoms. Changes save as Custom layout.')
    "
    class="LayoutAtomEditor"
  >
    <div class="LayoutAtomEditor-Actions">
      <TxButton
        variant="bare"
        class="LayoutAtomEditor-ActionBtn"
        :loading="isImporting"
        @click="importPreset"
      >
        <span class="i-ri-download-2-line mr-1" />
        {{ t('preset.import', 'Import') }}
      </TxButton>
      <TxButton
        variant="bare"
        class="LayoutAtomEditor-ActionBtn"
        :loading="isExporting"
        @click="exportPreset({ includeLayout: true, includeCoreBox: true })"
      >
        <span class="i-ri-upload-2-line mr-1" />
        {{ t('preset.export', 'Export') }}
      </TxButton>
      <TxButton
        variant="bare"
        class="LayoutAtomEditor-ActionBtn LayoutAtomEditor-ActionBtn--cloud"
        disabled
        :title="t('preset.cloudPublishDesc', 'Share your preset with the community (coming soon)')"
      >
        <span class="i-ri-cloud-line mr-1" />
        {{ t('preset.cloudPublish', 'Publish to Cloud') }}
      </TxButton>
    </div>
    <TxCollapse>
      <TxCollapseItem :title="t('layoutSection.atomHeader', 'Header')" name="header">
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label">{{
            t('layoutSection.atomHeaderBorder', 'Border')
          }}</span>
          <TuffSelect
            :model-value="atomConfig.header.border"
            class="w-full"
            @update:model-value="
              (v) =>
                applyCustom({
                  ...atomConfig,
                  header: { ...atomConfig.header, border: v as HeaderBorder }
                })
            "
          >
            <TuffSelectItem
              v-for="opt in headerBorderOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label"
            >{{ t('layoutSection.atomHeaderHeight', 'Height') }} (px)</span
          >
          <TxSlider
            :model-value="atomConfig.header.height"
            :min="20"
            :max="48"
            :step="2"
            @update:model-value="
              (v) =>
                applyCustom({
                  ...atomConfig,
                  header: { ...atomConfig.header, height: v as number }
                })
            "
          />
        </div>
      </TxCollapseItem>
      <TxCollapseItem :title="t('layoutSection.atomAside', 'Sidebar')" name="aside">
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label">{{
            t('layoutSection.atomAsidePosition', 'Position')
          }}</span>
          <TuffSelect
            :model-value="atomConfig.aside.position"
            class="w-full"
            @update:model-value="
              (v) =>
                applyCustom({
                  ...atomConfig,
                  aside: { ...atomConfig.aside, position: v as AsidePosition }
                })
            "
          >
            <TuffSelectItem
              v-for="opt in asidePositionOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>
        <div v-if="atomConfig.aside.position !== 'hidden'" class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label"
            >{{ t('layoutSection.atomAsideWidth', 'Width') }} (px)</span
          >
          <TxSlider
            :model-value="atomConfig.aside.width"
            :min="36"
            :max="120"
            :step="4"
            @update:model-value="
              (v) =>
                applyCustom({ ...atomConfig, aside: { ...atomConfig.aside, width: v as number } })
            "
          />
        </div>
      </TxCollapseItem>
      <TxCollapseItem :title="t('layoutSection.atomView', 'Content area')" name="view">
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label"
            >{{ t('layoutSection.atomViewRadius', 'Corner radius') }} (px)</span
          >
          <TxSlider
            :model-value="atomConfig.view.radius[0]"
            :min="0"
            :max="24"
            :step="2"
            @update:model-value="
              (v) => {
                const r = v as number
                applyCustom({
                  ...atomConfig,
                  view: { ...atomConfig.view, radius: [r, r, r, r] }
                })
              }
            "
          />
        </div>
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label">{{
            t('layoutSection.atomViewShadow', 'Shadow')
          }}</span>
          <TuffSelect
            :model-value="atomConfig.view.shadow"
            class="w-full"
            @update:model-value="
              (v) =>
                applyCustom({
                  ...atomConfig,
                  view: { ...atomConfig.view, shadow: v as ViewShadow }
                })
            "
          >
            <TuffSelectItem
              v-for="opt in viewShadowOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>
      </TxCollapseItem>
      <TxCollapseItem :title="t('layoutSection.atomNav', 'Navigation')" name="nav">
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label">{{ t('layoutSection.atomNavStyle', 'Style') }}</span>
          <TuffSelect
            :model-value="atomConfig.nav.style"
            class="w-full"
            @update:model-value="
              (v) =>
                applyCustom({
                  ...atomConfig,
                  nav: { ...atomConfig.nav, style: v as NavStyle }
                })
            "
          >
            <TuffSelectItem
              v-for="opt in navStyleOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>
      </TxCollapseItem>
      <TxCollapseItem :title="t('layoutSection.atomCustomCss', 'Custom CSS')" name="css">
        <div class="LayoutAtomEditor-Field">
          <span class="LayoutAtomEditor-Label">{{
            t(
              'layoutSection.atomCustomCssTip',
              'Applied to app layout. Unsafe directives are blocked.'
            )
          }}</span>
          <TuffInput
            :model-value="atomConfig.customCSS || ''"
            type="textarea"
            :rows="6"
            placeholder=".AppLayout-Container { /* your css */ }"
            @update:model-value="(v) => applyCustom({ ...atomConfig, customCSS: String(v) })"
          />
        </div>
      </TxCollapseItem>
    </TxCollapse>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.LayoutAtomEditor-Actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.LayoutAtomEditor-ActionBtn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color);
    color: var(--tx-color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--cloud {
    margin-left: auto;
    background: linear-gradient(
      135deg,
      var(--tx-color-primary-light-8),
      var(--tx-color-success-light-8)
    );
  }
}

.LayoutAtomEditor-Field {
  margin-bottom: 12px;
}

.LayoutAtomEditor :deep(.tx-input__textarea) {
  resize: vertical;
}

.LayoutAtomEditor-Label {
  display: block;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin-bottom: 4px;
}
</style>
