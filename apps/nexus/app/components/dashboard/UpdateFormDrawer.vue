<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { reactive, ref, useId, watch } from 'vue'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
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

/**
 * Create / edit an update. The drawer is the console's detail drawer (520px, the
 * business title in the drawer's own heading); every field has a real label, and
 * a failed save shows the server's own message, never the transport's
 * `[POST] "/api/…"` text.
 */
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

const baseId = useId()
const fieldId = (name: string) => `${baseId}-${name}`

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

/**
 * `TuffSelect` takes no id, so a `<label for>` cannot reach it: point its
 * combobox at the visible label instead, as `AdminFilterField` does.
 */
function labelCombobox(container: Element | ComponentPublicInstance | null, labelId: string) {
  if (!(container instanceof HTMLElement))
    return
  const control = container.querySelector<HTMLElement>('[role="combobox"]')
  if (control && !control.hasAttribute('aria-labelledby'))
    control.setAttribute('aria-labelledby', labelId)
}

function close() {
  if (!saving.value)
    emit('close')
}

async function submit() {
  if (saving.value)
    return
  error.value = null

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

  if (!resolvedTitle.zh && !resolvedTitle.en) {
    error.value = t('dashboard.sections.updates.form.titleRequired', 'Title is required.')
    return
  }

  if (!resolvedSummary.zh && !resolvedSummary.en) {
    error.value = t('dashboard.sections.updates.form.summaryRequired', 'Summary is required.')
    return
  }

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

  saving.value = true
  try {
    await requestJson(endpoint, { method, body: payload })
    emit('saved')
    emit('close')
  }
  catch (err: unknown) {
    error.value = resolveAdminErrorMessage(err, t('dashboard.sections.updates.errors.unknown', 'Something went wrong while saving the update.'))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <TxDrawer
    :visible="open"
    :title="mode === 'create' ? t('dashboard.sections.updates.addButton', 'New update') : t('dashboard.sections.updates.editButton', 'Edit update')"
    size="520px"
    :close-on-click-mask="!saving"
    :close-on-press-escape="!saving"
    @update:visible="(visible) => {
      if (!visible)
        close()
    }"
  >
    <form class="UpdateForm" @submit.prevent="submit">
      <div class="UpdateForm-Row">
        <div :ref="(el) => labelCombobox(el, fieldId('type-label'))" class="UpdateForm-Field">
          <span :id="fieldId('type-label')" class="UpdateForm-Label">
            {{ t('dashboard.sections.updates.form.type', 'Update type') }}
          </span>
          <TuffSelect v-model="form.type">
            <TuffSelectItem value="news" :label="t('dashboard.sections.updates.form.typeNews', 'News')" />
            <TuffSelectItem value="announcement" :label="t('dashboard.sections.updates.form.typeAnnouncement', 'Announcement')" />
            <TuffSelectItem value="config" :label="t('dashboard.sections.updates.form.typeConfig', 'Config')" />
            <TuffSelectItem value="data" :label="t('dashboard.sections.updates.form.typeData', 'Data')" />
          </TuffSelect>
        </div>
        <div :ref="(el) => labelCombobox(el, fieldId('scope-label'))" class="UpdateForm-Field">
          <span :id="fieldId('scope-label')" class="UpdateForm-Label">
            {{ t('dashboard.sections.updates.form.scope', 'Scope') }}
          </span>
          <TuffSelect v-model="form.scope">
            <TuffSelectItem value="web" :label="t('dashboard.sections.updates.form.scopeWeb', 'Web')" />
            <TuffSelectItem value="system" :label="t('dashboard.sections.updates.form.scopeSystem', 'System')" />
            <TuffSelectItem value="both" :label="t('dashboard.sections.updates.form.scopeBoth', 'Web + System')" />
          </TuffSelect>
        </div>
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('channels')">
          {{ t('dashboard.sections.updates.form.channels', 'Channels (optional)') }}
        </label>
        <TuffInput
          :id="fieldId('channels')"
          v-model="form.channels"
          type="text"
          :placeholder="t('dashboard.sections.updates.form.channelsPlaceholder', 'RELEASE, BETA, SNAPSHOT')"
        />
      </div>

      <div class="UpdateForm-Row">
        <div class="UpdateForm-Field">
          <label class="UpdateForm-Label" :for="fieldId('title-zh')">
            {{ t('dashboard.sections.updates.form.titleZh', 'Title (ZH)') }}
          </label>
          <TuffInput :id="fieldId('title-zh')" v-model="form.titleZh" type="text" />
        </div>
        <div class="UpdateForm-Field">
          <label class="UpdateForm-Label" :for="fieldId('title-en')">
            {{ t('dashboard.sections.updates.form.titleEn', 'Title (EN)') }}
          </label>
          <TuffInput :id="fieldId('title-en')" v-model="form.titleEn" type="text" />
        </div>
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('date')">
          {{ t('dashboard.sections.updates.form.date', 'Published on') }}
        </label>
        <TuffInput :id="fieldId('date')" v-model="form.timestamp" type="date" required />
      </div>

      <div class="UpdateForm-Row">
        <div class="UpdateForm-Field">
          <label class="UpdateForm-Label" :for="fieldId('summary-zh')">
            {{ t('dashboard.sections.updates.form.summaryZh', 'Summary (ZH)') }}
          </label>
          <TuffInput :id="fieldId('summary-zh')" v-model="form.summaryZh" type="textarea" :rows="4" />
        </div>
        <div class="UpdateForm-Field">
          <label class="UpdateForm-Label" :for="fieldId('summary-en')">
            {{ t('dashboard.sections.updates.form.summaryEn', 'Summary (EN)') }}
          </label>
          <TuffInput :id="fieldId('summary-en')" v-model="form.summaryEn" type="textarea" :rows="4" />
        </div>
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('tags')">
          {{ t('dashboard.sections.updates.form.tags', 'Tags (comma separated)') }}
        </label>
        <TuffInput :id="fieldId('tags')" v-model="form.tags" type="text" placeholder="release, roadmap" />
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('link')">
          {{ t('dashboard.sections.updates.form.link', 'External link') }}
        </label>
        <TuffInput :id="fieldId('link')" v-model="form.link" type="text" placeholder="https://" required />
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('payload')">
          {{ t('dashboard.sections.updates.form.payload', 'Payload (JSON, optional)') }}
        </label>
        <TuffInput
          :id="fieldId('payload')"
          v-model="form.payload"
          type="textarea"
          :rows="6"
          :placeholder="t('dashboard.sections.updates.form.payloadPlaceholder', 'example: kind=fx-rate, rates: CNY=7.23')"
        />
      </div>

      <div class="UpdateForm-Field">
        <label class="UpdateForm-Label" :for="fieldId('payload-version')">
          {{ t('dashboard.sections.updates.form.payloadVersion', 'Payload version (optional)') }}
        </label>
        <TuffInput
          :id="fieldId('payload-version')"
          v-model="form.payloadVersion"
          type="text"
          :placeholder="t('dashboard.sections.updates.form.payloadVersionPlaceholder', '20260219-1')"
        />
      </div>

      <TxAlert v-if="error" type="error" :message="error" />
    </form>

    <template #footer>
      <div class="UpdateForm-Actions">
        <TxButton variant="secondary" size="sm" :disabled="saving" @click="close">
          {{ t('dashboard.sections.updates.closeButton', 'Close') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="saving" @click="submit">
          {{ mode === 'create' ? t('dashboard.sections.updates.createSubmit', 'Publish update') : t('dashboard.sections.updates.updateSubmit', 'Save changes') }}
        </TxButton>
      </div>
    </template>
  </TxDrawer>
</template>

<style scoped>
.UpdateForm {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Two fields side by side while the drawer is wide enough for both, one under
   the other on a phone's bottom sheet. */
.UpdateForm-Row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px 16px;
}

.UpdateForm-Field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* A label is read: 13px, regular ink, no tracking (tuffex-design-rules). */
.UpdateForm-Label {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.UpdateForm-Actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
