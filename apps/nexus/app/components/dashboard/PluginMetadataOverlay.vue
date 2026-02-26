<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import { computed, reactive } from 'vue'
import MDC from '@nuxtjs/mdc/runtime/components/MDC.vue'
import { TxButton } from '@talex-touch/tuffex'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'
import Switch from '~/components/ui/Switch.vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'

interface PluginCategoryOption {
  id: string
  label: string
}

interface PluginFormState {
  slug: string
  name: string
  summary: string
  category: string
  homepage: string
  isOfficial: boolean
  badges: string
  readme: string
  iconFile: File | null
  iconPreviewUrl: string | null
  removeIcon: boolean
}

interface ExtractedManifest {
  id?: string
  name?: string
  description?: string
  version?: string
  homepage?: string
  changelog?: string
  channel?: string
  category?: string
  [key: string]: unknown
}

interface Props {
  modelValue: boolean
  source?: HTMLElement | DOMRect | null
  mode: 'create' | 'edit'
  formState: PluginFormState
  categoryOptions: PluginCategoryOption[]
  isAdmin: boolean
  editingPluginInstallText: string
  editingPluginHasIcon: boolean
  pluginPackageLoading: boolean
  pluginPackageError: string | null
  pluginManifestPreview: ExtractedManifest | null
  pluginReadmePreview: string
  pluginPackageFileName: string | null
  pluginIconFiles: FileUploaderFile[]
  pluginPackageFiles: FileUploaderFile[]
  saving: boolean
  error: string | null
  pluginNameFallback?: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:pluginIconFiles', files: FileUploaderFile[]): void
  (e: 'update:pluginPackageFiles', files: FileUploaderFile[]): void
  (e: 'iconChange', files: FileUploaderFile[]): void
  (e: 'packageChange', files: FileUploaderFile[]): void
  (e: 'removeIcon'): void
  (e: 'submit'): void
}>()

const form = reactive(props.formState)

const { t } = useI18n()

const visibleModel = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const iconFilesModel = computed({
  get: () => props.pluginIconFiles,
  set: files => emit('update:pluginIconFiles', files),
})

const packageFilesModel = computed({
  get: () => props.pluginPackageFiles,
  set: files => emit('update:pluginPackageFiles', files),
})

const titleName = computed(() => form.name || props.pluginNameFallback || '—')

function requestClose(close?: () => void) {
  close?.()
  visibleModel.value = false
}

function handleSubmit() {
  emit('submit')
}

function handleIconChange(files: FileUploaderFile[]) {
  emit('iconChange', files)
}

function handlePackageChange(files: FileUploaderFile[]) {
  emit('packageChange', files)
}
</script>

