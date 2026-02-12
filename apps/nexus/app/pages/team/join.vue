<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex'

definePageMeta({
  requiresAuth: true,
})

defineI18nRoute(false)

interface InvitePreview {
  invite: {
    code: string
    teamId: string
    teamName: string
    expiresAt: string | null
    status: string
    role: 'admin' | 'member'
    seats: {
      used: number
      total: number
    }
  }
  validation: {
    canJoin: boolean
    reason: string
  }
}

const { t } = useI18n()
const route = useRoute()

const code = ref('')
const pending = ref(false)
const previewPending = ref(false)
const errorMessage = ref('')
const success = ref(false)
const preview = ref<InvitePreview | null>(null)

watch(
  () => route.query.code,
  (next) => {
    const nextCode = typeof next === 'string' ? next : ''
    if (nextCode)
      code.value = nextCode
  },
  { immediate: true },
)

watch(
  () => code.value,
  async (nextCode) => {
    if (import.meta.server)
      return

    const trimmed = nextCode.trim()
    preview.value = null
    errorMessage.value = ''

    if (!trimmed)
      return

    previewPending.value = true
    try {
      preview.value = await $fetch<InvitePreview>(`/api/team/invite/${encodeURIComponent(trimmed)}`)
    }
    catch (error: any) {
      errorMessage.value = error?.data?.statusMessage || error?.message || 'Failed to load invite preview'
    }
    finally {
      previewPending.value = false
    }
  },
)

const canSubmit = computed(() => {
  if (pending.value || !code.value.trim())
    return false
  if (!preview.value)
    return false
  return preview.value.validation.canJoin
})

async function joinTeam(): Promise<void> {
  if (!canSubmit.value)
    return

  pending.value = true
  errorMessage.value = ''
  success.value = false

  try {
    await $fetch('/api/team/join', {
      method: 'POST',
      body: { code: code.value.trim() },
    })

    success.value = true
    await navigateTo('/dashboard/team')
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || 'Failed to join team'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-md px-4 py-10">
    <div class="rounded-2xl bg-white/60 p-6 dark:bg-dark/40">
      <h1 class="text-lg font-semibold text-black dark:text-light">
        {{ t('team.join.title', 'Join Team') }}
      </h1>
      <p class="mt-1 text-sm text-black/50 dark:text-light/50">
        {{ t('team.join.desc', 'Enter an invite code to join a team') }}
      </p>

      <div class="mt-5 space-y-3">
        <Input
          v-model="code"
          type="text"
          autocomplete="off"
          placeholder="ABCDEFGH"
          class="w-full"
          @keyup.enter="joinTeam"
        />

        <div v-if="previewPending" class="text-xs text-black/50 dark:text-light/50">
          {{ t('dashboard.team.pending', '正在加载团队信息…') }}
        </div>

        <div v-if="preview" class="rounded-xl bg-black/[0.03] p-3 text-xs text-black/70 dark:bg-white/[0.06] dark:text-white/70">
          <p class="font-medium text-black dark:text-white">
            {{ preview.invite.teamName }}
          </p>
          <p>
            {{ preview.invite.seats.used }}/{{ preview.invite.seats.total }} seats · {{ preview.invite.role }}
          </p>
          <p>
            {{ preview.validation.reason }}
          </p>
        </div>

        <TxButton block :disabled="!canSubmit" @click="joinTeam">
          {{ pending ? t('team.join.joining', 'Joining...') : t('team.join.join', 'Join') }}
        </TxButton>

        <p v-if="errorMessage" class="text-sm text-red-500">
          {{ errorMessage }}
        </p>

        <p v-else-if="success" class="text-sm text-green-600 dark:text-green-400">
          {{ t('team.join.success', 'Joined successfully') }}
        </p>

        <NuxtLink
          to="/dashboard/team"
          class="block text-center text-xs text-black/50 transition hover:text-black dark:text-light/50 dark:hover:text-light"
        >
          {{ t('team.join.back', 'Back to Team') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
