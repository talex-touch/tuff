<script setup lang="ts">
import type { TpexExtractedManifest } from '@talex-touch/utils/plugin/providers'
import { computed, ref, watch } from 'vue'
import Button from '~/components/ui/Button.vue'
import Drawer from '~/components/ui/Drawer.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'
import Switch from '~/components/ui/Switch.vue'
import { isPluginCategoryId, PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

interface Props {
  isOpen: boolean
  loading?: boolean
  error?: string | null
  isAdmin?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: PluginFormData): void
}>()

export interface PluginFormData {
  slug: string
  name: string
  summary: string
  category: string
  homepage: string
  isOfficial: boolean
  badges: string
  readme: string
  iconFile: File | null
  packageFile: File | null
  initialVersion: string | null
  initialChannel: 'RELEASE' | 'BETA' | 'SNAPSHOT' | null
  initialChangelog: string | null
}

const { t } = useI18n()

type InputMode = 'upload' | 'manual'
const inputMode = ref<InputMode>('upload')

const formData = ref<PluginFormData>({
  slug: '',
  name: '',
  summary: '',
  category: PLUGIN_CATEGORIES[0]?.id ?? '',
  homepage: '',
  isOfficial: false,
  badges: '',
  readme: '',
  iconFile: null,
  packageFile: null,
  initialVersion: null,
  initialChannel: null,
  initialChangelog: null,
})

const packageFile = ref<File | null>(null)
const packageLoading = ref(false)
const packageError = ref<string | null>(null)
const manifestPreview = ref<TpexExtractedManifest | null>(null)
const readmePreview = ref('')
const iconPreviewUrl = ref<string | null>(null)
const packageHasIcon = ref(false)

const PACKAGE_PREVIEW_ENDPOINT = '/api/dashboard/plugins/package/preview'

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    formData.value = {
      slug: '',
      name: '',
      summary: '',
      category: PLUGIN_CATEGORIES[0]?.id ?? '',
      homepage: '',
      isOfficial: false,
      badges: '',
      readme: '',
      iconFile: null,
      packageFile: null,
      initialVersion: null,
      initialChannel: null,
      initialChangelog: null,
    }
    packageFile.value = null
    packageLoading.value = false
    packageError.value = null
    manifestPreview.value = null
    readmePreview.value = ''
    iconPreviewUrl.value = null
    packageHasIcon.value = false
    inputMode.value = 'upload'
  }
})

const PLUGIN_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+/g, '')
    .slice(0, 128)
  return normalized.replace(/^[^a-z]+/, '')
}

watch(() => formData.value.name, (name) => {
  if (formData.value.slug.trim().length)
    return
  formData.value.slug = slugify(name)
})

watch(() => formData.value.slug, (value) => {
  const normalized = slugify(value)
  if (normalized !== value)
    formData.value.slug = normalized
})

const pluginCategoryOptions = computed(() =>
  PLUGIN_CATEGORIES.map(category => ({
    ...category,
    label: t(category.i18nKey),
  })),
)

interface PackagePreviewResult {
  manifest: TpexExtractedManifest | null
  readmeMarkdown: string | null
  iconDataUrl: string | null
  hasIcon: boolean
}

async function requestPackagePreview(file: File): Promise<PackagePreviewResult> {
  const formDataObj = new FormData()
  formDataObj.append('package', file)
  return await $fetch<PackagePreviewResult>(PACKAGE_PREVIEW_ENDPOINT, {
    method: 'POST',
    body: formDataObj,
  })
}

function applyManifestToForm(manifest: TpexExtractedManifest | null, readme: string | null) {
  if (!manifest)
    return

  const manifestId = typeof manifest.id === 'string' ? manifest.id : ''
  if (manifestId && !formData.value.slug.trim())
    formData.value.slug = slugify(manifestId)

  if (typeof manifest.name === 'string' && !formData.value.name.trim())
    formData.value.name = manifest.name

  if (typeof manifest.description === 'string' && !formData.value.summary.trim())
    formData.value.summary = manifest.description

  if (typeof manifest.homepage === 'string' && !formData.value.homepage.trim())
    formData.value.homepage = manifest.homepage

  if (manifest.category && typeof manifest.category === 'string' && isPluginCategoryId(manifest.category))
    formData.value.category = manifest.category

  if (readme && !formData.value.readme.trim())
    formData.value.readme = readme

  // Extract version info for auto-publishing
  if (typeof manifest.version === 'string')
    formData.value.initialVersion = manifest.version

  if (typeof manifest.channel === 'string') {
    const channel = manifest.channel.toUpperCase()
    if (['RELEASE', 'BETA', 'SNAPSHOT'].includes(channel))
      formData.value.initialChannel = channel as 'RELEASE' | 'BETA' | 'SNAPSHOT'
  }

  if (typeof manifest.changelog === 'string')
    formData.value.initialChangelog = manifest.changelog
}

