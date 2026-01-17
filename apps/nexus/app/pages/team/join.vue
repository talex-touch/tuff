<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { t } = useI18n()
const route = useRoute()

defineI18nRoute(false)

const code = ref('')
const pending = ref(false)
const errorMessage = ref('')
const success = ref(false)

watch(
  () => route.query.code,
  (next) => {
    const nextCode = typeof next === 'string' ? next : ''
    if (nextCode)
      code.value = nextCode
  },
  { immediate: true },
)

const canSubmit = computed(() => !pending.value && code.value.trim().length > 0)

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
        <input
          v-model="code"
          type="text"
          autocomplete="off"
          placeholder="ABCDEFGH"
          class="w-full rounded-lg border-0 bg-black/5 px-4 py-3 text-sm font-mono text-black placeholder-black/30 outline-none dark:bg-light/5 dark:text-light dark:placeholder-light/30"
          @keyup.enter="joinTeam"
        >

        <button
          class="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-dark dark:hover:bg-light/80"
          :disabled="!canSubmit"
          @click="joinTeam"
        >
          {{ pending ? t('team.join.joining', 'Joining...') : t('team.join.join', 'Join') }}
        </button>

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
