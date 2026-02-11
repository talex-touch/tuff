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

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

interface ActivationCode {
  id: string
  code: string
  plan: string
  duration_days: number
  max_uses: number
  uses: number
  created_at: string
  expires_at: string | null
  status: string
}

const codes = ref<ActivationCode[]>([])
const loading = ref(false)
const generating = ref(false)
const error = ref<string | null>(null)

// Generation form
const genForm = reactive({
  plan: 'PLUS' as 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | 'TEAM',
  durationDays: 30,
  maxUses: 1,
  expiresInDays: 90,
  count: 1,
})

const planOptions = [
  { value: 'PLUS', label: 'Plus', color: 'text-blue-500' },
  { value: 'PRO', label: 'Pro', color: 'text-purple-500' },
  { value: 'ENTERPRISE', label: 'Enterprise', color: 'text-amber-500' },
  { value: 'TEAM', label: 'Team', color: 'text-green-500' },
]

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  exhausted: 'bg-black/[0.06] text-black/60 dark:bg-white/[0.08] dark:text-white/60',
  expired: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  revoked: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
}

async function fetchCodes() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ codes: ActivationCode[] }>('/api/admin/codes')
    codes.value = res.codes
  }
  catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to load codes'
  }
  finally {
    loading.value = false
  }
}

async function generateCodes() {
  generating.value = true
  error.value = null
  try {
    await $fetch('/api/admin/codes/generate', {
      method: 'POST',
      body: genForm,
    })
    await fetchCodes()
  }
  catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to generate codes'
  }
  finally {
    generating.value = false
  }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

onMounted(() => {
  fetchCodes()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.codes.title', 'Activation Codes') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.codes.subtitle', 'Generate and manage activation codes') }}
      </p>
    </div>

    <!-- Generation Form -->
    <section class="apple-card-lg p-5">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.codes.generateTitle', 'Generate New Codes') }}
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <div>
          <label class="apple-section-title mb-1 block">Plan</label>
          <TuffSelect v-model="genForm.plan" class="w-full">
            <TuffSelectItem
              v-for="opt in planOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Duration (days)</label>
          <Input v-model="genForm.durationDays" type="number" min="1" max="365" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Max Uses</label>
          <Input v-model="genForm.maxUses" type="number" min="1" max="1000" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Expires In (days)</label>
          <Input v-model="genForm.expiresInDays" type="number" min="1" max="365" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Count</label>
          <Input v-model="genForm.count" type="number" min="1" max="100" class="w-full" />
        </div>
      </div>

      <Button
        class="mt-4"
        :disabled="generating"
        variant="primary"
        @click="generateCodes"
      >
        <TxSpinner v-if="generating" :size="14" />
        <span>{{ generating ? t('dashboard.sections.codes.generating', 'Generating...') : t('dashboard.sections.codes.generateButton', 'Generate Codes') }}</span>
      </Button>
    </section>

    <!-- Error -->
    <div v-if="error" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ error }}
    </div>

    <!-- Codes List -->
    <section class="apple-card-lg overflow-hidden">
      <div class="border-b border-black/[0.04] p-5 dark:border-white/[0.06]">
        <h2 class="text-base font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.codes.listTitle', 'All Codes') }}
        </h2>
        <div class="mt-3">
          <TxButton
            variant="bare"
            size="small"
            native-type="button"
            :disabled="loading"
            class="inline-flex items-center gap-1.5 text-sm text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-light"
            @click="fetchCodes"
          >
            <TxSpinner v-if="loading" :size="14" />
            <span v-else class="i-carbon-refresh text-base" />
            {{ t('dashboard.sections.codes.refresh', 'Refresh') }}
          </TxButton>
        </div>
      </div>

      <div v-if="loading && !codes.length" class="space-y-3 p-5">
        <div class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.codes.loading', 'Loading...') }}
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <div v-else-if="!codes.length" class="p-8 text-center text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.codes.empty', 'No activation codes yet. Generate some above.') }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[700px]">
          <thead class="bg-black/5 dark:bg-white/[0.04]">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.code', 'Code') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.plan', 'Plan') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.duration', 'Duration') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.uses', 'Uses') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.status', 'Status') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.created', 'Created') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.codes.table.expires', 'Expires') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            <tr v-for="code in codes" :key="code.id" class="transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <code class="rounded bg-black/5 px-2 py-1 font-mono text-sm text-black dark:bg-white/[0.08] dark:text-white">{{ code.code }}</code>
                  <TxButton
                    variant="bare"
                    size="mini"
                    native-type="button"
                    icon="i-carbon-copy"
                    class="text-black/40 transition hover:text-black/70 dark:text-white/40 dark:hover:text-light/70"
                    :title="t('dashboard.sections.codes.copy', 'Copy')"
                    @click="copyCode(code.code)"
                  />
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="font-medium" :class="planOptions.find(p => p.value === code.plan)?.color">
                  {{ code.plan }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-white/60">
                {{ code.duration_days }} {{ t('dashboard.sections.codes.days', 'days') }}
              </td>
              <td class="px-4 py-3 text-sm text-black dark:text-white">
                {{ code.uses }} / {{ code.max_uses }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                  :class="statusColors[code.status] || 'bg-black/10 text-black/60 dark:bg-white/[0.08] dark:text-white/60'"
                >
                  {{ code.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-white/60">
                {{ formatDate(code.created_at) }}
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-white/60">
                {{ code.expires_at ? formatDate(code.expires_at) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
