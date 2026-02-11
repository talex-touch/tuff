<script setup lang="ts">
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import type { AssetCreateType, AssetTypeOption } from './types'
import { TxAutoSizer, TxButton, TxFlipOverlay, TxStatusBadge } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'
import AssetBetaStep from './AssetBetaStep.vue'
import AssetPluginFormStep from './AssetPluginFormStep.vue'
import AssetPluginStep from './AssetPluginStep.vue'
import AssetStepCarousel from './AssetStepCarousel.vue'
import AssetTypePickerStep from './AssetTypePickerStep.vue'

interface AutoSizerActionApi {
  action?: (fn: () => void | Promise<void>) => Promise<void> | void
}

const props = defineProps<{
  source?: HTMLElement | null
  pluginLoading?: boolean
  pluginError?: string | null
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit-plugin', data: PluginFormData): void
}>()
const visible = defineModel<boolean>({ default: false })
const { t } = useI18n()

const sizerRef = ref<AutoSizerActionApi | null>(null)
const currentType = ref<AssetCreateType | null>(null)
const step = ref<'type' | 'detail' | 'plugin_form'>('type')
const stepDirection = ref<1 | -1>(1)

const typeOptions = computed<AssetTypeOption[]>(() => [
  {
    type: 'plugin',
    title: t('dashboard.sections.plugins.form.artifactTypes.plugin', 'Plugin'),
    description: t(
      'dashboard.sections.plugins.assetCreate.types.plugin',
      'Publish .tpex plugin packages with manifest parsing, icon extraction, and release channels.'
    ),
    icon: 'i-carbon-plug'
  },
  {
    type: 'extension',
    title: t('dashboard.sections.plugins.form.artifactTypes.extension', 'Extension'),
    description: t(
      'dashboard.sections.plugins.assetCreate.types.extension',
      'Cross-module extension package. Beta stage, temporarily locked.'
    ),
    icon: 'i-carbon-application-mobile',
    beta: true,
    disabled: true
  },
  {
    type: 'css_resource',
    title: t('dashboard.sections.plugins.form.artifactTypes.cssResource', 'CSS Resource'),
    description: t(
      'dashboard.sections.plugins.assetCreate.types.cssResource',
      'Reusable style tokens and CSS packs. Beta preview only for now.'
    ),
    icon: 'i-carbon-code',
    beta: true
  },
  {
    type: 'layout_resource',
    title: t('dashboard.sections.plugins.form.artifactTypes.layoutResource', 'Layout Resource'),
    description: t(
      'dashboard.sections.plugins.assetCreate.types.layoutResource',
      'Layout / preset assets, used for dynamic UI composition. Beta preview only.'
    ),
    icon: 'i-carbon-grid',
    beta: true
  }
])

const currentOption = computed(() => {
  if (!currentType.value)
    return null
  return typeOptions.value.find(item => item.type === currentType.value) ?? null
})

const currentStepKey = computed(() => {
  if (step.value === 'type') {
    return 'type-selector'
  }

  if (step.value === 'plugin_form') {
    return 'plugin-form'
  }

  return `detail-${currentType.value ?? 'unknown'}`
})

async function runWithAutoSizer(fn: () => void | Promise<void>) {
  const action = sizerRef.value?.action
  if (action) {
    await action(fn)
    return
  }
  await fn()
}

async function handleSelectType(option: AssetTypeOption) {
  if (option.disabled) {
    return
  }

  stepDirection.value = 1
  await runWithAutoSizer(async () => {
    currentType.value = option.type
    step.value = 'detail'
  })
}

async function handleBackToType() {
  if (step.value === 'plugin_form') {
    stepDirection.value = -1
    await runWithAutoSizer(async () => {
      step.value = 'detail'
    })
    return
  }

  stepDirection.value = -1
  await runWithAutoSizer(async () => {
    step.value = 'type'
    currentType.value = null
  })
}

async function handleOpenPluginForm() {
  stepDirection.value = 1
  await runWithAutoSizer(async () => {
    step.value = 'plugin_form'
  })
}

function handleSubmitPlugin(data: PluginFormData) {
  emit('submit-plugin', data)
}

