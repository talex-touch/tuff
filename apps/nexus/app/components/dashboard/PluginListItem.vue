<script setup lang="ts">
import type { DashboardPlugin as Plugin, DashboardPluginVersion as PluginVersion } from '~/types/dashboard-plugin'
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
    <!-- Icon -->
    <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/[0.04] bg-black/[0.03] dark:border-white/[0.06] dark:bg-white/[0.06]">
      <img
        v-if="plugin.iconUrl"
        :src="plugin.iconUrl"
        :alt="plugin.name"
        class="size-full object-cover"
      >
      <span v-else class="text-lg font-semibold text-black/50 dark:text-white/50">
        {{ plugin.name.charAt(0).toUpperCase() }}
      </span>
    </div>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h4 class="truncate text-sm font-medium text-black dark:text-white">
          {{ plugin.name }}
        </h4>
        <span
          v-if="plugin.isOfficial"
          class="i-carbon-certificate shrink-0 text-sm text-amber-500"
          :title="t('dashboard.sections.plugins.officialBadge')"
        />
      </div>
      <p class="truncate text-xs text-black/40 dark:text-white/40">
        {{ plugin.summary || plugin.slug }}
      </p>
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
