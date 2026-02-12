<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import type { PluginFormData } from '~/components/CreatePluginDrawer.vue'
import type { TpexExtractedManifest } from '@talex-touch/utils/plugin/providers'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TxButton, TxScroll } from '@talex-touch/tuffex'
import Input from '~/components/ui/Input.vue'
import Switch from '~/components/ui/Switch.vue'
import { isPluginCategoryId, PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

interface Props {
  visible: boolean
  loading?: boolean
  error?: string | null
  isAdmin?: boolean
  maxScrollHeight?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  isAdmin: false,
  maxScrollHeight: null,
})

const emit = defineEmits<{
  (e: 'submit', data: PluginFormData): void
  (e: 'layout-change'): void
}>()

const { t } = useI18n()

type InputMode = 'upload' | 'manual'
const inputMode = ref<InputMode>('upload')

const formData = ref<PluginFormData>({
  slug: '',
  name: '',
  summary: '',
  category: PLUGIN_CATEGORIES[0]?.id ?? '',
  artifactType: 'plugin',
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

const packageFiles = ref<FileUploaderFile[]>([])
const packageLoading = ref(false)
const packageError = ref<string | null>(null)
const manifestPreview = ref<TpexExtractedManifest | null>(null)
const readmePreview = ref('')
const iconPreviewUrl = ref<string | null>(null)
const packageHasIcon = ref(false)
const iconFiles = ref<FileUploaderFile[]>([])
const formContentRef = ref<HTMLElement | null>(null)
const scrollAreaHeight = ref(420)
const maxScrollableHeight = ref(620)
let formResizeObserver: ResizeObserver | null = null
let viewportResizeHandler: (() => void) | null = null

const PACKAGE_PREVIEW_ENDPOINT = '/api/dashboard/plugins/package/preview'
const PLUGIN_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/

function resetForm() {
  formData.value = {
    slug: '',
    name: '',
    summary: '',
    category: PLUGIN_CATEGORIES[0]?.id ?? '',
    artifactType: 'plugin',
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
  packageFiles.value = []
  packageLoading.value = false
  packageError.value = null
  manifestPreview.value = null
  readmePreview.value = ''
  iconPreviewUrl.value = null
  packageHasIcon.value = false
  iconFiles.value = []
  inputMode.value = 'upload'
}

watch(() => props.visible, async (visible) => {
  if (visible) {
    resetForm()
    maxScrollableHeight.value = resolveMaxScrollableHeight()
    await nextTick()
    setupFormObserver()
    scheduleLayoutMeasure()
    return
  }

  cleanupFormObserver()
}, { immediate: true })

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

const artifactTypeOptions = computed(() => [
  { value: 'plugin' as const, label: t('dashboard.sections.plugins.form.artifactTypes.plugin', 'Plugin') },
  { value: 'layout' as const, label: t('dashboard.sections.plugins.form.artifactTypes.layout', 'Layout Preset') },
  { value: 'theme' as const, label: t('dashboard.sections.plugins.form.artifactTypes.theme', 'Theme Pack') },
])

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

  const manifestType = typeof (manifest as Record<string, unknown>).type === 'string'
    ? String((manifest as Record<string, unknown>).type).toLowerCase()
    : ''
  if (manifestType === 'plugin' || manifestType === 'layout' || manifestType === 'theme')
    formData.value.artifactType = manifestType as PluginFormData['artifactType']

  if (readme && !formData.value.readme.trim())
    formData.value.readme = readme

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

async function handlePackageChange(files: FileUploaderFile[]) {
  packageFiles.value = files
  const file = files[0]?.file ?? null
  formData.value.packageFile = file
  packageError.value = null
  manifestPreview.value = null
  readmePreview.value = ''
  iconPreviewUrl.value = null
  packageHasIcon.value = false

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

function handleIconChange(files: FileUploaderFile[]) {
  iconFiles.value = files
  formData.value.iconFile = files[0]?.file ?? null
}

const displayIconUrl = computed(() => {
  if (formData.value.iconFile)
    return URL.createObjectURL(formData.value.iconFile)
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

const scrollWrapStyle = computed(() => ({
  height: `${scrollAreaHeight.value}px`,
  maxHeight: `${maxScrollableHeight.value}px`,
}))

function resolveMaxScrollableHeight() {
  if (typeof props.maxScrollHeight === 'number' && props.maxScrollHeight > 0)
    return props.maxScrollHeight
  if (!hasWindow())
    return 620
  const viewportLimitedHeight = Math.floor(window.innerHeight * 0.66)
  return Math.max(260, Math.min(viewportLimitedHeight, 680))
}

function scheduleLayoutMeasure() {
  if (!props.visible)
    return

  nextTick(() => {
    const contentEl = formContentRef.value
    if (!contentEl)
      return

    const measure = () => {
      const measuredHeight = Math.ceil(contentEl.scrollHeight)
      if (measuredHeight <= 0)
        return

      const minHeight = 240
      scrollAreaHeight.value = Math.max(minHeight, Math.min(measuredHeight, maxScrollableHeight.value))
    }

    if (hasWindow()) {
      requestAnimationFrame(() => requestAnimationFrame(measure))
      return
    }

    measure()
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
  if (typeof ResizeObserver === 'undefined' || !formContentRef.value)
    return

  formResizeObserver = new ResizeObserver(() => {
    scheduleLayoutMeasure()
  })
  formResizeObserver.observe(formContentRef.value)
}

watch(scrollAreaHeight, () => {
  emit('layout-change')
})

watch(inputMode, () => scheduleLayoutMeasure())
watch([manifestPreview, packageLoading, packageError], () => scheduleLayoutMeasure())
watch(() => props.maxScrollHeight, () => {
  maxScrollableHeight.value = resolveMaxScrollableHeight()
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
  if (!hasWindow() || !viewportResizeHandler)
    return
  window.removeEventListener('resize', viewportResizeHandler)
  viewportResizeHandler = null
})

function onSubmit() {
  if (!canSubmit.value)
    return
  emit('submit', formData.value)
}
</script>

<template>
  <div class="AssetPluginFormStep">
    <TxCard variant="plain" background="mask" :radius="18" :padding="16" class="AssetPluginFormStep-Card">
      <div class="AssetPluginFormStep-Mode">
        <button
          type="button"
          class="AssetPluginFormStep-ModeBtn"
          :class="inputMode === 'upload' ? 'is-active' : ''"
          @click="inputMode = 'upload'"
        >
          <span class="i-carbon-upload" />
          {{ t('dashboard.sections.plugins.form.uploadPackage') }}
        </button>
        <button
          type="button"
          class="AssetPluginFormStep-ModeBtn"
          :class="inputMode === 'manual' ? 'is-active' : ''"
          @click="inputMode = 'manual'"
        >
          <span class="i-carbon-edit" />
          {{ t('dashboard.sections.plugins.form.manualInput') }}
        </button>
      </div>

      <div class="AssetPluginFormStep-ScrollWrap" :style="scrollWrapStyle">
        <TxScroll native no-padding class="AssetPluginFormStep-Scroll" style="height: 100%;">
          <form ref="formContentRef" class="AssetPluginFormStep-Form space-y-6" @submit.prevent="onSubmit">
          <div v-if="inputMode === 'upload'" class="space-y-4">
            <div class="flex flex-col gap-2">
              <label class="apple-section-title">
                {{ t('dashboard.sections.plugins.form.packageUpload') }}
              </label>
              <TxFileUploader
                v-model="packageFiles"
                :multiple="false"
                :max="1"
                accept=".tpex"
                :disabled="packageLoading"
                :button-text="t('dashboard.sections.plugins.form.uploadPackage')"
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
            </div>

            <div v-if="manifestPreview" class="rounded-lg bg-black/5 p-4 dark:bg-white/5">
              <p class="mb-2 apple-section-title">
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
            <label class="apple-section-title">
              {{ t('dashboard.sections.plugins.form.identifier') }}
            </label>
            <Input v-model="formData.slug" placeholder="com.example.plugin" />
            <p class="text-[11px] text-black/40 dark:text-white/50">
              {{ t('dashboard.sections.plugins.form.identifierHelp') }}
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="flex flex-col gap-2">
              <label class="apple-section-title">
                {{ t('dashboard.sections.plugins.form.name') }}
              </label>
              <Input v-model="formData.name" />
            </div>

            <div class="flex flex-col gap-2">
              <label class="apple-section-title">
                {{ t('dashboard.sections.plugins.form.artifactType', 'Publish Type') }}
              </label>
              <TuffSelect v-model="formData.artifactType" class="w-full">
                <TuffSelectItem
                  v-for="artifactType in artifactTypeOptions"
                  :key="artifactType.value"
                  :value="artifactType.value"
                  :label="artifactType.label"
                />
              </TuffSelect>
            </div>

            <div class="flex flex-col gap-2">
              <label class="apple-section-title">
                {{ t('dashboard.sections.plugins.form.category') }}
              </label>
              <TuffSelect v-model="formData.category" class="w-full">
                <TuffSelectItem
                  v-for="category in pluginCategoryOptions"
                  :key="category.id"
                  :value="category.id"
                  :label="category.label"
                />
              </TuffSelect>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="apple-section-title">
              {{ t('dashboard.sections.plugins.form.summary') }}
            </label>
            <Input v-model="formData.summary" type="textarea" :rows="2" />
          </div>

          <div class="flex flex-col gap-2">
            <label class="apple-section-title">
              {{ t('dashboard.sections.plugins.form.homepage') }}
            </label>
            <Input v-model="formData.homepage" placeholder="https://github.com/..." />
          </div>

          <div class="flex flex-col gap-2">
            <label class="apple-section-title">
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
              <TxFileUploader
                v-model="iconFiles"
                class="flex-1"
                :multiple="false"
                :max="1"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                @change="handleIconChange"
              />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="apple-section-title">
              {{ t('dashboard.sections.plugins.form.readme') }}
            </label>
            <Input
              v-model="formData.readme"
              type="textarea"
              :rows="6"
              :placeholder="readmePreview || '# My Plugin\n\nDescribe your plugin here...'"
            />
          </div>

          <label v-if="isAdmin" class="flex items-center gap-3">
            <Switch v-model="formData.isOfficial" />
            <span class="text-sm text-black/80 dark:text-white/80">
              {{ t('dashboard.sections.plugins.form.isOfficial') }}
            </span>
          </label>

          <div class="pt-4">
            <TxButton block :disabled="loading || !canSubmit" native-type="submit" class="h-11 rounded-xl">
              <span v-if="loading" class="i-carbon-circle-dash mr-2 animate-spin" />
              {{ t('dashboard.sections.plugins.createSubmit') }}
            </TxButton>
            <p v-if="error" class="mt-2 text-center text-xs text-red-500">
              {{ error }}
            </p>
          </div>
          </form>
        </TxScroll>
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.AssetPluginFormStep {
  width: min(900px, 92vw);
  padding: 8px 10px 0;
}

.AssetPluginFormStep-Card {
  width: 100%;
  min-height: 0;
}

.AssetPluginFormStep-Mode {
  display: inline-flex;
  border-radius: 0.82rem;
  padding: 4px;
  background: rgba(0, 0, 0, 0.04);

  .dark & {
    background: rgba(255, 255, 255, 0.08);
  }
}

.AssetPluginFormStep-ModeBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 0.68rem;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.56);
  transition: all 0.2s ease;

  &:hover {
    color: rgba(0, 0, 0, 0.76);
  }

  &.is-active {
    color: rgba(0, 0, 0, 0.88);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .dark & {
    color: rgba(255, 255, 255, 0.58);

    &:hover {
      color: rgba(255, 255, 255, 0.78);
    }

    &.is-active {
      color: rgba(255, 255, 255, 0.9);
      background: rgba(255, 255, 255, 0.14);
    }
  }
}

.AssetPluginFormStep-ScrollWrap {
  margin-top: 12px;

  height: 420px;
  max-height: 620px;
  min-height: 240px;
  overflow: hidden;
}

.AssetPluginFormStep-Scroll {
  height: 100%;
}

.AssetPluginFormStep-Form {
  padding: 8px 4px 12px;
}

:deep(.AssetPluginFormStep-Scroll .tx-scroll__content) {
  padding: 0;
  min-height: auto;
}

@media (max-width: 768px) {
  .AssetPluginFormStep {
    width: 100%;
    padding: 6px 2px 0;
  }

  .AssetPluginFormStep-ScrollWrap {
    min-height: 220px;
  }
}
</style>
