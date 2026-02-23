<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()
const runtimeConfig = useRuntimeConfig()

const isAdmin = computed(() => user.value?.role === 'admin')
const riskControlEnabled = computed(() => runtimeConfig.public.experimentalFeatures?.riskControlEnabled === true)
watch([isAdmin, riskControlEnabled], ([admin, riskEnabled]) => {
  if (!riskEnabled) {
    navigateTo('/dashboard/overview')
    return
  }
  if (user.value && !admin)
    navigateTo('/dashboard/overview')
}, { immediate: true })

const stepUpToken = ref('')
const mode = ref<'NORMAL' | 'ELEVATED' | 'EXTREME'>('ELEVATED')
const modeReason = ref('')
const actorInput = ref('')
const caseIp = ref('')
const caseReason = ref('')
const pendingOperationId = ref('')
const pendingDecision = ref<'confirm' | 'reject'>('confirm')
const pendingReason = ref('')
const output = ref('')
const busy = ref(false)

function authHeaders() {
  const headers: Record<string, string> = {}
  if (stepUpToken.value.trim())
    headers['X-Login-Token'] = stepUpToken.value.trim()
  return headers
}

function setOutput(value: unknown) {
  output.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

async function callRiskModeOverride() {
  busy.value = true
  try {
    const data = await $fetch('/api/admin/risk/mode.override', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        mode: mode.value,
        reason: modeReason.value.trim() || null,
      },
    })
    setOutput(data)
  }
  catch (error: any) {
    setOutput(error?.data || error?.message || 'mode override failed')
  }
  finally {
    busy.value = false
  }
}

async function callRiskActorUnblock() {
  busy.value = true
  try {
    const actors = actorInput.value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
    const data = await $fetch('/api/admin/risk/actor.unblock', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        actors,
        reason: 'dashboard-admin-risk',
      },
    })
    setOutput(data)
  }
  catch (error: any) {
    setOutput(error?.data || error?.message || 'actor unblock failed')
  }
  finally {
    busy.value = false
  }
}

async function callRiskCaseReview() {
  busy.value = true
  try {
    const data = await $fetch('/api/admin/risk/case.review', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        kind: 'ip-ban-upsert',
        ip: caseIp.value.trim(),
        enabled: true,
        permanent: true,
        reason: caseReason.value.trim() || null,
      },
    })
    setOutput(data)
  }
  catch (error: any) {
    setOutput(error?.data || error?.message || 'case review failed')
  }
  finally {
    busy.value = false
  }
}

async function confirmPendingOperation() {
  busy.value = true
  try {
    const data = await $fetch('/api/admin/risk/dual-control/confirm', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        operation_id: pendingOperationId.value.trim(),
        decision: pendingDecision.value,
        reason: pendingReason.value.trim() || null,
      },
    })
    setOutput(data)
  }
  catch (error: any) {
    setOutput(error?.data || error?.message || 'dual control confirm failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 px-5 py-6">
    <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold">
          {{ t('dashboard.sections.analytics.title', 'Risk Control') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-white/60">
          P0-ADMIN control plane console for emergency risk actions.
        </p>
      </div>
      <NuxtLink
        to="/admin/emergency"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black transition hover:border-black/30 hover:bg-black/5 dark:border-white/20 dark:text-white dark:hover:border-white/40 dark:hover:bg-white/5"
      >
        打开应急控制台
      </NuxtLink>
    </header>

    <section class="rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
      <label class="mb-2 block text-xs text-black/60 dark:text-white/60">Step-up Login Token (x-login-token)</label>
      <input
        v-model="stepUpToken"
        type="text"
        class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        placeholder="Paste one-time passkey login token"
      >
    </section>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <h2 class="text-sm font-semibold">
          risk.mode.override
        </h2>
        <select v-model="mode" class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20">
          <option value="NORMAL">
            NORMAL
          </option>
          <option value="ELEVATED">
            ELEVATED
          </option>
          <option value="EXTREME">
            EXTREME
          </option>
        </select>
        <input
          v-model="modeReason"
          type="text"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="reason"
        >
        <button :disabled="busy" class="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" @click="callRiskModeOverride">
          Submit mode override
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <h2 class="text-sm font-semibold">
          risk.actor.unblock
        </h2>
        <textarea
          v-model="actorInput"
          rows="4"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="one actor/ip per line"
        />
        <button :disabled="busy" class="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" @click="callRiskActorUnblock">
          Submit actor unblock
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <h2 class="text-sm font-semibold">
          risk.case.review (ip-ban-upsert)
        </h2>
        <input
          v-model="caseIp"
          type="text"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="ip"
        >
        <input
          v-model="caseReason"
          type="text"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="reason"
        >
        <button :disabled="busy" class="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" @click="callRiskCaseReview">
          Submit case review
        </button>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <h2 class="text-sm font-semibold">
          dual-control confirm
        </h2>
        <input
          v-model="pendingOperationId"
          type="text"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="pending_operation_id"
        >
        <select v-model="pendingDecision" class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20">
          <option value="confirm">
            confirm
          </option>
          <option value="reject">
            reject
          </option>
        </select>
        <input
          v-model="pendingReason"
          type="text"
          class="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          placeholder="reason"
        >
        <button :disabled="busy" class="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" @click="confirmPendingOperation">
          Submit dual-control decision
        </button>
      </section>
    </div>

    <section class="rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
      <h3 class="mb-2 text-xs font-semibold uppercase text-black/60 dark:text-white/60">
        Output
      </h3>
      <pre class="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{{ output || 'No output yet.' }}</pre>
    </section>
  </div>
</template>
