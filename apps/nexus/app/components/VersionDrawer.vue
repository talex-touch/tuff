<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import type { TpexExtractedManifest, TpexPackagePreviewResult } from '@talex-touch/utils/plugin/providers'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from '~/components/ui/Button.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'

interface Props {
  isOpen: boolean
  pluginId: string
  pluginName: string
  loading?: boolean
  error?: string | null
  source?: HTMLElement | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: VersionFormData): void
}>()

export interface VersionFormData {
  version: string
  channel: 'RELEASE' | 'BETA' | 'SNAPSHOT'
  changelog: string
  packageFile: File
}

const { t } = useI18n()

const formData = ref<VersionFormData>({
  version: '',
  channel: 'SNAPSHOT',
  changelog: '',
  packageFile: null as any,
})

const packageFiles = ref<FileUploaderFile[]>([])
const packageLoading = ref(false)
const packageError = ref<string | null>(null)
const manifestPreview = ref<TpexExtractedManifest | null>(null)

type Step = 'form' | 'warning' | 'license'
const step = ref<Step>('form')
const licenseAgreed = ref(false)

const formContentRef = ref<HTMLElement | null>(null)
const scrollAreaHeight = ref(420)
const maxScrollableHeight = ref(620)
let formResizeObserver: ResizeObserver | null = null
let viewportResizeHandler: (() => void) | null = null

watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    formData.value = {
      version: '',
      channel: 'SNAPSHOT',
      changelog: '',
      packageFile: null as any,
    }
    packageFiles.value = []
    step.value = 'form'
    packageError.value = null
    manifestPreview.value = null
    licenseAgreed.value = false
    maxScrollableHeight.value = resolveMaxScrollableHeight()
    await nextTick()
    setupFormObserver()
    scheduleLayoutMeasure()
    return
  }

  cleanupFormObserver()
})

async function handlePackageChange(files: FileUploaderFile[]) {
  packageFiles.value = files
  const file = files[0]?.file
  if (!file) {
    formData.value.packageFile = null as any
    return
  }

  formData.value.packageFile = file
  packageError.value = null
  manifestPreview.value = null

  packageLoading.value = true
  try {
    const previewFormData = new FormData()
    previewFormData.append('package', file)

    const result = await $fetch<TpexPackagePreviewResult>('/api/dashboard/plugins/package/preview', {
      method: 'POST',
      body: previewFormData,
    })

    if (result.manifest) {
      manifestPreview.value = result.manifest as TpexExtractedManifest

      if (result.manifest.version && !formData.value.version) {
        formData.value.version = String(result.manifest.version)
      }

      if (result.manifest.channel) {
        const channel = String(result.manifest.channel).toUpperCase()
        if (['RELEASE', 'BETA', 'SNAPSHOT'].includes(channel)) {
          formData.value.channel = channel as 'RELEASE' | 'BETA' | 'SNAPSHOT'
        }
      }

      if (result.manifest.changelog && !formData.value.changelog) {
        formData.value.changelog = String(result.manifest.changelog)
      }
    }
  }
  catch (err: unknown) {
    packageError.value = err instanceof Error ? err.message : 'Failed to preview package'
  }
  finally {
    packageLoading.value = false
  }
}

function onFormSubmit() {
  if (!formData.value.version || !formData.value.packageFile || !formData.value.changelog)
    return
  step.value = 'warning'
}

function onWarningConfirm() {
  step.value = 'license'
}

function onLicenseSubmit() {
  if (licenseAgreed.value) {
    emit('submit', formData.value)
  }
}

const channelDescription = computed(() =>
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.description`),
)

const channelVisibility = computed(() =>
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.visibility`),
)

const steps = ['form', 'warning', 'license'] as const
const currentStepIndex = computed(() => steps.indexOf(step.value))

const visibleModel = computed({
  get: () => props.isOpen,
  set: (nextVisible) => {
    if (!nextVisible)
      emit('close')
  },
})

const scrollWrapStyle = computed(() => ({
  '--version-form-scroll-height': `${scrollAreaHeight.value}px`,
  '--version-form-scroll-max-height': `${maxScrollableHeight.value}px`,
}))