async function handlePackageInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null
  packageFile.value = file
  formData.value.packageFile = file
  packageError.value = null
  manifestPreview.value = null
  readmePreview.value = ''

  // Reset version info when file changes
  formData.value.initialVersion = null
  formData.value.initialChannel = null
  formData.value.initialChangelog = null

  if (!file)
    return

  packageLoading.value = true
  try {
    const preview = await requestPackagePreview(file)
    manifestPreview.value = preview.manifest
    readmePreview.value = preview.readmeMarkdown ?? ''
    iconPreviewUrl.value = preview.iconDataUrl
    packageHasIcon.value = preview.hasIcon
    applyManifestToForm(preview.manifest, preview.readmeMarkdown ?? '')
  }
  catch (error: unknown) {
    packageError.value = error instanceof Error ? error.message : t('dashboard.sections.plugins.errors.unknown')
  }
  finally {
    packageLoading.value = false
  }
}

function handleIconInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0] ?? null
  formData.value.iconFile = file
}

// Computed for icon preview display - priority: user uploaded > package extracted
const displayIconUrl = computed(() => {
  if (formData.value.iconFile) {
    return URL.createObjectURL(formData.value.iconFile)
  }
  return iconPreviewUrl.value
})

const hasIconPreview = computed(() => !!displayIconUrl.value)

const canSubmit = computed(() => {
  const { slug, name, summary, readme, category } = formData.value
  return (
    slug.trim().length > 0
    && PLUGIN_IDENTIFIER_PATTERN.test(slug.trim())
    && name.trim().length > 0
    && summary.trim().length > 0
    && readme.trim().length > 0
    && isPluginCategoryId(category)
  )
})

function onSubmit() {
  if (!canSubmit.value)
    return
  emit('submit', formData.value)
}
</script>

