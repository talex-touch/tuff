<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { $fetch as rawFetch } from 'ofetch'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'

const { t } = useI18n()
const runtimeConfig = useRuntimeConfig()

interface IpBan {
  id: string
  ip: string
  reason: string | null
  enabled: boolean
  createdAt: string
}

const ipBansRequested = ref(false)
const ipBans = ref<IpBan[]>([])
const ipBanLoading = ref(false)
const ipBanError = ref<string | null>(null)
// Seeded from the deploy-time flag so a disabled environment never fires the
// risk-gated ip-bans request just to learn it 404s; the fetch-time fallback
// below still covers a server that disagrees with its own public config.
const ipBanFeatureAvailable = ref(isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled))
const ipBanStepUpToken = ref('')
const ipBanForm = reactive({
  ip: '',
  reason: '',
})

function ipBanAuthHeaders() {
  const token = ipBanStepUpToken.value.trim()
  if (!token)
    return undefined
  return {
    'X-Login-Token': token,
  }
}

function isFeatureNotFoundError(error: any): boolean {
  const statusCode = error?.data?.statusCode
  const message = String(error?.data?.statusMessage || error?.data?.message || error?.message || '').toLowerCase()
  return statusCode === 404 && message.includes('feature not found')
}

async function fetchIpBans() {
  ipBansRequested.value = true
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    const data = await rawFetch<{ bans: IpBan[] }>('/api/dashboard/intelligence/ip-bans', { query: { limit: 100 } })
    ipBans.value = data.bans || []
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.loadIpBansFailed', 'Failed to load IP bans')
  }
  finally {
    ipBanLoading.value = false
  }
}

async function addIpBan() {
  if (!ipBanFeatureAvailable.value)
    return
  const ip = ipBanForm.ip.trim()
  if (!ip)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch('/api/dashboard/intelligence/ip-bans', {
      method: 'POST',
      headers: ipBanAuthHeaders(),
      body: {
        ip,
        reason: ipBanForm.reason.trim() || null,
      },
    })
    ipBanForm.ip = ''
    ipBanForm.reason = ''
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.addIpBanFailed', 'Failed to add IP ban')
  }
  finally {
    ipBanLoading.value = false
  }
}

async function toggleIpBan(ban: IpBan) {
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'PATCH',
      headers: ipBanAuthHeaders(),
      body: { enabled: !ban.enabled },
    })
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.updateIpBanFailed', 'Failed to update IP ban')
  }
  finally {
    ipBanLoading.value = false
  }
}

async function removeIpBan(ban: IpBan) {
  if (!ipBanFeatureAvailable.value)
    return
  ipBanLoading.value = true
  ipBanError.value = null
  try {
    await rawFetch(`/api/dashboard/intelligence/ip-bans/${ban.id}`, {
      method: 'DELETE',
      headers: ipBanAuthHeaders(),
    })
    await fetchIpBans()
  }
  catch (e: any) {
    if (isFeatureNotFoundError(e)) {
      ipBanFeatureAvailable.value = false
      ipBans.value = []
      ipBanError.value = null
      return
    }
    ipBanError.value = e.data?.message || t('dashboard.sections.intelligence.security.removeIpBanFailed', 'Failed to remove IP ban')
  }
  finally {
    ipBanLoading.value = false
  }
}

onMounted(() => {
  if (!ipBansRequested.value || ipBanError.value)
    fetchIpBans()
})
</script>

<template>
  <div class="space-y-6">
    <!--
      Only this section is risk-gated: server/middleware/feature-gates.ts blocks
      /api/dashboard/intelligence/ip-bans alone. Overview and user-usage above are
      plain requireAdmin routes, so gating them on the ip-ban flag blanked working
      panels and left this form live while claiming it was hidden.
    -->
    <section v-if="ipBanFeatureAvailable" class="apple-card-lg space-y-4 p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="apple-heading-sm">
            {{ t('dashboard.sections.intelligence.overview.ipBans.title') }}
          </h3>
          <p class="mt-1 text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.overview.ipBans.subtitle') }}
          </p>
        </div>
        <TxButton variant="bare" size="sm" @click="fetchIpBans">
          {{ t('dashboard.sections.intelligence.overview.ipBans.refresh') }}
        </TxButton>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <TuffInput
          v-model="ipBanStepUpToken"
          placeholder="x-login-token (required for protected writes)"
          class="max-w-xl w-full"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <TuffInput
          v-model="ipBanForm.ip"
          :placeholder="t('dashboard.sections.intelligence.overview.ipBans.ipPlaceholder')"
          class="max-w-xs w-full"
        />
        <TuffInput
          v-model="ipBanForm.reason"
          :placeholder="t('dashboard.sections.intelligence.overview.ipBans.reasonPlaceholder')"
          class="max-w-sm w-full"
        />
        <TxButton variant="primary" size="sm" :disabled="ipBanLoading || !ipBanForm.ip.trim()" @click="addIpBan">
          {{ t('dashboard.sections.intelligence.overview.ipBans.add') }}
        </TxButton>
      </div>

      <div v-if="ipBanError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
        {{ ipBanError }}
      </div>

      <div v-if="ipBanLoading" class="flex items-center justify-center py-4">
        <TxSpinner :size="18" />
      </div>

      <div v-else-if="ipBans.length" class="space-y-2">
        <div
          v-for="ban in ipBans"
          :key="ban.id"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
        >
          <div>
            <p class="text-sm text-black font-medium dark:text-white">
              {{ ban.ip }}
              <span
                class="ml-2 rounded px-1.5 py-0.5 text-[10px]"
                :class="ban.enabled
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'"
              >
                {{ ban.enabled ? t('dashboard.sections.intelligence.overview.ipBans.enabled') : t('dashboard.sections.intelligence.overview.ipBans.disabled') }}
              </span>
            </p>
            <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
              {{ ban.reason || t('dashboard.sections.intelligence.overview.ipBans.noReason') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <TxButton variant="bare" size="sm" @click="toggleIpBan(ban)">
              {{ ban.enabled ? t('dashboard.sections.intelligence.overview.ipBans.disable') : t('dashboard.sections.intelligence.overview.ipBans.enable') }}
            </TxButton>
            <TxButton variant="bare" size="sm" class="text-red-500" @click="removeIpBan(ban)">
              {{ t('dashboard.sections.intelligence.overview.ipBans.remove') }}
            </TxButton>
          </div>
        </div>
      </div>

      <div v-else class="text-xs text-black/40 dark:text-white/40">
        {{ t('dashboard.sections.intelligence.overview.ipBans.empty') }}
      </div>
    </section>

    <section v-if="!ipBanFeatureAvailable" class="apple-card-lg p-6">
      <div class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/45 dark:bg-white/[0.03] dark:text-white/45">
        {{ t('dashboard.sections.intelligence.overview.ipBans.unavailable') }}
      </div>
    </section>
  </div>
</template>
