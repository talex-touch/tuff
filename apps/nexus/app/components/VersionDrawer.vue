<script setup lang="ts">
import type { TpexExtractedManifest, TpexPackagePreviewResult } from '@talex-touch/utils/plugin/providers'
import { computed, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'

interface Props {
  isOpen: boolean
  pluginId: string
  pluginName: string
  loading?: boolean
  error?: string | null
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
const drawerRef = ref<HTMLElement | null>(null)

const formData = ref<VersionFormData>({
  version: '',
  channel: 'SNAPSHOT',
  changelog: '',
  packageFile: null as any,
})

const packageLoading = ref(false)
const packageError = ref<string | null>(null)
const manifestPreview = ref<TpexExtractedManifest | null>(null)

// Reset form when drawer opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    formData.value = {
      version: '',
      channel: 'SNAPSHOT',
      changelog: '',
      packageFile: null as any,
    }
    step.value = 'form'
    packageError.value = null
    manifestPreview.value = null
  }
})

onClickOutside(drawerRef, () => {
  if (props.isOpen)
    emit('close')
})

// Workflow Steps
type Step = 'form' | 'warning' | 'license'
const step = ref<Step>('form')
const licenseAgreed = ref(false)

async function handlePackageInput(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files?.[0])
    return

  const file = target.files[0]
  formData.value.packageFile = file
  packageError.value = null
  manifestPreview.value = null

  // Preview tpex to auto-fill form
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

      // Auto-fill version from manifest
      if (result.manifest.version && !formData.value.version) {
        formData.value.version = String(result.manifest.version)
      }

      // Auto-fill channel from manifest
      if (result.manifest.channel) {
        const channel = String(result.manifest.channel).toUpperCase()
        if (['RELEASE', 'BETA', 'SNAPSHOT'].includes(channel)) {
          formData.value.channel = channel as 'RELEASE' | 'BETA' | 'SNAPSHOT'
        }
      }

      // Auto-fill changelog from manifest
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
  
  // Start review workflow
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
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.description`)
)

const channelVisibility = computed(() => 
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.visibility`)
)
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm dark:bg-black/40"
      />
    </Transition>

    <!-- Drawer -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen"
        ref="drawerRef"
        class="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111]"
      >
        <div class="flex h-full flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-black/5 p-6 dark:border-white/5">
            <div>
              <h2 class="text-lg font-medium text-black dark:text-white">
                {{ t('dashboard.sections.plugins.publishVersion') }}
              </h2>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ pluginName }}
              </p>
            </div>
            <button
              class="flex size-8 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
              @click="emit('close')"
            >
              <span class="i-carbon-close text-lg" />
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Step 1: Form -->
            <form v-if="step === 'form'" @submit.prevent="onFormSubmit" class="flex flex-col gap-6">
              <!-- Version -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.plugins.versionForm.version') }}
                </label>
                <input
                  v-model="formData.version"
                  type="text"
                  placeholder="1.0.0"
                  required
                  pattern="^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
                  class="w-full border-b border-black/10 bg-transparent py-2 text-sm text-black outline-none transition focus:border-black dark:border-white/10 dark:text-white dark:focus:border-white"
                >
              </div>

              <!-- Channel -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.plugins.versionForm.channel') }}
                </label>
                <div class="relative">
                  <select
                    v-model="formData.channel"
                    class="w-full appearance-none border-b border-black/10 bg-transparent py-2 text-sm text-black outline-none transition focus:border-black dark:border-white/10 dark:text-white dark:focus:border-white"
                  >
                    <option value="RELEASE">RELEASE</option>
                    <option value="BETA">BETA</option>
                    <option value="SNAPSHOT">SNAPSHOT</option>
                  </select>
                  <span class="i-carbon-chevron-down absolute right-0 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
                </div>
                <!-- Channel Visibility Prompt -->
                <div class="mt-2 rounded bg-black/5 p-3 text-xs dark:bg-white/5">
                  <p class="mb-1 text-black/70 dark:text-white/70">{{ channelDescription }}</p>
                  <p class="font-medium text-black dark:text-white">{{ channelVisibility }}</p>
                </div>
              </div>

              <!-- Package -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.plugins.versionForm.package') }}
                </label>
                <div class="relative">
                  <input
                    type="file"
                    accept=".tpex"
                    required
                    class="absolute inset-0 cursor-pointer opacity-0"
                    @change="handlePackageInput"
                  >
                  <div class="flex items-center gap-2 border-b border-black/10 py-2 transition dark:border-white/10">
                    <span v-if="packageLoading" class="i-carbon-circle-dash animate-spin text-black/40 dark:text-white/40" />
                    <span v-else class="i-carbon-document-add text-black/40 dark:text-white/40" />
                    <span class="text-sm text-black dark:text-white">
                      {{ formData.packageFile ? formData.packageFile.name : t('dashboard.sections.plugins.packageAwaiting') }}
                    </span>
                  </div>
                </div>
                <p v-if="packageError" class="text-xs text-red-500">{{ packageError }}</p>

                <!-- Manifest Preview -->
                <div v-if="manifestPreview" class="mt-2 rounded-lg bg-black/5 p-3 dark:bg-white/5">
                  <p class="mb-2 text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                    {{ t('dashboard.sections.plugins.manifestPreview') }}
                  </p>
                  <div class="space-y-1 text-xs text-black/70 dark:text-white/70">
                    <p v-if="manifestPreview.name"><span class="font-medium">Name:</span> {{ manifestPreview.name }}</p>
                    <p v-if="manifestPreview.version"><span class="font-medium">Version:</span> {{ manifestPreview.version }}</p>
                    <p v-if="manifestPreview.channel"><span class="font-medium">Channel:</span> {{ manifestPreview.channel }}</p>
                  </div>
                </div>
              </div>

              <!-- Changelog -->
              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.plugins.versionForm.changelog') }}
                </label>
                <textarea
                  v-model="formData.changelog"
                  rows="6"
                  required
                  class="w-full resize-none rounded border border-black/10 bg-transparent p-3 text-sm text-black outline-none transition focus:border-black dark:border-white/10 dark:text-white dark:focus:border-white"
                ></textarea>
              </div>

              <!-- Submit Button -->
              <div class="mt-auto pt-6">
                <button
                  type="submit"
                  :disabled="loading"
                  class="w-full rounded bg-black py-3 text-sm font-medium text-white transition hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  <span v-if="loading" class="i-carbon-circle-dash animate-spin mr-2" />
                  {{ t('dashboard.sections.plugins.versionForm.submit') }}
                </button>
                <p v-if="error" class="mt-2 text-center text-xs text-red-500">{{ error }}</p>
              </div>
            </form>

            <!-- Step 2: Warning -->
            <div v-else-if="step === 'warning'" class="flex h-full flex-col justify-center text-center">
              <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                <span class="i-carbon-warning-alt text-3xl" />
              </div>
              <h3 class="mb-2 text-lg font-medium text-black dark:text-white">
                {{ t('dashboard.sections.plugins.warnings.immutable.title') }}
              </h3>
              <p class="mb-8 text-sm text-black/60 dark:text-white/60">
                {{ t('dashboard.sections.plugins.warnings.immutable.message') }}
              </p>
              <div class="flex flex-col gap-3">
                <button
                  class="w-full rounded bg-black py-3 text-sm font-medium text-white transition hover:bg-black/90 dark:bg-white dark:text-black"
                  @click="onWarningConfirm"
                >
                  {{ t('dashboard.sections.plugins.warnings.immutable.understand') }}
                </button>
                <button
                  class="w-full py-2 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
                  @click="step = 'form'"
                >
                  {{ t('dashboard.sections.plugins.warnings.immutable.cancel') }}
                </button>
              </div>
            </div>

            <!-- Step 3: License -->
            <div v-else-if="step === 'license'" class="flex h-full flex-col">
              <h3 class="mb-4 text-lg font-medium text-black dark:text-white">
                {{ t('dashboard.sections.plugins.license.title') }}
              </h3>
              <div class="flex-1 overflow-y-auto rounded border border-black/10 bg-black/5 p-4 text-sm leading-relaxed text-black/80 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                <div class="prose prose-sm dark:prose-invert">
                  <ContentRendererMarkdown :value="t('dashboard.sections.plugins.license.agreement')" />
                </div>
              </div>
              <div class="mt-6 flex flex-col gap-4">
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    v-model="licenseAgreed"
                    type="checkbox"
                    class="size-4 rounded border-black/20 text-black focus:ring-black dark:border-white/20 dark:bg-white/10 dark:focus:ring-white"
                  >
                  <span class="text-sm text-black/80 dark:text-white/80">
                    {{ t('dashboard.sections.plugins.license.confirm') }}
                  </span>
                </label>
                <div class="flex gap-3">
                  <button
                    class="flex-1 rounded border border-black/10 py-3 text-sm font-medium text-black transition hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                    @click="step = 'form'"
                  >
                    {{ t('dashboard.sections.plugins.license.cancel') }}
                  </button>
                  <button
                    class="flex-1 rounded bg-black py-3 text-sm font-medium text-white transition hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
                    :disabled="!licenseAgreed || loading"
                    @click="onLicenseSubmit"
                  >
                    <span v-if="loading" class="i-carbon-circle-dash animate-spin mr-2" />
                    {{ t('dashboard.sections.plugins.license.submit') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
