<script setup lang="ts">
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import type { AssetCreateType, AssetTypeOption } from './types'
import { TxAutoSizer } from '@talex-touch/tuffex'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AssetBetaStep from './AssetBetaStep.vue'
import AssetPluginFormStep from './AssetPluginFormStep.vue'
import AssetStepCarousel from './AssetStepCarousel.vue'
import AssetTypePickerStep from './AssetTypePickerStep.vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'

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
const isOverlayOpened = ref(false)
const hasPendingLayoutRefresh = ref(false)
let resizeHandler: (() => void) | null = null
let refreshRafId: number | null = null

function startStepSwitch() {
  isStepSwitching.value = true
}

function resetStepSwitchState() {
  isStepSwitching.value = false
}

function clearRefreshRaf() {
  if (!hasWindow() || refreshRafId == null)
    return
  cancelAnimationFrame(refreshRafId)
  refreshRafId = null
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

async function flushLayoutRefresh() {
  if (!hasPendingLayoutRefresh.value)
    return

  if (!isOverlayOpened.value || isStepSwitching.value)
    return

  const refresh = sizerRef.value?.refresh
  if (!refresh)
    return

  hasPendingLayoutRefresh.value = false
  await refresh()

  if (hasPendingLayoutRefresh.value)
    await flushLayoutRefresh()
}

function requestLayoutRefresh(doubleRaf = false) {
  hasPendingLayoutRefresh.value = true
  const run = () => {
    void flushLayoutRefresh()
  }

  if (!hasWindow()) {
    nextTick(() => run())
    return
  }

  clearRefreshRaf()
  nextTick(() => {
    if (!hasWindow()) {
      run()
      return
    }
    refreshRafId = requestAnimationFrame(() => {
      if (doubleRaf) {
        refreshRafId = requestAnimationFrame(() => {
          refreshRafId = null
          run()
        })
        return
      }
      refreshRafId = null
      run()
    })
  })
}

function handleStepSettled() {
  if (isStepSwitching.value)
    isStepSwitching.value = false
  requestLayoutRefresh()
}

function handleOverlayOpened() {
  isOverlayOpened.value = true
  nextTick(() => {
    updateMaxBodyHeight()
    requestLayoutRefresh(true)
  })
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
      isOverlayOpened.value = false
      resetStepSwitchState()
      nextTick(() => {
        updateMaxBodyHeight()
        requestLayoutRefresh()
      })
      return
    }

    clearRefreshRaf()
    isOverlayOpened.value = false
    hasPendingLayoutRefresh.value = false
    resetStepSwitchState()
    step.value = 'type'
    currentType.value = null
    stepDirection.value = 1
  }
)

watch(maxBodyHeight, () => {
  requestLayoutRefresh()
})

watch([isOverlayOpened, isStepSwitching, () => Boolean(sizerRef.value?.refresh)], ([opened, switching, ready]) => {
  if (!opened || switching || !ready || !hasPendingLayoutRefresh.value)
    return
  void flushLayoutRefresh()
})

watch(
  () => sizerRef.value?.refresh,
  (refresh) => {
    if (!refresh || !hasPendingLayoutRefresh.value)
      return
    void flushLayoutRefresh()
  }
)

onMounted(() => {
  if (!hasWindow())
    return
  resizeHandler = () => {
    updateMaxBodyHeight()
  }
  window.addEventListener('resize', resizeHandler, { passive: true })
})

onBeforeUnmount(() => {
  clearRefreshRaf()
  isOverlayOpened.value = false
  hasPendingLayoutRefresh.value = false
  resetStepSwitchState()
  if (!hasWindow() || !resizeHandler)
    return
  window.removeEventListener('resize', resizeHandler)
  resizeHandler = null
})
</script>

<template>
  <FlipDialog
      v-model="visible"
      :reference="props.source"
      size="lg"
      :scrollable="false"
      :header-title="t('dashboard.sections.plugins.assetCreate.title', 'Create Asset')"
      :header-desc="t('dashboard.sections.plugins.assetCreate.subtitle', 'Select a type first, then continue with the dedicated publishing flow.')"
      @opened="handleOverlayOpened"
    >
      <template #default>
        <div class="AssetCreateOverlay" :class="step === 'plugin_form' ? 'is-wide' : 'is-compact'">
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
                  @layout-change="requestLayoutRefresh"
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
    </FlipDialog>
</template>

<style scoped>
.AssetCreateOverlay {
  width: min(700px, 92vw);
  max-width: 700px;
  height: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  transition: width 260ms cubic-bezier(0.4, 0, 0.2, 1);
}

.AssetCreateOverlay.is-wide {
  width: min(940px, 94vw);
  max-width: 940px;
}

:deep(.AssetCreateOverlay-SizerOuter) {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}
</style>