function resolveMaxScrollableHeight() {
  if (!hasWindow())
    return 620

  const viewportLimitedHeight = Math.floor(window.innerHeight * 0.68)
  return Math.max(240, Math.min(viewportLimitedHeight, 680))
}

function scheduleLayoutMeasure() {
  if (!props.isOpen)
    return

  nextTick(() => {
    const contentEl = formContentRef.value
    if (!contentEl)
      return

    const measuredHeight = Math.ceil(contentEl.scrollHeight)
    if (measuredHeight <= 0)
      return

    const minHeight = 220
    scrollAreaHeight.value = Math.max(minHeight, Math.min(measuredHeight, maxScrollableHeight.value))
  })
}

function cleanupFormObserver() {
  if (!formResizeObserver)
    return

  formResizeObserver.disconnect()
  formResizeObserver = null
}

function setupFormObserver() {
  cleanupFormObserver()
  if (typeof ResizeObserver === 'undefined')
    return
  if (!formContentRef.value)
    return

  formResizeObserver = new ResizeObserver(() => {
    scheduleLayoutMeasure()
  })
  formResizeObserver.observe(formContentRef.value)
}

function handleOverlayClose(close?: () => void) {
  if (close)
    close()
  else
    emit('close')
}

watch(step, () => {
  scheduleLayoutMeasure()
})

watch([manifestPreview, packageLoading, packageError], () => {
  scheduleLayoutMeasure()
})

onMounted(() => {
  if (!hasWindow())
    return

  viewportResizeHandler = () => {
    maxScrollableHeight.value = resolveMaxScrollableHeight()
    scheduleLayoutMeasure()
  }
  window.addEventListener('resize', viewportResizeHandler, { passive: true })
})

