<script setup lang="ts">
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
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
  exhausted: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.codes.title', 'Activation Codes') }}
        </h1>
        <p class="mt-1 text-sm text-black/60 dark:text-light/60">
          {{ t('dashboard.sections.codes.subtitle', 'Generate and manage activation codes') }}
        </p>
      </div>
    </div>

    <!-- Generation Form -->
    <section class="rounded-2xl border border-primary/10 bg-white/80 p-5 dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-base font-semibold text-black dark:text-light">
        {{ t('dashboard.sections.codes.generateTitle', 'Generate New Codes') }}
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan</label>
          <TxSelect v-model="genForm.plan" class="w-full">
            <TxSelectItem v-for="opt in planOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </TxSelectItem>
          </TxSelect>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (days)</label>
          <Input
            v-model="genForm.durationDays"
            type="number"
            min="1"
            max="365"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Uses</label>
          <Input
            v-model="genForm.maxUses"
            type="number"
            min="1"
            max="1000"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expires In (days)</label>
          <Input
            v-model="genForm.expiresInDays"
            type="number"
            min="1"
            max="365"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Count</label>
          <Input
            v-model="genForm.count"
            type="number"
            min="1"
            max="100"
            class="w-full"
          />
        </div>
      </div>

      <Button
        variant="primary"
        size="small"
        class="mt-4"
        :loading="generating"
        :disabled="generating"
        @click="generateCodes"
      >
        {{ generating ? t('dashboard.sections.codes.generating', 'Generating...') : t('dashboard.sections.codes.generateButton', 'Generate Codes') }}
      </Button>
    </section>

    <!-- Error -->
    <div v-if="error" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ error }}
    </div>

    <!-- Codes List -->
    <section class="rounded-2xl border border-primary/10 bg-white/80 dark:border-light/10 dark:bg-dark/60 overflow-hidden">
      <div class="flex items-center justify-between border-b border-primary/10 p-5 dark:border-light/10">
        <h2 class="text-base font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.codes.listTitle', 'All Codes') }}
        </h2>
        <Button
          variant="bare"
          size="small"
          :loading="loading"
          icon="i-carbon-refresh"
          @click="fetchCodes"
        >
          {{ t('dashboard.sections.codes.refresh', 'Refresh') }}
        </Button>
      </div>

      <div v-if="loading && !codes.length" class="p-8 text-center text-black/50 dark:text-light/50">
        {{ t('dashboard.sections.codes.loading', 'Loading...') }}
      </div>

      <div v-else-if="!codes.length" class="p-8 text-center text-black/50 dark:text-light/50">
        {{ t('dashboard.sections.codes.empty', 'No activation codes yet. Generate some above.') }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[700px]">
          <thead class="bg-black/5 dark:bg-light/5">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.code', 'Code') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.plan', 'Plan') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.duration', 'Duration') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.uses', 'Uses') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.status', 'Status') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.created', 'Created') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-light/60">
                {{ t('dashboard.sections.codes.table.expires', 'Expires') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-primary/10 dark:divide-light/10">
            <tr v-for="code in codes" :key="code.id" class="transition hover:bg-black/5 dark:hover:bg-light/5">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <code class="rounded bg-black/5 px-2 py-1 font-mono text-sm text-black dark:bg-light/10 dark:text-light">{{ code.code }}</code>
                  <Button
                    variant="bare"
                    size="mini"
                    circle
                    icon="i-carbon-copy"
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
              <td class="px-4 py-3 text-sm text-black/60 dark:text-light/60">
                {{ code.duration_days }} {{ t('dashboard.sections.codes.days', 'days') }}
              </td>
              <td class="px-4 py-3 text-sm text-black dark:text-light">
                {{ code.uses }} / {{ code.max_uses }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                  :class="statusColors[code.status] || 'bg-black/10 text-black/60 dark:bg-light/10 dark:text-light/60'"
                >
                  {{ code.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-light/60">
                {{ formatDate(code.created_at) }}
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-light/60">
                {{ code.expires_at ? formatDate(code.expires_at) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