<template>
  <FlipDialog
      v-model="visibleModel"
      :reference="source"
      size="lg"
    >
      <template #default="{ close }">
        <div class="PluginMetadataOverlay-Panel">
          <div class="PluginMetadataOverlay-Header">
            <div>
              <h4 class="text-base font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.plugins.editMetadata') }}
              </h4>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ titleName }}
              </p>
            </div>
          </div>

          <div class="PluginMetadataOverlay-Body">
            <form class="mt-4 space-y-4" @submit.prevent="handleSubmit">
              <div class="grid gap-4 md:grid-cols-2">
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
                  {{ t('dashboard.sections.plugins.form.identifier') }}
                  <Input
                    v-model="form.slug"
                    :disabled="mode === 'edit'"
                    placeholder="com.example.plugin"
                    required
                  />
                  <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
                    {{ t('dashboard.sections.plugins.form.identifierHelp') }}
                  </span>
                </label>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.plugins.form.name') }}
                  <Input v-model="form.name" required />
                </label>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.plugins.form.category') }}
                  <TuffSelect v-model="form.category" class="w-full">
                    <TuffSelectItem
                      v-for="category in categoryOptions"
                      :key="category.id"
                      :value="category.id"
                      :label="category.label"
                    />
                  </TuffSelect>
                </label>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
                  {{ t('dashboard.sections.plugins.form.summary') }}
                  <Input v-model="form.summary" type="textarea" :rows="3" required />
                </label>
                <div class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
                  <span>{{ t('dashboard.sections.plugins.form.icon') }}</span>
                  <div class="flex items-center gap-3">
                    <div class="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-dark/5 text-lg font-semibold text-black dark:border-light/20 dark:bg-light/5 dark:text-light">
                      <img
                        v-if="form.iconPreviewUrl"
                        :src="form.iconPreviewUrl"
                        alt="Plugin icon preview"
                        class="h-full w-full object-cover"
                      >
                      <span v-else>{{ form.name ? form.name.charAt(0).toUpperCase() : '∗' }}</span>
                    </div>
                    <div class="flex flex-col gap-2 text-[11px] font-medium normal-case text-black/60 dark:text-light/60">
                      <label class="flex items-center gap-2">
                        <TxFileUploader
                          v-model="iconFilesModel"
                          :multiple="false"
                          :max="1"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          :button-text="t('dashboard.sections.plugins.form.icon')"
                          :drop-text="t('dashboard.sections.plugins.form.iconHelp')"
                          :hint-text="t('dashboard.sections.plugins.form.iconHelp')"
                          @change="handleIconChange"
                        />
                      </label>
                      <FlatButton
                        v-if="mode === 'edit' && (form.iconPreviewUrl || editingPluginHasIcon)"
                        class="text-[11px] font-semibold uppercase tracking-wide"
                        @click="emit('removeIcon')"
                      >
                        <span class="i-carbon-trash-can text-xs" />
                        {{ t('dashboard.sections.plugins.form.iconRemove') }}
                      </FlatButton>
                      <p class="max-w-xs leading-relaxed">
                        {{ t('dashboard.sections.plugins.form.iconHelp') }}
                      </p>
                    </div>
                  </div>
                </div>
                <label
                  v-if="mode === 'create'"
                  class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2"
                >
                  {{ t('dashboard.sections.plugins.form.packageUpload') }}
                  <TxFileUploader
                    v-model="packageFilesModel"
                    :multiple="false"
                    :max="1"
                    accept=".tpex"
                    :button-text="t('dashboard.sections.plugins.form.packageUpload')"
                    :drop-text="t('dashboard.sections.plugins.packageAwaiting')"
                    :hint-text="t('dashboard.sections.plugins.form.packageHelp')"
                    @change="handlePackageChange"
                  />
                  <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
                    {{ t('dashboard.sections.plugins.form.packageHelp') }}
                  </span>
                  <span
                    v-if="pluginPackageFileName"
                    class="text-[11px] font-medium normal-case text-black/60 dark:text-light/60"
                  >
                    {{ pluginPackageFileName }}
                  </span>
                </label>
                <div
                  v-if="mode === 'create'"
                  class="md:col-span-2 rounded-2xl border border-primary/10 bg-dark/5 p-4 text-xs text-black/70 dark:border-light/20 dark:bg-light/10 dark:text-light/70"
                >
                  <p class="font-semibold uppercase tracking-wide">
                    {{ t('dashboard.sections.plugins.manifestPreview') }}
                  </p>
                  <p class="mt-1 text-[11px]">
                    {{ t('dashboard.sections.plugins.readmePreviewServer') }}
                  </p>
                  <p v-if="pluginPackageLoading" class="mt-2 text-[11px]">
                    {{ t('dashboard.sections.plugins.previewLoading') }}
                  </p>
                  <p v-else-if="pluginPackageError" class="mt-2 text-[11px] text-red-500">
                    {{ pluginPackageError }}
                  </p>
                  <template v-else>
                    <div v-if="pluginManifestPreview" class="mt-3 space-y-2 text-[11px] leading-relaxed">
                      <p v-if="pluginManifestPreview.id">
                        <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.id') }}:</span>
                        {{ pluginManifestPreview.id }}
                      </p>
                      <p v-if="pluginManifestPreview.name">
                        <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.name') }}:</span>
                        {{ pluginManifestPreview.name }}
                      </p>
                      <p v-if="pluginManifestPreview.version">
                        <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.version') }}:</span>
                        {{ pluginManifestPreview.version }}
                      </p>
                      <p v-if="pluginManifestPreview.description">
                        <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.description') }}:</span>
                        {{ pluginManifestPreview.description }}
                      </p>
                      <p v-if="pluginManifestPreview.homepage">
                        <span class="font-semibold">{{ t('dashboard.sections.plugins.previewFields.homepage') }}:</span>
                        {{ pluginManifestPreview.homepage }}
                      </p>
                      <details class="group rounded-lg border border-primary/10 bg-white/50 p-2 text-black dark:border-light/20 dark:bg-dark/40 dark:text-light">
                        <summary class="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-black/70 transition group-open:text-black dark:text-light/70 dark:group-open:text-light">
                          {{ t('dashboard.sections.plugins.manifestRaw') }}
                        </summary>
                        <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 font-mono text-[10px] text-black dark:bg-white/10 dark:text-light">
                          {{ JSON.stringify(pluginManifestPreview, null, 2) }}
                        </pre>
                      </details>
                    </div>
                    <p v-else-if="pluginPackageFileName" class="mt-3 text-[11px]">
                      {{ t('dashboard.sections.plugins.noManifest') }}
                    </p>
                    <p v-else class="mt-3 text-[11px] text-black/50 dark:text-light/60">
                      {{ t('dashboard.sections.plugins.packageAwaiting') }}
                    </p>
                    <div class="mt-4 border-t border-primary/10 pt-3 dark:border-light/20">
                      <p class="font-semibold uppercase tracking-wide">
                        {{ t('dashboard.sections.plugins.readmePreview') }}
                      </p>
                      <div v-if="pluginReadmePreview" class="prose prose-sm mt-2 max-w-none dark:prose-invert">
                        <MDC :value="pluginReadmePreview" />
                      </div>
                      <p v-else-if="pluginPackageFileName" class="mt-2 text-[11px]">
                        {{ t('dashboard.sections.plugins.noReadme') }}
                      </p>
                      <p v-else class="mt-2 text-[11px] text-black/50 dark:text-light/60">
                        {{ t('dashboard.sections.plugins.packageAwaiting') }}
                      </p>
                    </div>
                  </template>
                </div>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.plugins.form.homepage') }}
                  <Input v-model="form.homepage" placeholder="https://github.com/..." />
                </label>
                <div
                  v-if="mode === 'edit'"
                  class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60"
                >
                  {{ t('dashboard.sections.plugins.form.installCount') }}
                  <div class="rounded-xl border border-primary/15 bg-white/70 px-3 py-2 text-sm text-black dark:border-light/20 dark:bg-dark/40 dark:text-light">
                    {{ editingPluginInstallText }}
                  </div>
                </div>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
                  {{ t('dashboard.sections.plugins.form.badges') }}
                  <Input v-model="form.badges" placeholder="featured, stable" />
                </label>
                <label
                  v-if="isAdmin"
                  class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60"
                >
                  <Switch v-model="form.isOfficial" />
                  {{ t('dashboard.sections.plugins.form.isOfficial') }}
                </label>
                <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
                  {{ t('dashboard.sections.plugins.form.readme') }}
                  <Input v-model="form.readme" type="textarea" :rows="8" required />
                  <span class="text-[11px] font-medium normal-case text-black/40 dark:text-light/50">
                    {{ t('dashboard.sections.plugins.form.readmeHelp') }}
                  </span>
                </label>
              </div>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p
                  v-if="error"
                  class="text-xs text-red-500"
                >
                  {{ error }}
                </p>
                <div class="ml-auto flex items-center gap-2">
                  <TxButton variant="ghost" native-type="button" @click="requestClose(close)">
                    {{ t('dashboard.sections.plugins.cancel', 'Cancel') }}
                  </TxButton>
                  <TxButton native-type="submit" :loading="saving">
                    {{ mode === 'create' ? t('dashboard.sections.plugins.createSubmit') : t('dashboard.sections.plugins.updateSubmit') }}
                  </TxButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      </template>
    </FlipDialog>
</template>

<style scoped>
.PluginMetadataOverlay-Panel {
  width: 100%;
  height: min(88dvh, 860px);
  display: flex;
  flex-direction: column;
}

.PluginMetadataOverlay-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.24)) 100%, transparent);
  padding: 20px 24px 14px;
}

.PluginMetadataOverlay-Body {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

</style>
