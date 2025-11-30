<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardTeamData } from '~/composables/useDashboardData'

const { t } = useI18n()

const { team, pending: teamPending } = useDashboardTeamData()

defineI18nRoute(false)

const teamStatusLabels = computed<Record<string, string>>(() => ({
  active: t('dashboard.sections.team.memberStatus.active'),
  automation: t('dashboard.sections.team.memberStatus.automation'),
  invited: t('dashboard.sections.team.memberStatus.invited'),
}))

function resolveTeamStatus(status: string) {
  return teamStatusLabels.value[status] ?? status
}
</script>

<template>
  <section class="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/70">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.team.title') }}
        </h2>
        <p class="mt-1 text-sm text-black/70 dark:text-light/80">
          {{ t('dashboard.sections.team.subtitle') }}
        </p>
      </div>
      <a
        href="https://docs.tuff.chat/changelog/teams-preview"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-sm font-medium text-black transition hover:border-primary/40 hover:bg-dark/5 dark:border-light/20 dark:text-light dark:hover:bg-light/10"
      >
        <span class="i-carbon-progress-bar text-base" />
        {{ t('dashboard.sections.team.waitlistCta') }}
      </a>
    </div>

    <div class="mt-6 space-y-4">
      <div
        v-if="teamPending"
        class="flex items-center gap-3 rounded-2xl border border-dashed border-primary/20 bg-dark/5 px-4 py-6 text-sm text-black/60 dark:border-light/20 dark:bg-light/5 dark:text-light/70"
      >
        <span class="i-carbon-circle-dash animate-spin text-base" />
        <span>{{ t('dashboard.sections.team.pending') }}</span>
      </div>

      <div v-else>
        <div
          v-if="team?.organization"
          class="mb-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 to-primary/10 p-5 dark:border-light/15 dark:from-light/5 dark:to-light/10"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <span class="i-carbon-enterprise inline-flex rounded-xl bg-dark/10 p-3 text-2xl text-black dark:bg-light/15 dark:text-light" />
              <div>
                <p class="text-xs uppercase tracking-widest text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.team.organizationLabel', 'Clerk Organization') }}
                </p>
                <h3 class="mt-1 text-lg font-semibold text-black dark:text-light">
                  {{ team.organization.name }}
                </h3>
                <p class="mt-1 text-sm text-black/70 dark:text-light/80">
                  {{ team.organization.role }}
                  <span v-if="team.organization.membersCount !== undefined">
                    · {{ team.organization.membersCount }} {{ team.organization.membersCount === 1 ? 'member' : 'members' }}
                  </span>
                </p>
              </div>
            </div>
            <span class="inline-flex items-center gap-1 rounded-full bg-dark/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black dark:bg-light/10 dark:text-light/80">
              <span class="i-carbon-checkmark text-sm" />
              {{ t('dashboard.sections.team.activeStatus', 'Active') }}
            </span>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div class="rounded-2xl border border-primary/10 bg-white/70 p-4 dark:border-light/10 dark:bg-dark/60">
            <p class="text-xs uppercase tracking-widest text-black/60 dark:text-light/60">
              {{ t('dashboard.sections.team.seatUsage', { used: team?.slots?.used ?? 0, total: team?.slots?.total ?? 0 }) }}
            </p>
            <ul class="mt-4 space-y-3">
              <li
                v-for="member in team?.members || []"
                :key="member.id"
                class="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-white/80 px-3 py-3 text-sm dark:border-light/10 dark:bg-dark/50"
              >
                <div class="flex-1">
                  <p class="font-medium text-black dark:text-light">
                    {{ member.name }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-light/60">
                    {{ member.email || member.role }}
                  </p>
                </div>
                <span class="inline-flex items-center rounded-full bg-dark/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-black/80 dark:bg-light/10 dark:text-light/80">
                  {{ resolveTeamStatus(member.status) }}
                </span>
              </li>
            </ul>
          </div>

          <div class="rounded-2xl border border-primary/10 bg-white/70 p-4 text-sm text-black/70 dark:border-light/10 dark:bg-dark/60 dark:text-light/80">
            <div class="space-y-2">
              <div>
                <p class="text-xs uppercase tracking-widest text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.team.planLabel', 'Plan') }}
                </p>
                <p class="mt-1 font-medium text-black dark:text-light">
                  {{ team?.plan || 'Free' }}
                </p>
              </div>
              <div class="pt-2">
                <p class="text-xs uppercase tracking-widest text-black/60 dark:text-light/60">
                  {{ t('dashboard.sections.team.notesLabel') }}
                </p>
                <p class="mt-1 leading-relaxed">
                  {{ team?.notes || t('dashboard.sections.team.notesPlaceholder') }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
