<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton } from '@talex-touch/tuffex'
import Drawer from '~/components/ui/Drawer.vue'
import { requestJson } from '~/utils/request'

interface UpdateFormState {
  type: 'news' | 'announcement' | 'config' | 'data'
  scope: 'web' | 'system' | 'both'
  channels: string
  titleZh: string
  titleEn: string
  summaryZh: string
  summaryEn: string
  tags: string
  link: string
  timestamp: string
  payload: string
  payloadVersion: string
}

interface LocalizedText {
  zh: string
  en: string
}

interface DashboardUpdate {
  id: string
  type: 'news' | 'release' | 'announcement' | 'config' | 'data'
  scope: 'web' | 'system' | 'both'
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
  payloadUrl?: string | null
}

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  update?: DashboardUpdate | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useI18n()

const saving = ref(false)
const error = ref<string | null>(null)

const todayInput = () => new Date().toISOString().slice(0, 10)

const form = reactive<UpdateFormState>({
  type: 'news',
  scope: 'web',
  channels: '',
  titleZh: '',
  titleEn: '',
  summaryZh: '',
  summaryEn: '',
  tags: '',
  link: '',
  timestamp: todayInput(),
  payload: '',
  payloadVersion: '',
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    error.value = null
    if (props.mode === 'edit' && props.update) {
      form.type = props.update.type === 'release' ? 'news' : props.update.type
      form.scope = props.update.scope ?? 'web'
      form.channels = (props.update.channels || []).join(', ')
      form.titleZh = (props.update.title as unknown as LocalizedText)?.zh || (props.update.title as unknown as LocalizedText)?.en || ''
      form.titleEn = (props.update.title as unknown as LocalizedText)?.en || (props.update.title as unknown as LocalizedText)?.zh || ''
      form.summaryZh = (props.update.summary as unknown as LocalizedText)?.zh || (props.update.summary as unknown as LocalizedText)?.en || ''
      form.summaryEn = (props.update.summary as unknown as LocalizedText)?.en || (props.update.summary as unknown as LocalizedText)?.zh || ''
      form.tags = props.update.tags.join(', ')
      form.link = props.update.link
      form.timestamp = props.update.timestamp?.slice(0, 10) || todayInput()
      form.payload = ''
      form.payloadVersion = ''
    }
    else {
      form.type = 'news'
      form.scope = 'web'
      form.channels = ''
      form.titleZh = ''
      form.titleEn = ''
      form.summaryZh = ''
      form.summaryEn = ''
      form.tags = ''
      form.link = ''
      form.timestamp = todayInput()
      form.payload = ''
      form.payloadVersion = ''
    }
  }
})

