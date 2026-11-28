<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { ConnectedDevice } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()

const devicesCache = ref<ConnectedDevice[] | null>(null)
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const renameTarget = ref<ConnectedDevice | null>(null)
const renameValue = ref('')
const renaming = ref(false)

const revokeTarget = ref<ConnectedDevice | null>(null)
const revoking = ref(false)

const deviceList = useConsoleList<ConnectedDevice, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!devicesCache.value) {
      const res = await consoleApi.listDevices()
      devicesCache.value = Array.isArray(res) ? res : (res.devices ?? [])
    }
    const q = filters.q.toLowerCase()
    const rows = q
      ? devicesCache.value.filter(d =>
          `${d.name ?? ''} ${d.deviceName ?? ''} ${d.platform ?? ''}`.toLowerCase().includes(q),
        )
      : devicesCache.value
    return sliceClientPage(rows, page, limit)
  },
})

const deviceColumns = computed<DataTableColumn<ConnectedDevice>[]>(() => [
  { key: 'name', title: t('auth.deviceName'), minWidth: 160 },
  { key: 'platform', title: t('dashboard.devicePlatformCol'), minWidth: 110 },
  { key: 'trusted', title: t('dashboard.deviceTrustCol'), minWidth: 110 },
  { key: 'lastSeenAt', title: t('dashboard.deviceLastSeenCol'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 220 },
])

function openRename(device: ConnectedDevice) {
  renameTarget.value = device
  renameValue.value = device.name || device.deviceName || ''
}

async function submitRename() {
  if (!renameTarget.value || !renameValue.value.trim())
    return
  renaming.value = true
  try {
    await consoleApi.renameDevice({
      deviceId: renameTarget.value.deviceId || renameTarget.value.id,
      name: renameValue.value.trim(),
    })
    renameTarget.value = null
    devicesCache.value = null
    await deviceList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    renaming.value = false
  }
}

async function toggleTrust(device: ConnectedDevice) {
  try {
    await consoleApi.trustDevice({
      deviceId: device.deviceId || device.id,
      trusted: !device.trusted,
    })
    devicesCache.value = null
    await deviceList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

async function confirmRevoke() {
  if (!revokeTarget.value)
    return
  revoking.value = true
  try {
    await consoleApi.revokeDevice({ deviceId: revokeTarget.value.deviceId || revokeTarget.value.id })
    revokeTarget.value = null
    devicesCache.value = null
    await deviceList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    revoking.value = false
  }
}

async function refreshAll() {
  devicesCache.value = null
  await deviceList.refresh()
}
</script>

<template>
  <ConsolePageShell :title="t('dashboard.devicesTitle')">
    <template #actions>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" @click="refreshAll">
        {{ t('common.refresh') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleSection :title="t('dashboard.connectedDevices')" :padded="false">
      <div class="DevicesFilterWrap">
        <ConsoleFilterBar :active="deviceList.hasActiveFilters.value" @clear="deviceList.clearFilters()">
          <ConsoleFormField :label="t('common.search')" for-id="devices-search">
            <TuffInput id="devices-search" v-model="deviceList.filters.q" :placeholder="t('common.search')" />
          </ConsoleFormField>
        </ConsoleFilterBar>
      </div>

      <ConsoleTable
        :columns="deviceColumns"
        :rows="deviceList.rows.value"
        row-key="id"
        :loading="deviceList.loading.value"
        :refreshing="deviceList.refreshing.value"
        :error="deviceList.error.value"
        :filtered="deviceList.hasActiveFilters.value"
        :page="deviceList.page.value"
        :limit="deviceList.limit.value"
        :total="deviceList.total.value"
        :page-sizes="deviceList.pageSizes"
        @retry="deviceList.refresh()"
        @clear-filters="deviceList.clearFilters()"
        @update:page="deviceList.setPage($event)"
        @update:limit="deviceList.setLimit($event)"
      >
        <template #cell-name="{ row }">
          {{ row.name || row.deviceName || row.id }}
        </template>
        <template #cell-trusted="{ row }">
          <TxStatusBadge
            :text="row.trusted ? t('dashboard.trusted') : t('dashboard.untrusted')"
            :status="row.trusted ? 'success' : 'muted'"
            size="sm"
          />
        </template>
        <template #cell-lastSeenAt="{ row }">
          {{ formatDateTime(row.lastSeenAt || row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <div class="console-inline-actions">
            <TxButton variant="ghost" size="sm" @click="openRename(row)">
              {{ t('dashboard.renameDevice') }}
            </TxButton>
            <TxButton variant="secondary" size="sm" @click="toggleTrust(row)">
              {{ t('dashboard.toggleTrust') }}
            </TxButton>
            <TxButton variant="danger" size="sm" @click="revokeTarget = row">
              {{ t('common.revoke') }}
            </TxButton>
          </div>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <TxModal
      :model-value="Boolean(renameTarget)"
      :title="t('dashboard.renameDeviceTitle')"
      :close-label="t('common.close')"
      width="420px"
      @update:model-value="!$event && (renameTarget = null)"
    >
      <ConsoleFormField :label="t('dashboard.deviceNewName')" for-id="rename-device-input">
        <TuffInput id="rename-device-input" v-model="renameValue" />
      </ConsoleFormField>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="renameTarget = null">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="renaming" :disabled="!renameValue.trim()" @click="submitRename">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(revokeTarget)"
      :title="t('dashboard.revokeDeviceTitle')"
      :description="t('dashboard.revokeDeviceDesc', { name: revokeTarget?.name || revokeTarget?.deviceName || revokeTarget?.id || '' })"
      :loading="revoking"
      @update:open="!$event && (revokeTarget = null)"
      @confirm="confirmRevoke"
    />
  </ConsolePageShell>
</template>

<style scoped>
.DevicesFilterWrap {
  padding: 14px 20px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}
</style>
