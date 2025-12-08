<script setup lang="ts">
interface PluginVersion {
  id: string
  channel: 'SNAPSHOT' | 'BETA' | 'RELEASE'
  version: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

interface Plugin {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  iconUrl?: string | null
  isOfficial: boolean
  installs: number
  latestVersion?: PluginVersion | null
}

interface Props {
  plugin: Plugin
  categoryLabel?: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'click', plugin: Plugin): void
}>()

const { t } = useI18n()

function statusClass(status: Plugin['status']) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'pending':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'rejected':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
  }
}

function channelClass(channel: PluginVersion['channel']) {
  switch (channel) {
    case 'RELEASE':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'BETA':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
  }
}
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-center gap-4 rounded-xl border border-transparent bg-white/60 p-3 text-left transition hover:border-primary/20 hover:bg-white dark:bg-white/5 dark:hover:border-white/10 dark:hover:bg-white/10"
    @click="emit('click', plugin)"
  >
    <!-- Icon -->
    <div class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/10">
      <img
        v-if="plugin.iconUrl"
        :src="plugin.iconUrl"
        :alt="plugin.name"
        class="size-full object-cover"
      >
      <span v-else class="text-lg font-semibold text-black/60 dark:text-white/60">
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
      <p class="truncate text-xs text-black/50 dark:text-white/50">
        {{ plugin.summary || plugin.slug }}
      </p>
    </div>

    <!-- Status -->
    <div class="hidden shrink-0 sm:block">
      <span
        class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        :class="statusClass(plugin.status)"
      >
        {{ t(`dashboard.sections.plugins.statuses.${plugin.status}`) }}
      </span>
    </div>

    <!-- Version -->
    <div class="hidden shrink-0 md:block">
      <template v-if="plugin.latestVersion">
        <span
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          :class="channelClass(plugin.latestVersion.channel)"
        >
          v{{ plugin.latestVersion.version }}
        </span>
      </template>
      <span v-else class="text-xs text-black/30 dark:text-white/30">—</span>
    </div>

    <!-- Category -->
    <div class="hidden shrink-0 lg:block">
      <span class="text-xs text-black/40 dark:text-white/40">
        {{ categoryLabel || plugin.category }}
      </span>
    </div>

    <!-- Arrow -->
    <span class="i-carbon-chevron-right shrink-0 text-black/20 transition group-hover:text-black/40 dark:text-white/20 dark:group-hover:text-white/40" />
  </button>
</template>
