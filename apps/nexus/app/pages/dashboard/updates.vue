<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useDashboardUpdatesData } from '~/composables/useDashboardData'

interface DashboardUpdate {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string[]
  link: string
}

interface UpdateFormState {
  title: string
  summary: string
  tags: string
  link: string
  timestamp: string
}

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useUser()

const { updates, pending: updatesPending, refresh: refreshUpdates } = useDashboardUpdatesData()

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

function formatDate(value?: string) {
  if (!value)
    return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return dateFormatter.value.format(parsed)
}

const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

const todayInput = () => new Date().toISOString().slice(0, 10)

function createUpdateFormState(): UpdateFormState {
  return {
    title: '',
    summary: '',
    tags: '',
    link: '',
    timestamp: todayInput(),
  }
}

const updateForm = reactive(createUpdateFormState())
const showUpdateForm = ref(false)
const updateFormMode = ref<'create' | 'edit'>('create')
const editingUpdateId = ref<string | null>(null)
const updateSaving = ref(false)
const updateFormError = ref<string | null>(null)

function resetUpdateForm() {
  Object.assign(updateForm, createUpdateFormState())
  editingUpdateId.value = null
  updateFormError.value = null
}

function openCreateUpdateForm() {
  updateFormMode.value = 'create'
  resetUpdateForm()
  showUpdateForm.value = true
}

function openEditUpdateForm(update: DashboardUpdate) {
  updateFormMode.value = 'edit'
  editingUpdateId.value = update.id
  Object.assign(updateForm, {
    title: update.title,
    summary: update.summary,
    tags: update.tags.join(', '),
    link: update.link,
    timestamp: update.timestamp ? update.timestamp.slice(0, 10) : todayInput(),
  })
  showUpdateForm.value = true
}

function closeUpdateForm() {
  showUpdateForm.value = false
}

async function submitUpdateForm() {
  updateSaving.value = true
  updateFormError.value = null

  try {
    const timestampIso = updateForm.timestamp
      ? new Date(`${updateForm.timestamp}T00:00:00Z`).toISOString()
      : new Date().toISOString()

    const tags = updateForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)

    const payload = {
      title: updateForm.title.trim(),
      summary: updateForm.summary.trim(),
      link: updateForm.link.trim(),
      tags,
      timestamp: timestampIso,
    }

    const endpoint = editingUpdateId.value
      ? `/api/dashboard/updates/${editingUpdateId.value}`
      : '/api/dashboard/updates'
    const method = editingUpdateId.value ? 'PATCH' : 'POST'

    await $fetch(endpoint, {
      method,
      body: payload,
    })

    await refreshUpdates()
    closeUpdateForm()
    resetUpdateForm()
  }
  catch (error: unknown) {
    updateFormError.value = error instanceof Error ? error.message : t('dashboard.sections.updates.errors.unknown')
  }
  finally {
    updateSaving.value = false
  }
}

async function deleteUpdateItem(update: DashboardUpdate) {
  if (import.meta.client) {
    const confirmed = window.confirm(t('dashboard.sections.updates.confirmDelete', { title: update.title }))
    if (!confirmed)
      return
  }

  try {
    await $fetch(`/api/dashboard/updates/${update.id}`, {
      method: 'DELETE',
    })

    await refreshUpdates()
  }
  catch (error: unknown) {
    updateFormError.value = error instanceof Error ? error.message : t('dashboard.sections.updates.errors.unknown')
  }
}
</script>