async function submit() {
  saving.value = true
  error.value = null

  try {
    const timestampIso = form.timestamp
      ? new Date(`${form.timestamp}T00:00:00Z`).toISOString()
      : new Date().toISOString()

    const tags = form.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)

    const channels = form.channels
      .split(',')
      .map(channel => channel.trim().toUpperCase())
      .filter(Boolean)

    const titleZh = form.titleZh.trim()
    const titleEn = form.titleEn.trim()
    const summaryZh = form.summaryZh.trim()
    const summaryEn = form.summaryEn.trim()

    const resolvedTitle = {
      zh: titleZh || titleEn,
      en: titleEn || titleZh,
    }
    const resolvedSummary = {
      zh: summaryZh || summaryEn,
      en: summaryEn || summaryZh,
    }

    if (!resolvedTitle.zh && !resolvedTitle.en)
      throw new Error(t('dashboard.sections.updates.form.titleRequired', 'Title is required.'))

    if (!resolvedSummary.zh && !resolvedSummary.en)
      throw new Error(t('dashboard.sections.updates.form.summaryRequired', 'Summary is required.'))

    const payload: Record<string, unknown> = {
      type: form.type,
      scope: form.scope,
      channels,
      title: resolvedTitle,
      summary: resolvedSummary,
      link: form.link.trim(),
      tags,
      timestamp: timestampIso,
    }

    if (form.payload.trim())
      payload.payload = form.payload.trim()
    if (form.payloadVersion.trim())
      payload.payloadVersion = form.payloadVersion.trim()

    const endpoint = props.mode === 'edit' && props.update
      ? `/api/dashboard/updates/${props.update.id}`
      : '/api/dashboard/updates'
    const method = props.mode === 'edit' ? 'PATCH' : 'POST'

    await requestJson(endpoint, { method, body: payload })
    emit('saved')
    emit('close')
  }
  catch (err: unknown) {
    error.value = err instanceof Error ? err.message : t('dashboard.sections.updates.errors.unknown')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <Drawer
    :visible="open"
    width="420px"
    @update:visible="(v) => {
      if (!v)
        emit('close')
    }"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-black/5 pb-3 dark:border-white/5">
        <h3 class="text-sm font-semibold text-black dark:text-white">
          {{ mode === 'create' ? t('dashboard.sections.updates.addButton') : t('dashboard.sections.updates.editButton') }}
        </h3>
      </div>

      <form class="flex-1 space-y-4 overflow-y-auto pt-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.type') }}
            </label>
            <TuffSelect v-model="form.type" class="w-full">
              <TuffSelectItem value="news" :label="t('dashboard.sections.updates.form.typeNews')" />
              <TuffSelectItem value="announcement" :label="t('dashboard.sections.updates.form.typeAnnouncement')" />
              <TuffSelectItem value="config" :label="t('dashboard.sections.updates.form.typeConfig')" />
              <TuffSelectItem value="data" :label="t('dashboard.sections.updates.form.typeData')" />
            </TuffSelect>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.scope') }}
            </label>
            <TuffSelect v-model="form.scope" class="w-full">
              <TuffSelectItem value="web" :label="t('dashboard.sections.updates.form.scopeWeb')" />
              <TuffSelectItem value="system" :label="t('dashboard.sections.updates.form.scopeSystem')" />
              <TuffSelectItem value="both" :label="t('dashboard.sections.updates.form.scopeBoth')" />
            </TuffSelect>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.channels') }}
          </label>
          <TuffInput
            v-model="form.channels"
            type="text"
            :placeholder="t('dashboard.sections.updates.form.channelsPlaceholder')"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.titleZh') }}
            </label>
            <TuffInput v-model="form.titleZh" type="text" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.titleEn') }}
            </label>
            <TuffInput v-model="form.titleEn" type="text" />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.date') }}
          </label>
          <TuffInput v-model="form.timestamp" type="date" required />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.summaryZh') }}
            </label>
            <TuffInput v-model="form.summaryZh" type="textarea" :rows="4" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.updates.form.summaryEn') }}
            </label>
            <TuffInput v-model="form.summaryEn" type="textarea" :rows="4" />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.tags') }}
          </label>
          <TuffInput v-model="form.tags" type="text" placeholder="release, roadmap" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.link') }}
          </label>
          <TuffInput v-model="form.link" type="text" placeholder="https://" required />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.payload') }}
          </label>
          <TuffInput
            v-model="form.payload"
            type="textarea"
            :rows="6"
            :placeholder="t('dashboard.sections.updates.form.payloadPlaceholder')"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.payloadVersion') }}
          </label>
          <TuffInput v-model="form.payloadVersion" type="text" :placeholder="t('dashboard.sections.updates.form.payloadVersionPlaceholder')" />
        </div>

        <p v-if="error" class="rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ error }}
        </p>
      </form>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <TxButton variant="secondary" @click="emit('close')">
          {{ t('dashboard.sections.updates.closeButton') }}
        </TxButton>
        <TxButton :disabled="saving" @click="submit">
          <span v-if="saving" class="i-carbon-circle-dash mr-1 animate-spin" />
          {{ mode === 'create' ? t('dashboard.sections.updates.createSubmit') : t('dashboard.sections.updates.updateSubmit') }}
        </TxButton>
      </div>
    </template>
  </Drawer>
</template>