onBeforeUnmount(() => {
  cleanupFormObserver()
  if (!hasWindow())
    return
  if (!viewportResizeHandler)
    return
  window.removeEventListener('resize', viewportResizeHandler)
  viewportResizeHandler = null
})
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visibleModel"
      :source="props.source"
      :duration="360"
      :rotate-x="4"
      :rotate-y="6"
      :speed-boost="1.05"
      transition-name="VersionOverlay-Mask"
      mask-class="VersionOverlay-Mask"
      card-class="VersionOverlay-Card"
    >
      <template #default="overlaySlot">
        <TxAutoSizer
          :width="true"
          :height="true"
          :duration-ms="240"
          easing="cubic-bezier(0.4, 0, 0.2, 1)"
          outer-class="VersionOverlay-SizerOuter"
        >
          <div class="VersionOverlay-Panel">
            <div class="VersionOverlay-Header">
              <div>
                <h2 class="text-xl font-semibold text-black dark:text-white">
                  {{ t('dashboard.sections.plugins.publishVersion') }}
                </h2>
                <p class="mt-1 text-xs text-black/40 dark:text-white/40">
                  {{ pluginName }}
                </p>
              </div>
              <FlatButton @click="handleOverlayClose(overlaySlot?.close)">
                <span class="i-carbon-close text-lg" />
              </FlatButton>
            </div>

            <div class="VersionOverlay-Stepper">
              <template v-for="(stepLabel, i) in ['Form', 'Review', 'License']" :key="stepLabel">
                <div class="flex items-center gap-2">
                  <div
                    class="flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200"
                    :class="i <= currentStepIndex
                      ? 'bg-primary text-white'
                      : 'bg-black/[0.05] text-black/30 dark:bg-white/[0.08] dark:text-white/30'"
                  >
                    {{ i + 1 }}
                  </div>
                  <span
                    class="text-xs font-medium transition-colors duration-200"
                    :class="i <= currentStepIndex
                      ? 'text-black dark:text-white'
                      : 'text-black/30 dark:text-white/30'"
                  >
                    {{ stepLabel }}
                  </span>
                </div>
                <div
                  v-if="i < 2"
                  class="h-px w-8 transition-colors duration-200"
                  :class="i < currentStepIndex ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.08]'"
                />
              </template>
            </div>

            <div class="VersionOverlay-ScrollWrap" :style="scrollWrapStyle">
              <TxScroll native no-padding class="VersionOverlay-Scroll">
                <div ref="formContentRef" class="VersionOverlay-Form">
                  <form v-if="step === 'form'" class="space-y-6" @submit.prevent="onFormSubmit">
                    <div class="flex flex-col gap-2">
                      <label class="apple-section-title">
                        {{ t('dashboard.sections.plugins.versionForm.version') }}
                      </label>
                      <Input
                        v-model="formData.version"
                        placeholder="1.0.0"
                        pattern="^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"
                      />
                    </div>

                    <div class="flex flex-col gap-2">
                      <label class="apple-section-title">
                        {{ t('dashboard.sections.plugins.versionForm.channel') }}
                      </label>
                      <TuffSelect v-model="formData.channel" class="w-full">
                        <TuffSelectItem value="RELEASE" label="RELEASE" />
                        <TuffSelectItem value="BETA" label="BETA" />
                        <TuffSelectItem value="SNAPSHOT" label="SNAPSHOT" />
                      </TuffSelect>
                      <div class="mt-2 rounded-xl bg-black/[0.03] p-4 text-xs dark:bg-white/[0.04]">
                        <p class="mb-1 text-black/70 dark:text-white/70">
                          {{ channelDescription }}
                        </p>
                        <p class="font-medium text-black dark:text-white">
                          {{ channelVisibility }}
                        </p>
                      </div>
                    </div>

                    <div class="flex flex-col gap-2">
                      <label class="apple-section-title">
                        {{ t('dashboard.sections.plugins.versionForm.package') }}
                      </label>
                      <TxFileUploader
                        v-model="packageFiles"
                        :multiple="false"
                        :max="1"
                        accept=".tpex"
                        :disabled="packageLoading"
                        :button-text="t('dashboard.sections.plugins.versionForm.package')"
                        :drop-text="t('dashboard.sections.plugins.packageAwaiting')"
                        :hint-text="t('dashboard.sections.plugins.form.packageHelp')"
                        @change="handlePackageChange"
                      />
                      <p v-if="packageLoading" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                        <span class="i-carbon-circle-dash animate-spin" />
                        {{ t('dashboard.sections.plugins.loading', 'Loading...') }}
                      </p>
                      <p v-if="packageError" class="text-xs text-red-500">
                        {{ packageError }}
                      </p>

                      <div v-if="manifestPreview" class="mt-2 rounded-lg bg-black/5 p-3 dark:bg-white/5">
                        <p class="mb-2 apple-section-title">
                          {{ t('dashboard.sections.plugins.manifestPreview') }}
                        </p>
                        <div class="space-y-1 text-xs text-black/70 dark:text-white/70">
                          <p v-if="manifestPreview.name">
                            <span class="font-medium">Name:</span> {{ manifestPreview.name }}
                          </p>
                          <p v-if="manifestPreview.version">
                            <span class="font-medium">Version:</span> {{ manifestPreview.version }}
                          </p>
                          <p v-if="manifestPreview.channel">
                            <span class="font-medium">Channel:</span> {{ manifestPreview.channel }}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-col gap-2">
                      <label class="apple-section-title">
                        {{ t('dashboard.sections.plugins.versionForm.changelog') }}
                      </label>
                      <Input v-model="formData.changelog" type="textarea" :rows="6" />
                    </div>

                    <div class="pt-2">
                      <Button block :disabled="loading" native-type="submit">
                        <span v-if="loading" class="i-carbon-circle-dash mr-2 animate-spin" />
                        {{ t('dashboard.sections.plugins.versionForm.submit') }}
                      </Button>
                      <p v-if="error" class="mt-2 text-center text-xs text-red-500">
                        {{ error }}
                      </p>
                    </div>
                  </form>

                  <div v-else-if="step === 'warning'" class="VersionOverlay-Warning">
                    <div class="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400">
                      <span class="i-carbon-warning-alt text-4xl" />
                    </div>
                    <h3 class="mb-3 text-lg font-semibold text-black dark:text-white">
                      {{ t('dashboard.sections.plugins.warnings.immutable.title') }}
                    </h3>
                    <p class="mx-auto mb-10 max-w-sm text-sm text-black/50 dark:text-white/50">
                      {{ t('dashboard.sections.plugins.warnings.immutable.message') }}
                    </p>
                    <div class="flex flex-col gap-3">
                      <Button block class="rounded-xl" @click="onWarningConfirm">
                        {{ t('dashboard.sections.plugins.warnings.immutable.understand') }}
                      </Button>
                      <FlatButton @click="step = 'form'">
                        {{ t('dashboard.sections.plugins.warnings.immutable.cancel') }}
                      </FlatButton>
                    </div>
                  </div>

                  <div v-else-if="step === 'license'" class="VersionOverlay-License">
                    <h3 class="mb-5 text-lg font-semibold text-black dark:text-white">
                      {{ t('dashboard.sections.plugins.license.title') }}
                    </h3>
                    <div class="VersionOverlay-LicenseText">
                      <div class="prose prose-sm dark:prose-invert">
                        <ContentRendererMarkdown :value="t('dashboard.sections.plugins.license.agreement')" />
                      </div>
                    </div>
                    <div class="mt-6 flex flex-col gap-4">
                      <label class="flex items-center gap-3">
                        <Switch v-model="licenseAgreed" />
                        <span class="text-sm text-black/70 dark:text-white/70">
                          {{ t('dashboard.sections.plugins.license.confirm') }}
                        </span>
                      </label>
                      <div class="flex gap-3">
                        <FlatButton class="flex-1" @click="step = 'form'">
                          {{ t('dashboard.sections.plugins.license.cancel') }}
                        </FlatButton>
                        <Button
                          class="flex-1 rounded-xl"
                          :disabled="!licenseAgreed || loading"
                          @click="onLicenseSubmit"
                        >
                          <span v-if="loading" class="i-carbon-circle-dash mr-2 animate-spin" />
                          {{ t('dashboard.sections.plugins.license.submit') }}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </TxScroll>
            </div>
          </div>
        </TxAutoSizer>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped>