<template>
  <section class="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/70">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.updates.title') }}
        </h2>
        <p class="mt-1 text-sm text-black/70 dark:text-light/80">
          {{ t('dashboard.sections.updates.subtitle') }}
        </p>
      </div>
      <a
        href="https://docs.tuff.chat/changelog"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-medium text-black transition hover:border-primary/40 hover:bg-dark/5 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
      >
        <span class="i-carbon-news text-base" />
        {{ t('dashboard.sections.updates.cta') }}
      </a>
    </div>

    <div
      v-if="isAdmin"
      class="mt-6 rounded-2xl border border-dashed border-primary/20 bg-white/70 p-4 text-sm text-black dark:border-light/20 dark:bg-dark/50 dark:text-light"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-black dark:text-light">
            {{ t('dashboard.sections.updates.manageTitle') }}
          </h3>
          <p class="text-xs text-black/60 dark:text-light/70">
            {{ t('dashboard.sections.updates.manageSubtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black transition hover:border-primary/30 hover:bg-dark/20 dark:border-light/30 dark:bg-light/10 dark:text-light"
            @click="openCreateUpdateForm"
          >
            <span class="i-carbon-add text-base" />
            {{ t('dashboard.sections.updates.addButton') }}
          </button>
          <button
            v-if="showUpdateForm"
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-transparent bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/70 transition hover:bg-dark/15 dark:bg-light/10 dark:text-light/70 dark:hover:bg-light/15"
            @click="closeUpdateForm"
          >
            <span class="i-carbon-close text-base" />
            {{ t('dashboard.sections.updates.closeButton') }}
          </button>
        </div>
      </div>

      <form
        v-if="showUpdateForm"
        class="mt-4 space-y-4"
        @submit.prevent="submitUpdateForm"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.updates.form.title') }}
            <input
              v-model="updateForm.title"
              type="text"
              required
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.updates.form.date') }}
            <input
              v-model="updateForm.timestamp"
              type="date"
              required
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60 md:col-span-2">
            {{ t('dashboard.sections.updates.form.summary') }}
            <textarea
              v-model="updateForm.summary"
              rows="3"
              required
              class="resize-y rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            ></textarea>
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.updates.form.tags') }}
            <input
              v-model="updateForm.tags"
              type="text"
              placeholder="release, roadmap"
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
          </label>
          <label class="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-light/60">
            {{ t('dashboard.sections.updates.form.link') }}
            <input
              v-model="updateForm.link"
              type="url"
              required
              placeholder="https://"
              class="rounded-xl border border-primary/15 bg-white/90 px-3 py-2 text-sm text-black outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 dark:border-light/20 dark:bg-dark/40 dark:text-light"
            >
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p
            v-if="updateFormError"
            class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200"
          >
            {{ updateFormError }}
          </p>
          <button
            type="submit"
            class="inline-flex items-center gap-2 rounded-full bg-dark px-4 py-2 text-sm font-semibold text-white shadow-primary/40 transition hover:bg-dark/90 disabled:pointer-events-none disabled:opacity-60 dark:bg-light dark:text-black dark:hover:bg-light/90"
            :disabled="updateSaving"
          >
            <span class="i-carbon-checkmark text-base" />
            {{ updateFormMode === 'create' ? t('dashboard.sections.updates.createSubmit') : t('dashboard.sections.updates.updateSubmit') }}
          </button>
        </div>
      </form>
    </div>

    <div class="mt-6 space-y-4">
      <div
        v-if="updatesPending"
        class="flex items-center gap-3 rounded-2xl border border-dashed border-primary/20 bg-dark/5 px-4 py-6 text-sm text-black/60 dark:border-light/20 dark:bg-light/5 dark:text-light/70"
      >
        <span class="i-carbon-circle-dash animate-spin text-base" />
        <span>{{ t('dashboard.sections.updates.loading') }}</span>
      </div>

      <div
        v-else-if="!updates.length"
        class="rounded-2xl border border-dashed border-primary/15 bg-white/70 px-4 py-6 text-sm text-black/60 dark:border-light/20 dark:bg-dark/60 dark:text-light/70"
      >
        {{ t('dashboard.sections.updates.empty') }}
      </div>

      <ul
        v-else
        class="space-y-4"
      >
        <li
          v-for="update in updates"
          :key="update.id"
          class="group relative rounded-2xl border border-primary/10 bg-white/70 p-5 transition hover:border-primary/30 hover:shadow-lg dark:border-light/10 dark:bg-dark/60"
        >
          <div
            v-if="isAdmin"
            class="absolute right-4 top-4 flex items-center gap-2"
          >
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-white/80 text-black/70 transition hover:border-primary/40 hover:text-black dark:border-light/20 dark:bg-dark/40 dark:text-light/70"
              @click.stop="openEditUpdateForm(update)"
            >
              <span class="i-carbon-edit text-sm" />
            </button>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500 transition hover:border-red-300 hover:text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
              @click.stop="deleteUpdateItem(update)"
            >
              <span class="i-carbon-trash-can text-sm" />
            </button>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-widest text-black/60 dark:text-light/60">
                {{ formatDate(update.timestamp) }}
              </p>
              <h3 class="mt-1 text-base font-semibold text-black dark:text-light">
                {{ update.title }}
              </h3>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-[11px] font-medium text-black/60 dark:text-light/60">
              <span
                v-for="tag in update.tags"
                :key="tag"
                class="inline-flex items-center gap-1 rounded-full bg-dark/5 px-3 py-1 text-black/70 dark:bg-light/10 dark:text-light/70"
              >
                <span class="i-carbon-tag text-sm" />
                {{ tag }}
              </span>
            </div>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-black/70 dark:text-light/80">
            {{ update.summary }}
          </p>
          <a
            :href="update.link"
            target="_blank"
            rel="noopener"
            class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-black transition hover:text-black/80 dark:text-light dark:hover:text-light/80"
          >
            {{ t('dashboard.sections.updates.readMore') }}
            <span class="i-carbon-arrow-up-right text-base" />
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>
