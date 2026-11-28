<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { AdminUserItem } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { useConsoleList } from '@/composables/useConsoleList'
import { useSession } from '@/composables/useSession'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()
const session = useSession()

const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)
const pendingAction = ref<{
  kind: 'role' | 'status'
  user: AdminUserItem
  nextValue: string
} | null>(null)
const acting = ref(false)

const roleOptions = computed(() => [
  { value: '', label: t('common.all') },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
])

const statusOptions = computed(() => [
  { value: '', label: t('common.all') },
  { value: 'active', label: t('common.active') },
  { value: 'disabled', label: t('common.disabled') },
  { value: 'deletion_pending', label: 'deletion_pending' },
])

const userList = useConsoleList<AdminUserItem, { q: string, role: string, status: string }>({
  defaults: { q: '', role: '', status: '' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50, 100],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listAdminUsers({
      page,
      limit,
      q: filters.q || undefined,
      role: filters.role || undefined,
      status: filters.status || undefined,
    })
    return {
      rows: res.users ?? [],
      total: res.pagination?.total ?? 0,
    }
  },
})

const columns = computed<DataTableColumn<AdminUserItem>[]>(() => [
  { key: 'user', title: t('admin.userCol'), minWidth: 220 },
  { key: 'role', title: t('dashboard.roleCol'), minWidth: 100 },
  { key: 'status', title: t('common.status'), minWidth: 120 },
  { key: 'emailState', title: t('admin.emailStateCol'), minWidth: 110 },
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 200 },
])

function isSelf(user: AdminUserItem): boolean {
  return user.id === session.user.value?.id
}

async function confirmAction() {
  if (!pendingAction.value)
    return
  acting.value = true
  feedback.value = null
  try {
    const { kind, user, nextValue } = pendingAction.value
    if (kind === 'role')
      await consoleApi.updateAdminUserRole(user.id, nextValue as 'admin' | 'user')
    else
      await consoleApi.updateAdminUserStatus(user.id, nextValue as 'active' | 'disabled')
    pendingAction.value = null
    await userList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    acting.value = false
  }
}
</script>

<template>
  <ConsolePageShell :title="t('admin.usersTitle')">
    <template #actions>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" @click="userList.refresh()">
        {{ t('common.refresh') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleFilterBar :active="userList.hasActiveFilters.value" @clear="userList.clearFilters()">
      <ConsoleFormField :label="t('common.search')" for-id="admin-users-search">
        <TuffInput
          id="admin-users-search"
          v-model="userList.filters.q"
          :placeholder="t('admin.searchUsersPlaceholder')"
        />
      </ConsoleFormField>
      <ConsoleFormField :label="t('admin.roleFilter')">
        <TxSelect v-model="userList.filters.role" :options="roleOptions" />
      </ConsoleFormField>
      <ConsoleFormField :label="t('admin.statusFilter')">
        <TxSelect v-model="userList.filters.status" :options="statusOptions" />
      </ConsoleFormField>
    </ConsoleFilterBar>

    <ConsoleSection :padded="false">
      <ConsoleTable
        :columns="columns"
        :rows="userList.rows.value"
        row-key="id"
        :loading="userList.loading.value"
        :refreshing="userList.refreshing.value"
        :error="userList.error.value"
        :filtered="userList.hasActiveFilters.value"
        :page="userList.page.value"
        :limit="userList.limit.value"
        :total="userList.total.value"
        :page-sizes="userList.pageSizes"
        @retry="userList.refresh()"
        @clear-filters="userList.clearFilters()"
        @update:page="userList.setPage($event)"
        @update:limit="userList.setLimit($event)"
      >
        <template #cell-user="{ row }">
          <div>
            <div>{{ row.name || row.email }}</div>
            <div v-if="row.name && row.email !== row.name" class="console-muted">
{{ row.email }}
</div>
          </div>
        </template>
        <template #cell-role="{ row }">
          <TxTag :label="row.role" size="sm" :variant="row.role === 'admin' ? 'soft' : 'plain'" />
        </template>
        <template #cell-status="{ row }">
          <TxStatusBadge
            :text="row.status"
            :status="row.status === 'active' ? 'success' : row.status === 'disabled' ? 'danger' : 'warning'"
            size="sm"
          />
        </template>
        <template #cell-emailState="{ row }">
          <TxStatusBadge
            :text="row.emailState"
            :status="row.emailState === 'verified' ? 'success' : 'muted'"
            size="sm"
          />
        </template>
        <template #cell-createdAt="{ row }">
          {{ formatDateTime(row.createdAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <div class="console-inline-actions">
            <TxButton
              variant="secondary"
              size="sm"
              :disabled="isSelf(row) || row.status === 'merged'"
              @click="pendingAction = { kind: 'role', user: row, nextValue: row.role === 'admin' ? 'user' : 'admin' }"
            >
              {{ row.role === 'admin' ? t('admin.demoteUser') : t('admin.promoteAdmin') }}
            </TxButton>
            <TxButton
              :variant="row.status === 'active' ? 'danger' : 'primary'"
              size="sm"
              :disabled="isSelf(row) || row.status === 'merged'"
              @click="pendingAction = { kind: 'status', user: row, nextValue: row.status === 'active' ? 'disabled' : 'active' }"
            >
              {{ row.status === 'active' ? t('admin.disableUser') : t('admin.enableUser') }}
            </TxButton>
          </div>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleConfirmDialog
      :open="Boolean(pendingAction)"
      :title="pendingAction?.kind === 'role' ? t('admin.changeRoleTitle') : t('admin.changeStatusTitle')"
      :description="pendingAction?.kind === 'role'
        ? t('admin.changeRoleDesc', { email: pendingAction.user.email, role: pendingAction.nextValue })
        : t('admin.changeStatusDesc', { email: pendingAction?.user.email || '', status: pendingAction?.nextValue || '' })"
      :tone="pendingAction?.nextValue === 'disabled' ? 'danger' : 'warning'"
      :loading="acting"
      @update:open="!$event && (pendingAction = null)"
      @confirm="confirmAction"
    />
  </ConsolePageShell>
</template>