.VersionOverlay-Panel {
  width: min(760px, 94vw);
  min-height: 320px;
  max-height: min(90vh, 880px);
  display: flex;
  flex-direction: column;
  border-radius: 1.2rem;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
  overflow: hidden;
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.32);
}

.VersionOverlay-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.VersionOverlay-Stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 14px 4px;
}

.VersionOverlay-ScrollWrap {
  --version-form-scroll-height: 420px;
  --version-form-scroll-max-height: 620px;

  height: var(--version-form-scroll-height);
  max-height: var(--version-form-scroll-max-height);
  min-height: 220px;
  padding: 8px 16px 16px;
  overflow: hidden;
}

.VersionOverlay-Scroll {
  height: 100%;
}

.VersionOverlay-Form {
  padding: 8px 4px 8px;
}

.VersionOverlay-Warning {
  display: flex;
  min-height: 320px;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  padding: 16px 4px;
}

.VersionOverlay-License {
  display: flex;
  flex-direction: column;
  min-height: 320px;
}

.VersionOverlay-LicenseText {
  max-height: 320px;
  overflow-y: auto;
  border-radius: 1rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(0, 0, 0, 0.02);
  padding: 14px;
  font-size: 13px;
  line-height: 1.65;
  color: rgba(0, 0, 0, 0.72);

  .dark & {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.72);
  }
}

:deep(.VersionOverlay-SizerOuter) {
  display: flex;
  justify-content: center;
  overflow: hidden;
}

:deep(.VersionOverlay-Scroll .tx-scroll__content) {
  padding: 0;
  min-height: auto;
}

@media (max-width: 768px) {
  .VersionOverlay-Panel {
    width: min(96vw, 760px);
  }

  .VersionOverlay-Header {
    padding: 14px 14px 10px;
  }

  .VersionOverlay-Stepper {
    justify-content: flex-start;
    overflow-x: auto;
    padding: 12px 12px 2px;
  }

  .VersionOverlay-ScrollWrap {
    min-height: 200px;
    padding: 8px 10px 10px;
  }

  .VersionOverlay-Warning {
    min-height: 280px;
  }
}
</style>

<style>
.VersionOverlay-Mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  z-index: 1865;
  perspective: 1200px;
}

.VersionOverlay-Mask-enter-active,
.VersionOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.VersionOverlay-Mask-enter-from,
.VersionOverlay-Mask-leave-to {
  opacity: 0;
}

.VersionOverlay-Card {
  position: fixed;
  left: 50%;
  top: 50%;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
