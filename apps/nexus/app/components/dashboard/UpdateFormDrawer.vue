<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

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
const drawerRef = ref<HTMLElement | null>(null)

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

onClickOutside(drawerRef, () => {
  if (props.open)
    emit('close')
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
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm dark:bg-black/40"
      />
    </Transition>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="open"
        ref="drawerRef"
        class="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ mode === 'create' ? t('dashboard.sections.updates.addButton') : t('dashboard.sections.updates.editButton') }}
            </h3>
            <button
              class="flex size-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              @click="emit('close')"
            >
              <span class="i-carbon-close text-base" />
            </button>
          </div>

          <form class="flex-1 space-y-4 overflow-y-auto p-4" @submit.prevent="submit">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('dashboard.sections.updates.form.title') }}
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                class="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              >
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('dashboard.sections.updates.form.date') }}
              </label>
              <input
                v-model="form.timestamp"
                type="date"
                required
                class="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              >
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('dashboard.sections.updates.form.summary') }}
              </label>
              <textarea
                v-model="form.summary"
                rows="4"
                required
                class="w-full resize-none rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('dashboard.sections.updates.form.tags') }}
              </label>
              <input
                v-model="form.tags"
                type="text"
                placeholder="release, roadmap"
                class="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              >
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('dashboard.sections.updates.form.link') }}
              </label>
              <input
                v-model="form.link"
                type="url"
                placeholder="https://"
                required
                class="w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-white"
              >
            </div>

            <p v-if="error" class="rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {{ error }}
            </p>
          </form>

          <div class="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              @click="emit('close')"
            >
              {{ t('dashboard.sections.updates.closeButton') }}
            </button>
            <button
              type="button"
              :disabled="saving"
              class="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              @click="submit"
            >
              <span v-if="saving" class="i-carbon-circle-dash mr-1 animate-spin" />
              {{ mode === 'create' ? t('dashboard.sections.updates.createSubmit') : t('dashboard.sections.updates.updateSubmit') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
