<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import { useSession } from '@/composables/useSession'
import { formatNumber } from '@/utils/format'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSession()

const loading = ref(true)
const errorMessage = ref<string | null>(null)
const devicesCount = ref(0)
const pluginsCount = ref(0)

const adminDenied = computed(() => route.query.denied === 'admin')

const statItems = computed<ConsoleStatItem[]>(() => [
  {
    key: 'email',
    label: t('dashboard.emailStatus'),
    value: session.user.value?.emailVerified ? t('dashboard.verified') : t('dashboard.unverified'),
    meta: session.user.value?.email || undefined,
    iconClass: 'i-carbon-email',
  },
  {
    key: 'passkeys',
    label: t('dashboard.passkeysEnrolled'),
    value: formatNumber(session.user.value?.passkeyCount ?? 0, locale.value),
    meta: session.user.value?.role || 'user',
    iconClass: 'i-carbon-password',
  },
  {
    key: 'devices',
    label: t('dashboard.devicesCard'),
    value: formatNumber(devicesCount.value, locale.value),
    iconClass: 'i-carbon-laptop',
  },
  {
    key: 'plugins',
    label: t('dashboard.pluginsCard'),
    value: formatNumber(pluginsCount.value, locale.value),
    iconClass: 'i-carbon-plug',
  },
])

async function loadOverview() {
  loading.value = true
  errorMessage.value = null
  try {
    const [devicesRes, pluginsRes] = await Promise.allSettled([
      consoleApi.listDevices(),
      consoleApi.listMyPlugins(),
    ])
    if (devicesRes.status === 'fulfilled') {
      const list = Array.isArray(devicesRes.value) ? devicesRes.value : devicesRes.value.devices ?? []
      devicesCount.value = list.filter(d => !d.revokedAt).length
    }
    if (pluginsRes.status === 'fulfilled')
      pluginsCount.value = pluginsRes.value.total ?? pluginsRes.value.plugins?.length ?? 0

    if (devicesRes.status === 'rejected' && pluginsRes.status === 'rejected')
      errorMessage.value = resolveErrorMessage(devicesRes.reason, t('common.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onMounted(() => void loadOverview())
</script>

<template>
  <ConsolePageShell :title="t('dashboard.overviewTitle')">
    <template #actions>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" :loading="loading" @click="loadOverview">
        {{ t('common.refresh') }}
      </TxButton>
    </template>

    <TxAlert
      v-if="adminDenied"
      type="warning"
      :title="t('common.forbiddenTitle')"
      :message="t('common.forbiddenDesc')"
    />
    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <ConsoleStatGrid :items="statItems" :loading="loading" :skeleton-count="4" />

    <ConsoleSection :title="t('dashboard.accountSummary')">
      <div class="OverviewSummary">
        <div class="OverviewSummary-Row">
          <span class="OverviewSummary-Label">{{ t('auth.emailLabel') }}</span>
          <span>{{ session.user.value?.email || '—' }}</span>
        </div>
        <div class="OverviewSummary-Row">
          <span class="OverviewSummary-Label">{{ t('dashboard.emailStatus') }}</span>
          <TxStatusBadge
            :text="session.user.value?.emailVerified ? t('dashboard.verified') : t('dashboard.unverified')"
            :status="session.user.value?.emailVerified ? 'success' : 'warning'"
            size="sm"
          />
        </div>
        <div class="OverviewSummary-Row">
          <span class="OverviewSummary-Label">{{ t('dashboard.passkeysEnrolled') }}</span>
          <span>{{ formatNumber(session.user.value?.passkeyCount ?? 0, locale) }}</span>
        </div>
        <div class="OverviewSummary-Row">
          <span class="OverviewSummary-Label">{{ t('dashboard.roleLabel') }}</span>
          <span>{{ session.user.value?.role || 'user' }}</span>
        </div>
      </div>

      <template #footer>
        <div class="console-inline-actions">
          <TxButton variant="secondary" size="sm" @click="router.push('/dashboard/account')">
            {{ t('nav.account') }}
          </TxButton>
          <TxButton variant="secondary" size="sm" @click="router.push('/dashboard/devices')">
            {{ t('nav.devices') }}
          </TxButton>
          <TxButton variant="secondary" size="sm" @click="router.push('/dashboard/plugins')">
            {{ t('nav.plugins') }}
          </TxButton>
          <TxButton v-if="session.isAdmin.value" variant="primary" size="sm" @click="router.push('/admin')">
            {{ t('nav.adminUsage') }}
          </TxButton>
        </div>
      </template>
    </ConsoleSection>
  </ConsolePageShell>
</template>

<style scoped>
.OverviewSummary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.OverviewSummary-Row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.OverviewSummary-Label {
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
</style>
