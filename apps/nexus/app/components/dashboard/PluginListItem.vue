<script setup lang="ts">
import type { DashboardPlugin as Plugin, DashboardPluginVersion as PluginVersion } from '~/types/dashboard-plugin'
import { TxPluginMetaHeader } from '@talex-touch/tuff-business'
import StatusBadge from '~/components/ui/StatusBadge.vue'

interface Props {
  plugin: Plugin
  categoryLabel?: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', plugin: Plugin): void
}>()

const { t } = useI18n()

function statusTone(status: Plugin['status']) {
  switch (status) {
    case 'approved':
      return 'success'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'muted'
  }
}

function channelTone(channel: PluginVersion['channel']) {
  switch (channel) {
    case 'RELEASE':
      return 'success'
    case 'BETA':
      return 'warning'
    default:
      return 'muted'
  }
}

function resolveArtifactTypeLabel(type: Plugin['artifactType']) {
  const artifactType = type ?? 'plugin'
  return t(`dashboard.sections.plugins.form.artifactTypes.${artifactType}`, artifactType)
}
</script>

<template>
  <TxButton variant="bare" block native-type="button" class="group flex w-full items-center gap-4 rounded-2xl bg-white/60 text-left transition-all duration-200 hover:bg-white hover:shadow-md hover:-translate-y-0.5 dark:bg-white/5 dark:hover:bg-white/8" @click="emit('click', plugin)">
    <div class="min-w-0 flex-1">
      <TxPluginMetaHeader
        class="PluginListItem-MetaHeader"
        :title="plugin.name"
        :description="plugin.summary || plugin.slug"
        :icon-url="plugin.iconUrl"
        :icon-alt="plugin.name"
        :official="false"
      >
        <template #title-extra>
          <span
            v-if="plugin.isOfficial"
            class="PluginListItem-OfficialMark i-carbon-certificate shrink-0 text-sm"
            :title="t('dashboard.sections.plugins.officialBadge')"
          />
        </template>
      </TxPluginMetaHeader>
    </div>

    <!-- Status -->
    <div class="hidden shrink-0 sm:block">
      <StatusBadge
        :text="t(`dashboard.sections.plugins.statuses.${plugin.status}`)"
        :status="statusTone(plugin.status)"
        size="sm"
      />
    </div>

    <!-- Version -->
    <div class="hidden shrink-0 md:block">
      <template v-if="plugin.latestVersion">
        <StatusBadge
          :text="`v${plugin.latestVersion.version}`"
          :status="channelTone(plugin.latestVersion.channel)"
          size="sm"
        />
      </template>
      <span v-else class="text-xs text-black/20 dark:text-white/20">—</span>
    </div>

    <!-- Category -->
    <div class="hidden shrink-0 lg:block">
      <span class="text-xs text-black/35 dark:text-white/35">
        {{ resolveArtifactTypeLabel(plugin.artifactType) }} · {{ categoryLabel || plugin.category }}
      </span>
    </div>
  </TxButton>
</template>

<style scoped>
:deep(.PluginListItem-MetaHeader.TxPluginMetaHeader) {
  align-items: center;
  gap: 12px;
}

:deep(.PluginListItem-MetaHeader .TxPluginMetaHeader-Icon) {
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

:deep(.PluginListItem-MetaHeader .TxPluginMetaHeader-Title) {
  font-size: 0.95rem;
  line-height: 1.2;
}

:deep(.PluginListItem-MetaHeader .TxPluginMetaHeader-Description) {
  margin-top: 2px;
  font-size: 0.75rem;
}

:deep(.PluginListItem-MetaHeader .TxPluginMetaHeader-MetaRow),
:deep(.PluginListItem-MetaHeader .TxPluginMetaHeader-Badges) {
  display: none;
}

.PluginListItem-OfficialMark {
  color: color-mix(in srgb, var(--tx-color-warning, #f59e0b) 88%, transparent);
}
</style>
