<script setup lang="ts">
import { computed, watch } from 'vue'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import DocCommentsPanel from '~/components/admin/DocCommentsPanel.vue'
import PluginReviewsPanel from '~/components/admin/PluginReviewsPanel.vue'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

type CommentTab = 'plugins' | 'docs'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { user } = useAuthUser()
const { isAdmin } = useAccountRole()

const activeTab = computed<CommentTab>({
  get: () => {
    const tab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
    return tab === 'docs' ? 'docs' : 'plugins'
  },
  set: (tab) => {
    if (route.query.tab === tab)
      return
    void router.replace({
      query: {
        ...route.query,
        tab,
      },
    })
  },
})

watch(isAdmin, (admin) => {
  if (user.value && !admin)
    navigateTo('/dashboard/overview')
}, { immediate: true })
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.comments.title', 'Comment Management')">
    <TxTabs
      v-model="activeTab"
      placement="top"
      borderless
      :content-padding="0"
      :content-scrollable="false"
      indicator-variant="pill"
    >
      <TxTabItem name="plugins" icon-class="i-carbon-chat">
        <template #name>
          {{ t('dashboard.sections.comments.plugins', 'Plugin comments') }}
        </template>
        <PluginReviewsPanel />
      </TxTabItem>
      <TxTabItem name="docs" icon-class="i-carbon-annotation-visibility">
        <template #name>
          {{ t('dashboard.sections.comments.docs', 'Doc comments') }}
        </template>
        <DocCommentsPanel />
      </TxTabItem>
    </TxTabs>
  </AdminPageShell>
</template>