<template>
  <Drawer
    :visible="isOpen"
    width="640px"
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
            {{ t('dashboard.sections.plugins.addButton') }}
          </h2>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.plugins.manageSubtitle') }}
          </p>
        </div>
        <FlatButton @click="emit('close')">
          <span class="i-carbon-close text-lg" />
        </FlatButton>
      </div>

      <div class="mt-4 flex gap-2">
        <Button
          size="small"
          :type="inputMode === 'upload' ? 'primary' : 'text'"
          @click="inputMode = 'upload'"
        >
          <span class="i-carbon-upload mr-1" />
          {{ t('dashboard.sections.plugins.form.uploadPackage') }}
        </Button>
        <Button
          size="small"
          :type="inputMode === 'manual' ? 'primary' : 'text'"
          @click="inputMode = 'manual'"
        >
          <span class="i-carbon-edit mr-1" />
          {{ t('dashboard.sections.plugins.form.manualInput') }}
        </Button>
      </div>

      <div class="flex-1 overflow-y-auto pt-4">
        <form class="space-y-5" @submit.prevent="onSubmit">
          <div v-if="inputMode === 'upload'" class="space-y-4">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.plugins.form.packageUpload') }}
              </label>
              <div class="relative">
                <input
                  type="file"
                  accept=".tpex"
                  class="absolute inset-0 cursor-pointer opacity-0"
                  @change="handlePackageInput"
                >
                <div class="flex items-center gap-3 rounded-lg border-2 border-dashed border-black/10 p-4 transition hover:border-black/20 dark:border-white/10 dark:hover:border-white/20">
                  <div class="flex size-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/5">
                    <span v-if="packageLoading" class="i-carbon-circle-dash animate-spin text-black/40 dark:text-white/40" />
                    <span v-else class="i-carbon-document-add text-black/40 dark:text-white/40" />
                  </div>
                  <div class="flex-1">
                    <p class="text-sm font-medium text-black dark:text-white">
                      {{ packageFile ? packageFile.name : t('dashboard.sections.plugins.packageAwaiting') }}
                    </p>
                    <p class="text-xs text-black/50 dark:text-white/50">
                      {{ t('dashboard.sections.plugins.form.packageHelp') }}
                    </p>
                  </div>
                </div>
              </div>
              <p v-if="packageError" class="text-xs text-red-500">
                {{ packageError }}
              </p>
            </div>

            <div v-if="manifestPreview" class="rounded-lg bg-black/5 p-4 dark:bg-white/5">
              <p class="mb-2 text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.plugins.manifestPreview') }}
              </p>
              <div class="space-y-1 text-xs text-black/70 dark:text-white/70">
                <p v-if="manifestPreview.id">
                  <span class="font-medium">ID:</span> {{ manifestPreview.id }}
                </p>
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

            <div v-if="formData.initialVersion" class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
              <p class="text-xs text-green-700 dark:text-green-300">
                <span class="i-carbon-checkmark-filled mr-1" />
                {{ t('dashboard.sections.plugins.form.autoPublishHint', { version: formData.initialVersion }) }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.identifier') }}
            </label>
            <Input v-model="formData.slug" placeholder="com.example.plugin" />
            <p class="text-[11px] text-black/40 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.identifierHelp') }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-2">
              <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.plugins.form.name') }}
              </label>
              <Input v-model="formData.name" />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.plugins.form.category') }}
              </label>
              <div class="relative">
                <select
                  v-model="formData.category"
                  required
                  class="w-full appearance-none border-b border-black/10 bg-transparent py-2 text-sm text-black outline-none transition focus:border-black dark:border-white/10 dark:text-white dark:focus:border-white"
                >
                  <option
                    v-for="category in pluginCategoryOptions"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.label }}
                  </option>
                </select>
                <span class="i-carbon-chevron-down absolute right-0 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.summary') }}
            </label>
            <Input v-model="formData.summary" type="textarea" :rows="2" />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.homepage') }}
            </label>
            <Input v-model="formData.homepage" placeholder="https://github.com/..." />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.icon') }}
              <span v-if="packageHasIcon && !formData.iconFile" class="ml-1 text-emerald-500">(from package)</span>
            </label>
            <div class="flex items-center gap-3">
              <div class="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                <img
                  v-if="hasIconPreview"
                  :src="displayIconUrl!"
                  alt="Plugin icon preview"
                  class="size-full object-contain"
                >
                <span v-else class="text-lg font-medium text-black/40 dark:text-white/40">
                  {{ formData.name ? formData.name.charAt(0).toUpperCase() : '?' }}
                </span>
              </div>
              <div class="relative flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  class="absolute inset-0 cursor-pointer opacity-0"
                  @change="handleIconInput"
                >
                <div class="rounded border border-black/10 px-3 py-2 text-xs text-black/60 dark:border-white/10 dark:text-white/60">
                  <template v-if="formData.iconFile">
                    {{ formData.iconFile.name }}
                  </template>
                  <template v-else-if="packageHasIcon">
                    {{ t('dashboard.sections.plugins.form.iconFromPackage', 'Icon from package (click to override)') }}
                  </template>
                  <template v-else>
                    {{ t('dashboard.sections.plugins.form.iconHelp') }}
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.readme') }}
            </label>
            <Input
              v-model="formData.readme"
              type="textarea"
              :rows="6"
              :placeholder="readmePreview || '# My Plugin\n\nDescribe your plugin here...'"
            />
            <p class="text-[11px] text-black/40 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.readmeHelp') }}
            </p>
          </div>

          <label v-if="isAdmin" class="flex items-center gap-3">
            <Switch v-model="formData.isOfficial" />
            <span class="text-sm text-black/80 dark:text-white/80">
              {{ t('dashboard.sections.plugins.form.isOfficial') }}
            </span>
          </label>

          <div class="pt-2">
            <Button block :disabled="loading || !canSubmit" native-type="submit">
              <span v-if="loading" class="i-carbon-circle-dash mr-2 animate-spin" />
              {{ t('dashboard.sections.plugins.createSubmit') }}
            </Button>
            <p v-if="error" class="mt-2 text-center text-xs text-red-500">
              {{ error }}
            </p>
          </div>
        </form>
      </div>
    </div>
  </Drawer>
</template>
