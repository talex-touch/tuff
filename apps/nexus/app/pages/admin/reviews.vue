<script setup lang="ts">
import type { CommentQueue } from '~/utils/admin-comments'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { computed, ref } from 'vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import DocCommentsPanel from '~/components/admin/DocCommentsPanel.vue'
import PluginReviewsPanel from '~/components/admin/PluginReviewsPanel.vue'
import { useAdminQueryState } from '~/composables/useAdminQueryState'
import { COMMENT_QUEUES } from '~/utils/admin-comments'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have.
const { t } = useI18n()

// The two queues are one page addressed by `?tab=plugins|docs`. Only the open
// queue is mounted — the doc queue's engagement tracker counts the time it is
// open — and each keeps its own page and filters in the URL under its own
// prefix (`p_` / `d_`), so leaving a queue and coming back lands where it was.
const activeQueue = useAdminQueryState<CommentQueue>('tab', COMMENT_QUEUES, 'plugins')

function selectQueue(value: unknown) {
  if ((COMMENT_QUEUES as readonly unknown[]).includes(value))
    activeQueue.value = value as CommentQueue
}

const pluginsPanel = ref<InstanceType<typeof PluginReviewsPanel> | null>(null)
const docsPanel = ref<InstanceType<typeof DocCommentsPanel> | null>(null)
const activePanel = computed(() => (activeQueue.value === 'plugins' ? pluginsPanel.value : docsPanel.value))
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.comments', 'Comments')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="!activePanel || activePanel.busy" @click="activePanel?.refresh()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <template #nav>
      <TxFlatRadio
        :model-value="activeQueue"
        size="md"
        :aria-label="t('dashboard.sections.comments.queueLabel', 'Comment queue')"
        @update:model-value="selectQueue"
      >
        <TxFlatRadioItem value="plugins" :label="t('dashboard.sections.comments.plugins', 'Plugin Reviews')" icon="i-carbon-chat" />
        <TxFlatRadioItem value="docs" :label="t('dashboard.sections.comments.docs', 'Document Comments')" icon="i-carbon-annotation-visibility" />
      </TxFlatRadio>
    </template>

    <PluginReviewsPanel v-if="activeQueue === 'plugins'" ref="pluginsPanel" />
    <DocCommentsPanel v-else ref="docsPanel" />
  </AdminPageShell>
</template>