function resolveBetaTitle() {
  if (!currentOption.value) {
    return t('dashboard.sections.plugins.assetCreate.betaTitle', 'Beta Asset Type')
  }
  return `${currentOption.value.title} · Beta`
}

function resolveBetaDescription() {
  if (!currentOption.value) {
    return t(
      'dashboard.sections.plugins.assetCreate.betaDescription',
      'This asset type is in beta preview. Publishing API and review flow are still being finalized.'
    )
  }

  return currentOption.value.description
}

watch(
  () => visible.value,
  (opened) => {
    if (opened) {
      return
    }

    step.value = 'type'
    currentType.value = null
    stepDirection.value = 1
  }
)
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="props.source"
      :duration="430"
      :rotate-x="6"
      :rotate-y="8"
      :speed-boost="1.08"
      transition-name="AssetCreateOverlay-Mask"
      mask-class="AssetCreateOverlay-Mask"
      card-class="AssetCreateOverlay-Card"
    >
      <template #default="overlaySlot">
        <div class="AssetCreateOverlay">
          <div class="AssetCreateOverlay-Header">
            <div class="AssetCreateOverlay-TitleWrap">
              <p class="AssetCreateOverlay-Title">
                {{ t('dashboard.sections.plugins.assetCreate.title', 'Create Asset') }}
              </p>
              <p class="AssetCreateOverlay-Subtitle">
                {{
                  t(
                    'dashboard.sections.plugins.assetCreate.subtitle',
                    'Select a type first, then continue with the dedicated publishing flow.'
                  )
                }}
              </p>
            </div>

            <div class="AssetCreateOverlay-Actions">
              <TxStatusBadge text="Beta" status="warning" size="sm" />
              <TxButton
                v-if="step !== 'type'"
                variant="secondary"
                size="small"
                @click="handleBackToType"
              >
                <span class="i-carbon-arrow-left mr-1" />
                {{ t('dashboard.sections.plugins.assetCreate.back', 'Back') }}
              </TxButton>
              <TxButton variant="flat" size="small" @click="overlaySlot?.close?.()">
                {{ t('common.close', 'Close') }}
              </TxButton>
            </div>
          </div>

          <div class="AssetCreateOverlay-Body">
            <TxAutoSizer
              ref="sizerRef"
              :width="true"
              :height="true"
              :duration-ms="260"
              easing="cubic-bezier(0.4, 0, 0.2, 1)"
              outer-class="AssetCreateOverlay-SizerOuter"
            >
              <AssetStepCarousel :active-key="currentStepKey" :direction="stepDirection">
                <AssetTypePickerStep
                  v-if="step === 'type'"
                  :options="typeOptions"
                  @select="handleSelectType"
                />

                <AssetPluginFormStep
                  v-else-if="step === 'plugin_form' && currentType === 'plugin'"
                  :visible="step === 'plugin_form' && visible"
                  :loading="props.pluginLoading"
                  :error="props.pluginError"
                  :is-admin="props.isAdmin"
                  @submit="handleSubmitPlugin"
                />

                <AssetPluginStep
                  v-else-if="currentType === 'plugin'"
                  @open-plugin-drawer="handleOpenPluginForm"
                />

                <AssetBetaStep
                  v-else
                  :title="resolveBetaTitle()"
                  :description="resolveBetaDescription()"
                  :disabled="currentOption?.disabled"
                  @back="handleBackToType"
                />
              </AssetStepCarousel>
            </TxAutoSizer>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped>
.AssetCreateOverlay {
  width: 100%;
  height: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.AssetCreateOverlay-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.AssetCreateOverlay-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.AssetCreateOverlay-Subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.AssetCreateOverlay-Actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.AssetCreateOverlay-Body {
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

:deep(.AssetCreateOverlay-SizerOuter) {
  display: flex;
  justify-content: center;
  overflow: hidden;
}
</style>

<style>
.AssetCreateOverlay-Mask {
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

.AssetCreateOverlay-Mask-enter-active,
.AssetCreateOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.AssetCreateOverlay-Mask-enter-from,
.AssetCreateOverlay-Mask-leave-to {
  opacity: 0;
}

.AssetCreateOverlay-Card {
  width: min(980px, 94vw);
  max-width: 980px;
  min-height: 320px;
  max-height: 90vh;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.2rem;
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
