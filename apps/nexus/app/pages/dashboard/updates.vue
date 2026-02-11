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
const { user } = useAuthUser()

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
  return user.value?.role === 'admin'
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

// Delete confirmation
const deleteConfirmVisible = ref(false)
const pendingDeleteUpdate = ref<DashboardUpdate | null>(null)

function deleteUpdateItem(update: DashboardUpdate) {
  pendingDeleteUpdate.value = update
  deleteConfirmVisible.value = true
}

async function confirmDeleteUpdate(): Promise<boolean> {
  if (!pendingDeleteUpdate.value)
    return true
  try {
    await $fetch(`/api/dashboard/updates/${pendingDeleteUpdate.value.id}`, { method: 'DELETE' })
    await refreshUpdates()
  }
  catch (error: unknown) {
    console.error('Failed to delete update:', error)
  }
  finally {
    pendingDeleteUpdate.value = null
  }
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteUpdate.value = null
}
</script>

<template>
  <section class="mx-auto max-w-5xl apple-card-lg p-6">
    <!-- Header -->
    <div>
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.updates.title') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.updates.subtitle') }}
      </p>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
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

    <!-- Loading -->
    <div v-if="updatesPending" class="mt-4 space-y-3 py-6">
      <div class="flex items-center justify-center">
        <TxSpinner :size="18" />
      </div>
      <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
        <TxSkeleton :loading="true" :lines="2" />
      </div>
      <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
        <TxSkeleton :loading="true" :lines="2" />
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!updates.length"
      class="mt-4 rounded-2xl border border-dashed border-black/[0.08] py-8 text-center text-sm text-black/40 dark:border-white/[0.08] dark:text-white/40"
    >
      {{ t('dashboard.sections.updates.empty') }}
    </div>

    <!-- List -->
    <ul v-else class="mt-5 space-y-3">
      <li
        v-for="update in updates"
        :key="update.id"
        class="group relative rounded-2xl bg-black/[0.02] p-4 transition-all duration-200 hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs text-black/40 dark:text-white/40">
                {{ formatDate(update.timestamp) }}
              </span>
              <span
                v-for="tag in update.tags.slice(0, 2)"
                :key="tag"
                class="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-black/60 dark:bg-white/[0.08] dark:text-white/60"
              >
                {{ tag }}
              </span>
            </div>
            <a
              :href="update.link"
              target="_blank"
              rel="noopener"
              class="mt-1.5 block text-sm font-medium text-black transition hover:text-primary dark:text-white"
            >
              {{ update.title }}
            </a>
            <p class="mt-1 line-clamp-2 text-sm text-black/50 dark:text-white/50">
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

    <!-- Delete Confirmation Dialog -->
    <TxBottomDialog
      v-if="deleteConfirmVisible"
      :title="t('dashboard.sections.updates.deleteTitle', 'Delete Update')"
      :message="t('dashboard.sections.updates.confirmDelete', { title: pendingDeleteUpdate?.title })"
      :btns="[
        { content: t('dashboard.sections.updates.cancel', 'Cancel'), type: 'info', onClick: () => true },
        { content: t('dashboard.sections.updates.delete', 'Delete'), type: 'error', onClick: confirmDeleteUpdate },
      ]"
      :close="closeDeleteConfirm"
    />
  </section>
</template>
