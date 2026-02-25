<script setup lang="ts">
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import type { AssetCreateType, AssetTypeOption } from './types'
import { TxAutoSizer, TxFlipOverlay } from '@talex-touch/tuffex'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AssetBetaStep from './AssetBetaStep.vue'
import AssetPluginFormStep from './AssetPluginFormStep.vue'
import AssetStepCarousel from './AssetStepCarousel.vue'
import AssetTypePickerStep from './AssetTypePickerStep.vue'

interface AutoSizerActionApi {
  refresh?: () => Promise<void> | void
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
const maxBodyHeight = ref<number | null>(null)
const isStepSwitching = ref(false)
let resizeHandler: (() => void) | null = null

function startStepSwitch() {
  isStepSwitching.value = true
}

function resetStepSwitchState() {
  isStepSwitching.value = false
}

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
    beta: true,
    disabled: true
  },
  {
    type: 'layout_resource',
    title: t('dashboard.sections.plugins.form.artifactTypes.layoutResource', 'Layout Resource'),
    description: t(
      'dashboard.sections.plugins.assetCreate.types.layoutResource',
      'Layout / preset assets, used for dynamic UI composition. Beta preview only.'
    ),
    icon: 'i-carbon-grid',
    beta: true,
    disabled: true
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

const overlayCardClass = computed(() => {
  const base = 'AssetCreateOverlay-Card'
  if (step.value === 'plugin_form')
    return `${base} is-wide`
  return `${base} is-compact`
})

function handleSelectType(option: AssetTypeOption) {
  if (option.disabled) {
    return
  }

  startStepSwitch()
  stepDirection.value = 1
  currentType.value = option.type
  step.value = option.type === 'plugin' ? 'plugin_form' : 'detail'
}

function handleBackToType() {
  startStepSwitch()
  stepDirection.value = -1
  step.value = 'type'
  currentType.value = null
}

function handleSubmitPlugin(data: PluginFormData) {
  emit('submit-plugin', data)
}

async function handleChildLayoutChange() {
  if (isStepSwitching.value)
    return

  const refresh = sizerRef.value?.refresh
  if (refresh)
    await refresh()
}

function handleStepSettled() {
  if (isStepSwitching.value)
    isStepSwitching.value = false
  void handleChildLayoutChange()
}

function resolveMaxBodyHeight() {
  if (!hasWindow())
    return 620
  const viewportMax = Math.floor(window.innerHeight * 0.7)
  const bodyPadding = 24
  return Math.max(260, viewportMax - bodyPadding)
}

function updateMaxBodyHeight() {
  maxBodyHeight.value = resolveMaxBodyHeight()
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
      resetStepSwitchState()
      nextTick(() => {
        updateMaxBodyHeight()
        void handleChildLayoutChange()
      })
      return
    }

    resetStepSwitchState()
    step.value = 'type'
    currentType.value = null
    stepDirection.value = 1
  }
)

watch(maxBodyHeight, () => {
  void handleChildLayoutChange()
})

onMounted(() => {
  if (!hasWindow())
    return
  resizeHandler = () => {
    updateMaxBodyHeight()
  }
  window.addEventListener('resize', resizeHandler, { passive: true })
})

onBeforeUnmount(() => {
  resetStepSwitchState()
  if (!hasWindow() || !resizeHandler)
    return
  window.removeEventListener('resize', resizeHandler)
  resizeHandler = null
})
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
      :card-class="overlayCardClass"
      :header-title="t('dashboard.sections.plugins.assetCreate.title', 'Create Asset')"
      :header-desc="t('dashboard.sections.plugins.assetCreate.subtitle', 'Select a type first, then continue with the dedicated publishing flow.')"
    >
      <template #default>
        <div class="AssetCreateOverlay">
            <TxAutoSizer
              ref="sizerRef"
              :width="false"
              :height="true"
              :duration-ms="0"
              easing="cubic-bezier(0.4, 0, 0.2, 1)"
              outer-class="AssetCreateOverlay-SizerOuter"
            >
            <AssetStepCarousel :active-key="currentStepKey" :direction="stepDirection" @settled="handleStepSettled">
                <AssetTypePickerStep
                  v-if="step === 'type'"
                  :options="typeOptions"
                  @select="handleSelectType"
                />

                <AssetPluginFormStep
                  v-else-if="step === 'plugin_form' && currentType === 'plugin'"
                  :visible="step === 'plugin_form' && visible"
                  :max-scroll-height="maxBodyHeight"
                  :loading="props.pluginLoading"
                  :error="props.pluginError"
                  :is-admin="props.isAdmin"
                  :suspend-layout-emit="isStepSwitching"
                  @layout-change="handleChildLayoutChange"
                  @submit="handleSubmitPlugin"
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

:deep(.AssetCreateOverlay-SizerOuter) {
  display: flex;
  align-items: flex-start;
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
  min-height: 320px;
  max-height: 90vh;
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
  transition: width 260ms cubic-bezier(0.4, 0, 0.2, 1);
}

.AssetCreateOverlay-Card.is-compact {
  width: min(700px, 92vw);
  max-width: 700px;
}

.AssetCreateOverlay-Card.is-wide {
  width: min(940px, 94vw);
  max-width: 940px;
}

.AssetCreateOverlay-Card.is-expanded {
  transform: translate(-50%, -50%);
}
</style>
