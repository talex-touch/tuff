<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/Button.vue'

defineI18nRoute(false)

const { t } = useI18n()
const { data: summary, pending, refresh } = useFetch<any>('/api/credits/summary')
const handleRefresh = () => refresh()

const teamName = computed(() => t('dashboard.team.personal', '个人团队'))
const teamQuota = computed(() => summary.value?.team?.quota ?? 0)
const teamUsed = computed(() => summary.value?.team?.used ?? 0)
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.sections.team.title', '团队管理') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.sections.team.subtitle', '团队功能暂未开放，当前使用个人团队') }}
      </p>
    </header>

    <section class="rounded-3xl border border-primary/10 bg-white/70 p-6 shadow-sm dark:border-light/10 dark:bg-dark/60">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs text-black/50 dark:text-light/60">
            {{ t('dashboard.sections.team.currentTeam', '当前团队') }}
          </p>
          <h2 class="text-lg text-black font-semibold dark:text-light">
            {{ teamName }}
          </h2>
        </div>
        <Button size="small" variant="secondary" @click="handleRefresh">
          {{ t('common.refresh', '刷新') }}
        </Button>
      </div>

      <div v-if="pending" class="mt-4 flex items-center justify-center py-4">
        <span class="i-carbon-circle-dash animate-spin text-primary" />
      </div>

      <div v-else class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="rounded-2xl border border-primary/10 bg-white/80 p-4 dark:border-light/10 dark:bg-dark/50">
          <p class="text-xs text-black/60 dark:text-light/70">
            {{ t('dashboard.sections.team.pool', '团队池额度') }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-black dark:text-light">
            {{ teamQuota - teamUsed }}
          </p>
          <p class="text-xs text-black/50 dark:text-light/60">
            {{ t('dashboard.sections.team.used', { n: teamUsed }) }}
          </p>
        </div>
        <div class="rounded-2xl border border-primary/10 bg-white/80 p-4 dark:border-light/10 dark:bg-dark/50">
          <p class="text-xs text-black/60 dark:text-light/70">
            {{ t('dashboard.sections.team.status', '团队状态') }}
          </p>
          <p class="mt-2 text-sm text-black/70 dark:text-light/70">
            {{ t('dashboard.sections.team.comingSoon', '团队管理与成员邀请将在后续版本开放') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
