<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '~/components/ui/Button.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import { useDashboardUpdatesData } from '~/composables/useDashboardData'

interface DashboardUpdate {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string[]
  link: string
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

const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editingUpdate = ref<DashboardUpdate | null>(null)

function openCreate() {
  drawerMode.value = 'create'
  editingUpdate.value = null
  drawerOpen.value = true
}

function openEdit(update: DashboardUpdate) {
  drawerMode.value = 'edit'
  editingUpdate.value = update
  drawerOpen.value = true
}

async function onSaved() {
  await refreshUpdates()
}

async function deleteUpdateItem(update: DashboardUpdate) {
  if (import.meta.client) {
    const confirmed = window.confirm(t('dashboard.sections.updates.confirmDelete', { title: update.title }))
    if (!confirmed)
      return
  }

  await $fetch(`/api/dashboard/updates/${update.id}`, { method: 'DELETE' })
  await refreshUpdates()
}
</script>

<template>
  <section class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('dashboard.sections.updates.title') }}
        </h2>
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {{ t('dashboard.sections.updates.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="isAdmin"
          icon="i-carbon-add"
          size="small"
          @click="openCreate"
        >
          {{ t('dashboard.sections.updates.addButton') }}
        </Button>
        <FlatButton
          icon="i-carbon-news"
          to="https://docs.tuff.chat/changelog"
          target="_blank"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="updatesPending" class="mt-4 flex items-center justify-center py-8">
      <span class="i-carbon-circle-dash h-5 w-5 animate-spin text-gray-400" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="!updates.length"
      class="mt-4 rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      {{ t('dashboard.sections.updates.empty') }}
    </div>

    <!-- List -->
    <ul v-else class="mt-4 divide-y divide-gray-100 dark:divide-gray-700">
      <li
        v-for="update in updates"
        :key="update.id"
        class="group relative py-3 first:pt-0 last:pb-0"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 dark:text-gray-500">
                {{ formatDate(update.timestamp) }}
              </span>
              <span
                v-for="tag in update.tags.slice(0, 2)"
                :key="tag"
                class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {{ tag }}
              </span>
            </div>
            <a
              :href="update.link"
              target="_blank"
              rel="noopener"
              class="mt-1 block text-sm font-medium text-gray-900 hover:text-primary-500 dark:text-white"
            >
              {{ update.title }}
            </a>
            <p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
              {{ update.summary }}
            </p>
          </div>
          <div v-if="isAdmin" class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <FlatButton icon="i-carbon-edit" @click="openEdit(update)" />
            <FlatButton icon="i-carbon-trash-can" @click="deleteUpdateItem(update)" />
          </div>
        </div>
      </li>
    </ul>

    <!-- Drawer -->
    <DashboardUpdateFormDrawer
      :open="drawerOpen"
      :mode="drawerMode"
      :update="editingUpdate"
      @close="drawerOpen = false"
      @saved="onSaved"
    />
  </section>
</template>
