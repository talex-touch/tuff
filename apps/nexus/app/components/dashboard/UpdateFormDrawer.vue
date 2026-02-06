<script setup lang="ts">
import Button from '~/components/ui/Button.vue'
import Drawer from '~/components/ui/Drawer.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Input from '~/components/ui/Input.vue'

interface UpdateFormState {
  title: string
  summary: string
  tags: string
  link: string
  timestamp: string
}

interface DashboardUpdate {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string[]
  link: string
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
  title: '',
  summary: '',
  tags: '',
  link: '',
  timestamp: todayInput(),
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    error.value = null
    if (props.mode === 'edit' && props.update) {
      form.title = props.update.title
      form.summary = props.update.summary
      form.tags = props.update.tags.join(', ')
      form.link = props.update.link
      form.timestamp = props.update.timestamp?.slice(0, 10) || todayInput()
    }
    else {
      form.title = ''
      form.summary = ''
      form.tags = ''
      form.link = ''
      form.timestamp = todayInput()
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

    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      link: form.link.trim(),
      tags,
      timestamp: timestampIso,
    }

    const endpoint = props.mode === 'edit' && props.update
      ? `/api/dashboard/updates/${props.update.id}`
      : '/api/dashboard/updates'
    const method = props.mode === 'edit' ? 'PATCH' : 'POST'

    await $fetch(endpoint, { method, body: payload })
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
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.title') }}
          </label>
          <Input v-model="form.title" type="text" required />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.date') }}
          </label>
          <Input v-model="form.timestamp" type="date" required />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.summary') }}
          </label>
          <Input v-model="form.summary" type="textarea" :rows="4" required />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.tags') }}
          </label>
          <Input v-model="form.tags" type="text" placeholder="release, roadmap" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-black/50 dark:text-white/50">
            {{ t('dashboard.sections.updates.form.link') }}
          </label>
          <Input v-model="form.link" type="text" placeholder="https://" required />
        </div>

        <p v-if="error" class="rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ error }}
        </p>
      </form>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <FlatButton @click="emit('close')">
          {{ t('dashboard.sections.updates.closeButton') }}
        </FlatButton>
        <Button :disabled="saving" @click="submit">
          <span v-if="saving" class="i-carbon-circle-dash mr-1 animate-spin" />
          {{ mode === 'create' ? t('dashboard.sections.updates.createSubmit') : t('dashboard.sections.updates.updateSubmit') }}
        </Button>
      </div>
    </template>
  </Drawer>
</template>
