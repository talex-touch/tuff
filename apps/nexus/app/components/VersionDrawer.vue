<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import type { TpexExtractedManifest, TpexPackagePreviewResult } from '@talex-touch/utils/plugin/providers'
import { computed, ref, watch } from 'vue'
import Button from '~/components/ui/Button.vue'
import Drawer from '~/components/ui/Drawer.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'

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

// Reset form when drawer opens
watch(() => props.isOpen, (isOpen) => {
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
  }
})

// Workflow Steps
type Step = 'form' | 'warning' | 'license'
const step = ref<Step>('form')
const licenseAgreed = ref(false)

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
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.description`),
)

const channelVisibility = computed(() =>
  t(`dashboard.sections.plugins.channels.${formData.value.channel}.visibility`),
)
</script>

<template>
  <Drawer
    :visible="isOpen"
    width="520px"
    @update:visible="(v) => {
      if (!v)
        emit('close')
    }"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/5">
        <div>
          <h2 class="text-lg font-medium text-black dark:text-white">
            {{ t('dashboard.sections.plugins.publishVersion') }}
          </h2>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ pluginName }}
          </p>
        </div>
        <FlatButton @click="emit('close')">
          <span class="i-carbon-close text-lg" />
        </FlatButton>
      </div>

      <div class="flex-1 overflow-y-auto pt-4">
        <form v-if="step === 'form'" class="space-y-6" @submit.prevent="onFormSubmit">
          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.versionForm.version') }}
            </label>
            <Input
              v-model="formData.version"
              placeholder="1.0.0"
              pattern="^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.versionForm.channel') }}
            </label>
            <TuffSelect v-model="formData.channel" class="w-full">
              <TuffSelectItem value="RELEASE" label="RELEASE" />
              <TuffSelectItem value="BETA" label="BETA" />
              <TuffSelectItem value="SNAPSHOT" label="SNAPSHOT" />
            </TuffSelect>
            <div class="mt-2 rounded bg-black/5 p-3 text-xs dark:bg-white/5">
              <p class="mb-1 text-black/70 dark:text-white/70">
                {{ channelDescription }}
              </p>
              <p class="font-medium text-black dark:text-white">
                {{ channelVisibility }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
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
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
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
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
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
            <Button block @click="onWarningConfirm">
              {{ t('dashboard.sections.plugins.warnings.immutable.understand') }}
            </Button>
            <FlatButton @click="step = 'form'">
              {{ t('dashboard.sections.plugins.warnings.immutable.cancel') }}
            </FlatButton>
          </div>
        </div>

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
            <label class="flex items-center gap-3">
              <Switch v-model="licenseAgreed" />
              <span class="text-sm text-black/80 dark:text-white/80">
                {{ t('dashboard.sections.plugins.license.confirm') }}
              </span>
            </label>
            <div class="flex gap-3">
              <FlatButton class="flex-1" @click="step = 'form'">
                {{ t('dashboard.sections.plugins.license.cancel') }}
              </FlatButton>
              <Button
                class="flex-1"
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
    </div>
  </Drawer>
</template>
