<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

interface Props {
  displayName: string
  emailLabel: string
  avatarUrl: string
  profileInitial: string
  isEmailVerified: boolean
  verifiedText: string
  unverifiedText: string
  roleLabel: string
  roleClass: string
  manageText: string
  currentPlanText: string
  planStatusLabel: string
  planActive: boolean
  planLabel: string
  planActionText: string
  daysLeftText: string
  showPlanSkeleton: boolean
  planCode: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'manage', source: HTMLElement | null): void
  (e: 'plan-action'): void
}>()

const manageTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)

const planAccent = computed(() => {
  switch (props.planCode) {
    case 'PRO':
      return {
        glow: 'bg-sky-400/35 dark:bg-sky-400/28',
        button: 'border-sky-300/75 bg-sky-50 text-sky-600 dark:border-sky-300/35 dark:bg-sky-500/10 dark:text-sky-200',
      }
    case 'PLUS':
      return {
        glow: 'bg-violet-400/35 dark:bg-violet-400/28',
        button: 'border-violet-300/75 bg-violet-50 text-violet-600 dark:border-violet-300/35 dark:bg-violet-500/10 dark:text-violet-200',
      }
    case 'TEAM':
      return {
        glow: 'bg-cyan-400/35 dark:bg-cyan-400/28',
        button: 'border-cyan-300/75 bg-cyan-50 text-cyan-600 dark:border-cyan-300/35 dark:bg-cyan-500/10 dark:text-cyan-200',
      }
    case 'ENTERPRISE':
      return {
        glow: 'bg-amber-400/35 dark:bg-amber-400/28',
        button: 'border-amber-300/75 bg-amber-50 text-amber-600 dark:border-amber-300/35 dark:bg-amber-500/10 dark:text-amber-200',
      }
    default:
      return {
        glow: 'bg-slate-400/30 dark:bg-slate-300/22',
        button: 'border-blue-300/70 bg-blue-50 text-blue-500 dark:border-blue-300/35 dark:bg-blue-500/8 dark:text-blue-200',
      }
  }
})

const planStatusClass = computed(() => (props.planActive
  ? 'bg-emerald-500/18 text-emerald-600 dark:text-emerald-300'
  : 'bg-slate-500/16 text-slate-600 dark:text-slate-300'))

function handleManage() {
  emit('manage', manageTriggerRef.value?.$el || null)
}
</script>

<template>
  <section class="apple-card-lg profile-plan-glass relative h-[180px] w-full overflow-hidden px-6 py-4">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -top-20 -right-16 h-56 w-56 rounded-full blur-[100px]" :class="planAccent.glow" />
      <div class="absolute top-1/2 -right-20 h-52 w-52 -translate-y-1/2 rounded-full bg-violet-400/20 blur-[110px] dark:bg-violet-300/20" />
      <div class="absolute -bottom-18 right-10 h-48 w-48 rounded-full bg-emerald-300/16 blur-[96px] dark:bg-emerald-300/20" />
      <div class="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent dark:from-white/[0.04]" />
    </div>

    <div class="relative z-[2] grid h-full grid-cols-[7fr_1px_3fr] items-center">
      <div class="flex min-w-0 items-center justify-start pl-1 pr-6">
        <div class="flex w-full items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-black/[0.1] bg-black/[0.03] dark:border-white/[0.12] dark:bg-white/[0.04]">
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                :alt="displayName || 'User'"
                class="h-full w-full object-cover"
              >
              <div v-else class="flex h-full w-full items-center justify-center text-sm font-semibold text-black/65 dark:text-white/75">
                {{ profileInitial }}
              </div>
            </div>
            <div class="min-w-0 flex flex-col items-start justify-center gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <p class="truncate text-base leading-tight font-semibold my-0 text-black dark:text-white">
                  {{ displayName }}
                </p>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px]" :class="roleClass">
                  {{ roleLabel }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 text-xs leading-none text-black/55 dark:text-white/60">
                <span class="truncate">{{ emailLabel }}</span>
                <span
                  v-if="isEmailVerified"
                  class="i-carbon-checkmark-filled inline-flex items-center justify-center text-[13px] leading-none text-green-500 dark:text-green-400"
                  :title="verifiedText"
                  :aria-label="verifiedText"
                />
                <span
                  v-else
                  class="rounded-full bg-yellow-500/20 px-2 py-0.5 text-[11px] text-yellow-700 dark:text-yellow-400"
                >
                  {{ unverifiedText }}
                </span>
              </div>
            </div>
          </div>

          <TxButton ref="manageTriggerRef" size="small" variant="secondary" icon="i-carbon-edit" class="h-6 shrink-0 bg-amber-100/70 text-xs text-amber-700 backdrop-blur-sm transition-colors hover:bg-amber-100 dark:bg-amber-400/16 dark:text-amber-200 dark:hover:bg-amber-300/20" @click="handleManage">
            {{ manageText }}
          </TxButton>
        </div>
      </div>
      <div class="h-[70%] w-px justify-self-center bg-gradient-to-b from-transparent via-black/[0.12] to-transparent dark:via-white/[0.16]" />

      <div class="flex h-full items-center pl-4 text-sm">
        <div class="mx-auto w-full max-w-[286px]">
          <div v-if="showPlanSkeleton" class="space-y-1.5 animate-pulse">
            <div class="h-8 w-36 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]" />
            <div class="h-3 w-full rounded bg-black/[0.05] dark:bg-white/[0.08]" />
            <div class="h-7 w-20 rounded-full bg-black/[0.05] dark:bg-white/[0.08]" />
          </div>

          <template v-else>
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] uppercase tracking-[0.22em] text-black/45 dark:text-white/45">
                {{ currentPlanText }}
              </p>
              <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" :class="planStatusClass">
                {{ planStatusLabel }}
              </span>
            </div>

            <p class="plan-display-font my-4 text-[36px] leading-[0.95] text-black dark:text-white">
              {{ planLabel }}
            </p>
            <div class="justify-between flex items-center gap-1.5 text-xs leading-tight">
              <span class="text-black/45 dark:text-white/50">
                {{ daysLeftText }}
              </span>
              <TxButton size="small" variant="secondary" icon="i-carbon-settings-adjust" class="h-7 text-xs transition-colors" :class="planAccent.button" @click="emit('plan-action')">
                {{ planActionText }}
              </TxButton>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-plan-glass {
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
</style>
