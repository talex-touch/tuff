<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { AdminDrawerActionResult } from '~/composables/useAdminUserDrawer'
import type { AdminUser, CreditDirection, CreditLedgerEntry } from '~/utils/admin-users'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex/descriptions'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxProgressBar } from '@talex-touch/tuffex/progress-bar'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, reactive, ref, useId, watch } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import AdminIdentity from '~/components/admin/AdminIdentity.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import { USER_CREDIT_LEDGER_PAGE_SIZE, useAdminUserCredits, useAdminUserSubscription } from '~/composables/useAdminUserDrawer'
import { useToast } from '~/composables/useToast'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import {
  buildUserEmailStateLabels,
  buildUserLocaleLabels,
  buildUserRoleLabels,
  buildUserRoleOptions,
  buildUserStatusLabels,
  buildUserStatusOptions,
  canRequestUserDeletion,
  createUserListOptions,
  creditDeductHint,
  creditDeductRefusalMessage,
  creditLedgerReason,
  creditRemaining,
  creditUsageRatio,
  GRANTABLE_SUBSCRIPTION_PLANS,
  isUserLifecycleLocked,
  SUBSCRIPTION_GRANT_MAX_DAYS,
  userAccessLock,
  userRoleTone,
  userStatusTone,
  validateCreditAdjustment,
  validateSubscriptionGrant,
} from '~/utils/admin-users'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have.
const { t } = useI18n()
const format = useAdminFormat()
const toast = useToast()

// The signed-in administrator, read from the profile the layout's gate already
// loaded. `useAuthUser()` would send another profile request on every mount
// (see `useAccountRole`); the id is all this page needs, to keep an operator
// from changing their own access or deleting their own account.
const sessionProfile = useState<{ id?: string | null } | null>('auth-user', () => null)
const currentUserId = computed(() => sessionProfile.value?.id ?? null)

const list = useAdminList(createUserListOptions(requestJson, t))
const filters = list.filters

const statusOptions = computed(() => buildUserStatusOptions(t))
const roleOptions = computed(() => buildUserRoleOptions(t))
const statusLabels = computed(() => buildUserStatusLabels(t))
const roleLabels = computed(() => buildUserRoleLabels(t))
const emailStateLabels = computed(() => buildUserEmailStateLabels(t))
const localeLabels = computed(() => buildUserLocaleLabels(t))

function statusLabel(status: string): string {
  return statusLabels.value[status] ?? status
}

function roleLabel(role: string): string {
  return roleLabels.value[role] ?? role
}

function emailStateLabel(state: string): string {
  return emailStateLabels.value[state] ?? state
}

function localeLabel(locale: string | null): string {
  if (!locale)
    return t('dashboard.sections.users.editor.localeAuto', 'Auto')
  return localeLabels.value[locale] ?? locale
}

// Every cell is one line, so a row is exactly as tall as the skeleton row it
// replaces. 1280px leaves the user column about 236px; the rest is sized for the
// widest English value ("Admin" + "Pending deletion", three buttons).
const columns = computed<DataTableColumn<AdminUser>[]>(() => [
  { key: 'user', title: t('dashboard.sections.users.table.user', 'User') },
  { key: 'access', title: t('dashboard.sections.users.table.access', 'Access'), width: 256 },
  { key: 'emailState', title: t('dashboard.sections.users.table.emailState', 'Email'), width: 112 },
  { key: 'createdAt', title: t('dashboard.sections.users.table.created', 'Created'), width: 148 },
  { key: 'actions', title: t('dashboard.sections.users.table.actions', 'Actions'), width: 224 },
])

// ─── Drawer ────────────────────────────────────────────────────────────────

type UserDrawerMode = 'details' | 'edit' | 'subscription' | 'credits'

const drawerOpen = ref(false)
const drawerMode = ref<UserDrawerMode>('details')
const selectedUser = ref<AdminUser | null>(null)

const subscription = useAdminUserSubscription({ request: requestJson, t })
const credits = useAdminUserCredits({ request: requestJson, t })

const fieldIds = {
  name: useId(),
  image: useId(),
  duration: useId(),
  amount: useId(),
  reason: useId(),
}

const editorForm = reactive({ name: '', image: '', locale: 'none', role: 'user', status: 'active' })
const editorSaving = ref(false)
// Number fields hold what `TuffInput type="number"` emits: a number, or '' while empty.
const grantForm = reactive<{ plan: string, durationDays: number | string }>({ plan: 'PRO', durationDays: 365 })
const creditForm = reactive<{ direction: CreditDirection, amount: number | string, reason: string }>({
  direction: 'add',
  amount: 100,
  reason: '',
})

const drawerTitle = computed(() => ({
  details: t('dashboard.sections.users.details.title', 'User Details'),
  edit: t('dashboard.sections.users.editor.title', 'Edit User'),
  subscription: t('dashboard.sections.users.subscription.title', 'User Subscription'),
  credits: t('dashboard.sections.users.credits.title', 'Credits'),
})[drawerMode.value])

// A write in flight keeps the drawer open: closing it would orphan the request
// and leave no place to report its outcome.
const drawerBusy = computed(() => editorSaving.value || subscription.granting.value || credits.saving.value)

const accessLock = computed(() => (selectedUser.value ? userAccessLock(selectedUser.value, currentUserId.value) : null))
const selectedLifecycleLocked = computed(() => !selectedUser.value || isUserLifecycleLocked(selectedUser.value))
const canGrantSubscription = computed(() => selectedUser.value?.status === 'active')

function lockMessage(lock: 'merged' | 'deletionPending' | 'self' | null): string {
  if (lock === 'merged')
    return t('dashboard.sections.users.editor.mergedLocked', 'Merged users cannot be edited.')
  if (lock === 'deletionPending')
    return t('dashboard.sections.users.editor.deletionPendingLocked', 'Users pending deletion cannot be edited.')
  if (lock === 'self')
    return t('dashboard.sections.users.editor.selfLocked', 'You cannot change your own role or status here.')
  return ''
}

const creditsLockMessage = computed(() => {
  const lock = accessLock.value
  return lock === 'merged' || lock === 'deletionPending' ? lockMessage(lock) : ''
})

const localeOptions = computed(() => [
  { value: 'none', label: t('dashboard.sections.users.editor.localeAuto', 'Auto') },
  { value: 'zh', label: t('dashboard.sections.users.editor.localeZh', 'Chinese') },
  { value: 'en', label: t('dashboard.sections.users.editor.localeEn', 'English') },
])
const editRoleOptions = computed(() => roleOptions.value.filter(option => option.value !== 'all'))
const editStatusOptions = computed(() => statusOptions.value.filter(option => option.value === 'active' || option.value === 'disabled'))
const grantPlanOptions = GRANTABLE_SUBSCRIPTION_PLANS.map(plan => ({ value: plan, label: plan }))
const creditDirectionOptions = computed(() => [
  { value: 'add', label: t('dashboard.sections.users.credits.add', 'Add') },
  { value: 'subtract', label: t('dashboard.sections.users.credits.subtract', 'Subtract') },
])

function openUserDrawer(entry: AdminUser, mode: UserDrawerMode) {
  selectedUser.value = { ...entry }
  drawerMode.value = mode
  drawerOpen.value = true

  if (mode === 'edit') {
    Object.assign(editorForm, {
      name: entry.name || '',
      image: entry.image || '',
      locale: entry.locale === 'zh' || entry.locale === 'en' ? entry.locale : 'none',
      role: entry.role === 'admin' ? 'admin' : 'user',
      status: entry.status === 'disabled' ? 'disabled' : 'active',
    })
  }

  if (mode === 'subscription') {
    Object.assign(grantForm, { plan: 'PRO', durationDays: 365 })
    void subscription.open(entry.id)
  }
  else {
    subscription.close()
  }

  if (mode === 'credits') {
    Object.assign(creditForm, { direction: 'add', amount: 100, reason: '' })
    void credits.open(entry.id)
  }
  else {
    credits.close()
  }
}

// A row opens its details, like every console table; the buttons in the actions
// cell stop their click there, so pressing one opens only what it says.
function openDetail(entry: AdminUser) {
  openUserDrawer(entry, 'details')
}

// Closing the drawer (button, mask, Escape) drops whatever it was still loading.
watch(drawerOpen, (open) => {
  if (open)
    return
  subscription.close()
  credits.close()
})

function reportAction(result: AdminDrawerActionResult, success: string) {
  if (result.ok)
    toast.success(success)
  else if (result.message)
    toast.warning(result.message)
}

async function patchUser(userId: string, segment: 'profile' | 'role' | 'status', body: Record<string, unknown>) {
  const response = await requestJson<{ user?: Partial<AdminUser> }>(`/api/admin/users/${encodeURIComponent(userId)}/${segment}`, {
    method: 'PATCH',
    body,
  })
  if (response?.user && selectedUser.value?.id === userId)
    selectedUser.value = { ...selectedUser.value, ...response.user }
}

async function saveEditor() {
  const entry = selectedUser.value
  if (!entry || editorSaving.value || isUserLifecycleLocked(entry))
    return
  const accessEditable = !userAccessLock(entry, currentUserId.value)
  editorSaving.value = true
  let changed = false
  try {
    await patchUser(entry.id, 'profile', {
      name: editorForm.name.trim() || null,
      image: editorForm.image.trim() || null,
      locale: editorForm.locale === 'none' ? null : editorForm.locale,
    })
    changed = true
    if (accessEditable && entry.role !== editorForm.role)
      await patchUser(entry.id, 'role', { role: editorForm.role })
    if (accessEditable && entry.status !== editorForm.status)
      await patchUser(entry.id, 'status', { status: editorForm.status })
    toast.success(t('dashboard.sections.users.editor.saveSuccess', 'User updated.'))
    drawerOpen.value = false
  }
  catch (cause) {
    toast.warning(resolveAdminErrorMessage(cause, t('dashboard.sections.users.editor.saveFailed', 'Failed to update user.')))
  }
  finally {
    editorSaving.value = false
    // Part of a save may have landed before a later step failed; the list shows
    // what the server now holds either way.
    if (changed)
      void list.refresh()
  }
}

async function grantSubscription() {
  if (!canGrantSubscription.value || subscription.granting.value)
    return
  const check = validateSubscriptionGrant(grantForm)
  if (!check.ok) {
    toast.warning(t('dashboard.sections.users.editor.invalidDuration', 'Invalid subscription duration.'))
    return
  }
  reportAction(await subscription.grant(check), t('dashboard.sections.users.editor.subscriptionSuccess', 'Subscription granted.'))
}

const creditBalance = computed(() => credits.credits.value?.balance ?? null)
const creditUsagePercent = computed(() => Math.round(creditUsageRatio(creditBalance.value) * 100))
const creditsFirstLoad = computed(() => !credits.credits.value && !credits.error.value)

// The quota never goes below the plan allowance or this month's usage, and the
// API refuses a deduction past that whole. While subtracting, the amount's hint
// says how much can still go (the limit of the last answer for this account);
// more than that marks the field invalid and keeps Apply disabled.
const creditAmountHint = computed(() => creditDeductHint(creditForm, credits.credits.value?.limits ?? null, t, format.number))

async function adjustCredits() {
  if (selectedLifecycleLocked.value || credits.saving.value)
    return
  const check = validateCreditAdjustment(creditForm)
  if (!check.ok) {
    toast.warning(t('dashboard.sections.users.credits.invalidAmount', 'Invalid credit amount.'))
    return
  }
  // The hint under the amount already says why, in red.
  if (creditAmountHint.value?.invalid)
    return
  const result = await credits.adjust(check)
  if (result.ok && result.applied)
    creditForm.reason = ''
  if (!result.ok && 'maxDeduct' in result) {
    // The limit moved after the form read it (another adjustment, this month's
    // usage); the warning gives the one the API refused against.
    toast.warning(creditDeductRefusalMessage(result.maxDeduct, t, format.number))
    return
  }
  reportAction(result, t('dashboard.sections.users.credits.adjustSuccess', 'Credits updated.'))
}

// The change column holds the largest single adjustment the API allows,
// "−1,000,000,000" (121px with the cell padding).
const ledgerColumns = computed<DataTableColumn<CreditLedgerEntry>[]>(() => [
  { key: 'createdAt', title: t('dashboard.sections.users.credits.columns.time', 'Time'), width: 148 },
  { key: 'reason', title: t('dashboard.sections.users.credits.reason', 'Reason') },
  { key: 'delta', title: t('dashboard.sections.users.credits.columns.delta', 'Change'), width: 128, align: 'right' },
])

function ledgerDelta(entry: CreditLedgerEntry): string {
  const sign = entry.delta < 0 ? '−' : '+'
  return `${sign}${format.number(Math.abs(entry.delta))}`
}

function ledgerReason(entry: CreditLedgerEntry): string {
  return creditLedgerReason(entry, t, format.number)
}

// ─── Deletion ──────────────────────────────────────────────────────────────

const deletionOpen = ref(false)
const deletionTarget = ref<AdminUser | null>(null)
const deletionSaving = ref(false)

const deletionDescription = computed(() => [
  t('dashboard.sections.users.deletion.warningTitle', 'This schedules account deletion.'),
  t('dashboard.sections.users.deletion.warningBody', 'The account enters a 30-day recovery window. Devices, temporary tokens, and API keys are revoked immediately; financial and credit records are preserved.'),
].join('\n'))

function openDeletion(entry: AdminUser) {
  if (!canRequestUserDeletion(entry, currentUserId.value))
    return
  deletionTarget.value = entry
  deletionOpen.value = true
}

async function requestDeletion() {
  const entry = deletionTarget.value
  if (!entry || deletionSaving.value)
    return
  deletionSaving.value = true
  try {
    // The dialog only confirms once the operator has typed this exact address.
    await requestJson(`/api/admin/users/${encodeURIComponent(entry.id)}/deletion`, {
      method: 'POST',
      body: { confirmEmail: entry.email },
    })
    toast.success(t('dashboard.sections.users.deletion.success', 'User deletion scheduled.'))
    deletionOpen.value = false
    void list.refresh()
  }
  catch (cause) {
    toast.warning(resolveAdminErrorMessage(cause, t('dashboard.sections.users.deletion.failed', 'Failed to schedule user deletion.')))
  }
  finally {
    deletionSaving.value = false
  }
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.users', 'User Management')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="list.loading.value || list.refreshing.value" @click="list.refresh()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <template #filters>
      <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
        <AdminFilterField :label="t('dashboard.sections.users.filters.searchLabel', 'Search')" for="admin-user-search" wide>
          <TxSearchInput
            id="admin-user-search"
            v-model="filters.q"
            autocomplete="off"
            :placeholder="t('dashboard.sections.users.filters.searchPlaceholder', 'Search by name or email')"
          />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.users.filters.statusLabel', 'Status')">
          <TxSelect v-model="filters.status" :options="statusOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.users.filters.roleLabel', 'Role')">
          <TxSelect v-model="filters.role" :options="roleOptions" />
        </AdminFilterField>
      </AdminFilterBar>
    </template>

    <AdminSection :padded="false">
      <AdminTable
        :columns="columns"
        :rows="list.rows.value"
        row-key="id"
        :loading="list.loading.value"
        :refreshing="list.refreshing.value"
        :error="list.error.value"
        :empty-title="t('dashboard.sections.users.empty', 'No users found.')"
        :filtered-empty-title="t('dashboard.sections.users.emptyFiltered', 'No users match these filters.')"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        clickable-rows
        @retry="list.refresh()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
        @row-click="openDetail"
      >
        <template #cell-user="{ row }">
          <AdminIdentity :name="row.name" :email="row.email" :avatar="row.image" :fallback="row.id" size="sm" compact />
        </template>
        <template #cell-access="{ row }">
          <span class="UsersLine">
            <TxStatusBadge :text="roleLabel(row.role)" :status="userRoleTone(row.role)" size="sm" />
            <TxStatusBadge :text="statusLabel(row.status)" :status="userStatusTone(row.status)" size="sm" />
          </span>
        </template>
        <template #cell-emailState="{ row }">
          <span class="UsersText" :class="{ 'is-muted': row.emailState !== 'verified' }">{{ emailStateLabel(row.emailState) }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="UsersText is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <!-- A click on a button (Enter and Space click it too) stops here instead
               of reaching the row, which would open the details as well. -->
          <span class="UsersLine" @click.stop>
            <TxButton variant="bare" size="sm" @click="openUserDrawer(row, 'details')">
              {{ t('dashboard.sections.users.actions.details', 'Details') }}
            </TxButton>
            <TxButton variant="secondary" size="sm" :disabled="isUserLifecycleLocked(row)" @click="openUserDrawer(row, 'edit')">
              {{ t('dashboard.sections.users.actions.edit', 'Edit') }}
            </TxButton>
            <TxDropdownMenu placement="bottom-end" :min-width="180">
              <template #trigger>
                <TxButton variant="secondary" size="sm">
                  {{ t('dashboard.sections.users.actions.more', 'More') }}
                </TxButton>
              </template>
              <TxDropdownItem @select="openUserDrawer(row, 'subscription')">
                {{ t('dashboard.sections.users.actions.subscription', 'Subscription') }}
              </TxDropdownItem>
              <TxDropdownItem @select="openUserDrawer(row, 'credits')">
                {{ t('dashboard.sections.users.actions.credits', 'Credit ledger') }}
              </TxDropdownItem>
              <TxDropdownItem danger :disabled="!canRequestUserDeletion(row, currentUserId)" @select="openDeletion(row)">
                {{ t('dashboard.sections.users.actions.delete', 'Delete') }}
              </TxDropdownItem>
            </TxDropdownMenu>
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <TxDrawer
      v-model:visible="drawerOpen"
      :title="drawerTitle"
      size="560px"
      :show-close="!drawerBusy"
      :close-on-click-mask="!drawerBusy"
      :close-on-press-escape="!drawerBusy"
    >
      <div v-if="selectedUser" class="UserDrawer">
        <div class="UserDrawer-Identity">
          <AdminIdentity :name="selectedUser.name" :email="selectedUser.email" :avatar="selectedUser.image" :fallback="selectedUser.id" />
          <p class="UserDrawer-Id" :title="selectedUser.id">
            {{ t('dashboard.sections.users.details.idLine', { id: selectedUser.id }) }}
          </p>
        </div>

        <TxDescriptions v-if="drawerMode === 'details'" :columns="2" size="sm">
          <TxDescriptionsItem :label="t('dashboard.sections.users.table.role', 'Role')">
            {{ roleLabel(selectedUser.role) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.users.table.status', 'Status')">
            <TxStatusBadge :text="statusLabel(selectedUser.status)" :status="userStatusTone(selectedUser.status)" size="sm" />
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.users.table.emailState', 'Email')">
            {{ emailStateLabel(selectedUser.emailState) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.users.editor.locale', 'Locale')">
            {{ localeLabel(selectedUser.locale) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem :label="t('dashboard.sections.users.table.created', 'Created')">
            {{ format.dateTimeTitle(selectedUser.createdAt) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem v-if="selectedUser.disabledAt" :label="t('dashboard.sections.users.details.disabledAt', 'Disabled at')">
            {{ format.dateTimeTitle(selectedUser.disabledAt) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem v-if="selectedUser.deletionRequestedAt" :label="t('dashboard.sections.users.details.deletionRequestedAt', 'Deletion requested')">
            {{ format.dateTimeTitle(selectedUser.deletionRequestedAt) }}
          </TxDescriptionsItem>
          <TxDescriptionsItem v-if="selectedUser.deletionScheduledAt" :label="t('dashboard.sections.users.details.deletionScheduledAt', 'Scheduled deletion')">
            {{ format.dateTimeTitle(selectedUser.deletionScheduledAt) }}
          </TxDescriptionsItem>
        </TxDescriptions>

        <form v-else-if="drawerMode === 'edit'" id="admin-user-editor" class="UserDrawer-Form" @submit.prevent="saveEditor">
          <section class="UserDrawer-Group">
            <h3 class="UserDrawer-GroupTitle">
              {{ t('dashboard.sections.users.editor.profile', 'Profile') }}
            </h3>
            <div class="UserDrawer-Fields">
              <AdminFormField class="UserDrawer-Field--full" :label="t('dashboard.sections.users.editor.name', 'Display name')" :for="fieldIds.name">
                <TuffInput :id="fieldIds.name" v-model="editorForm.name" autocomplete="off" :disabled="editorSaving" />
              </AdminFormField>
              <AdminFormField class="UserDrawer-Field--full" :label="t('dashboard.sections.users.editor.image', 'Avatar URL')" :for="fieldIds.image">
                <TuffInput :id="fieldIds.image" v-model="editorForm.image" autocomplete="off" :disabled="editorSaving" />
              </AdminFormField>
              <AdminFormField :label="t('dashboard.sections.users.editor.locale', 'Locale')">
                <TxSelect v-model="editorForm.locale" :options="localeOptions" :disabled="editorSaving" />
              </AdminFormField>
            </div>
          </section>
          <section class="UserDrawer-Group">
            <h3 class="UserDrawer-GroupTitle">
              {{ t('dashboard.sections.users.editor.access', 'Access') }}
            </h3>
            <TxAlert v-if="accessLock" type="warning" :closable="false" :message="lockMessage(accessLock)" />
            <div class="UserDrawer-Fields">
              <AdminFormField :label="t('dashboard.sections.users.table.role', 'Role')">
                <TxSelect v-model="editorForm.role" :options="editRoleOptions" :disabled="Boolean(accessLock) || editorSaving" />
              </AdminFormField>
              <AdminFormField :label="t('dashboard.sections.users.table.status', 'Status')">
                <TxSelect v-model="editorForm.status" :options="editStatusOptions" :disabled="Boolean(accessLock) || editorSaving" />
              </AdminFormField>
            </div>
          </section>
        </form>

        <template v-else-if="drawerMode === 'subscription'">
          <section class="UserDrawer-Group">
            <div class="UserDrawer-GroupHeader">
              <h3 class="UserDrawer-GroupTitle">
                {{ t('dashboard.sections.users.subscription.current', 'Current subscription') }}
              </h3>
              <TxButton variant="secondary" size="sm" :disabled="subscription.loading.value" @click="subscription.refresh()">
                {{ t('common.refresh', 'Refresh') }}
              </TxButton>
            </div>
            <TxErrorState
              v-if="subscription.error.value && !subscription.subscription.value"
              size="small"
              :title="t('dashboard.sections.users.subscription.loadFailed', 'Failed to load subscription.')"
              :description="subscription.error.value"
              :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
              @primary="subscription.refresh()"
            />
            <template v-else>
              <TxAlert v-if="subscription.error.value" type="error" :closable="false" :message="subscription.error.value" />
              <TxDescriptions :columns="2" size="sm">
                <TxDescriptionsItem :label="t('dashboard.sections.users.editor.plan', 'Plan')">
                  <span v-if="!subscription.subscription.value" class="UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="56" :height="10" />
                  </span>
                  <template v-else>
                    {{ subscription.subscription.value.plan }}
                  </template>
                </TxDescriptionsItem>
                <TxDescriptionsItem :label="t('dashboard.sections.users.table.status', 'Status')">
                  <span class="UserDrawer-BadgeValue">
                    <TxSkeleton v-if="!subscription.subscription.value" :width="72" :height="23" />
                    <TxStatusBadge
                      v-else
                      :text="subscription.subscription.value.isActive ? t('dashboard.sections.subscriptions.status.active', 'Active') : t('dashboard.sections.subscriptions.status.expired', 'Expired')"
                      :status="subscription.subscription.value.isActive ? 'success' : 'danger'"
                      size="sm"
                    />
                  </span>
                </TxDescriptionsItem>
                <TxDescriptionsItem :label="t('dashboard.sections.subscriptions.table.activatedAt', 'Activated')">
                  <span v-if="!subscription.subscription.value" class="UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="128" :height="10" />
                  </span>
                  <template v-else>
                    {{ subscription.subscription.value.activatedAt ? format.dateTimeTitle(subscription.subscription.value.activatedAt) : '' }}
                  </template>
                </TxDescriptionsItem>
                <TxDescriptionsItem :label="t('dashboard.sections.subscriptions.table.expiresAt', 'Expires')">
                  <span v-if="!subscription.subscription.value" class="UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="128" :height="10" />
                  </span>
                  <template v-else>
                    {{ subscription.subscription.value.expiresAt ? format.dateTimeTitle(subscription.subscription.value.expiresAt) : '' }}
                  </template>
                </TxDescriptionsItem>
              </TxDescriptions>
            </template>
          </section>
          <form id="admin-user-subscription" class="UserDrawer-Form UserDrawer-Group" novalidate @submit.prevent="grantSubscription">
            <h3 class="UserDrawer-GroupTitle">
              {{ t('dashboard.sections.users.editor.grantSubscription', 'Grant / renew') }}
            </h3>
            <TxAlert v-if="!canGrantSubscription" type="warning" :closable="false" :message="t('dashboard.sections.users.subscription.activeOnly', 'Only active users can receive a subscription.')" />
            <div class="UserDrawer-Fields">
              <AdminFormField :label="t('dashboard.sections.users.editor.plan', 'Plan')">
                <TxSelect v-model="grantForm.plan" :options="grantPlanOptions" :disabled="!canGrantSubscription || subscription.granting.value" />
              </AdminFormField>
              <AdminFormField :label="t('dashboard.sections.users.editor.durationDays', 'Duration (days)')" :for="fieldIds.duration">
                <TuffInput
                  :id="fieldIds.duration"
                  v-model="grantForm.durationDays"
                  type="number"
                  min="1"
                  :max="SUBSCRIPTION_GRANT_MAX_DAYS"
                  step="1"
                  :disabled="!canGrantSubscription || subscription.granting.value"
                />
              </AdminFormField>
            </div>
          </form>
        </template>

        <template v-else-if="drawerMode === 'credits'">
          <TxErrorState
            v-if="credits.error.value && !credits.credits.value"
            size="small"
            :title="t('dashboard.sections.users.credits.loadFailed', 'Failed to load credits.')"
            :description="credits.error.value"
            :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
            @primary="credits.refresh()"
          />
          <template v-else>
            <TxAlert v-if="credits.error.value" type="error" :closable="false" :message="credits.error.value" />
            <section class="UserDrawer-Group">
              <div class="UserDrawer-GroupHeader">
                <h3 class="UserDrawer-GroupTitle">
                  {{ t('dashboard.sections.users.credits.balance', 'This month') }}
                </h3>
                <span class="UserDrawer-Meta">{{ credits.credits.value?.month }}</span>
              </div>
              <TxDescriptions :columns="3" layout="vertical" size="sm">
                <TxDescriptionsItem :label="t('dashboard.sections.users.credits.remaining', 'Remaining')">
                  <span v-if="creditsFirstLoad" class="UserDrawer-Number UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="64" :height="12" />
                  </span>
                  <span v-else class="UserDrawer-Number">{{ format.number(creditRemaining(creditBalance)) }}</span>
                </TxDescriptionsItem>
                <TxDescriptionsItem :label="t('dashboard.sections.users.credits.used', 'Used')">
                  <span v-if="creditsFirstLoad" class="UserDrawer-Number UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="64" :height="12" />
                  </span>
                  <span v-else class="UserDrawer-Number">{{ format.number(creditBalance?.used ?? 0) }}</span>
                </TxDescriptionsItem>
                <TxDescriptionsItem :label="t('dashboard.sections.users.credits.quota', 'Quota')">
                  <span v-if="creditsFirstLoad" class="UserDrawer-Number UserDrawer-SkeletonValue" aria-hidden="true">
                    <TxSkeleton :width="64" :height="12" />
                  </span>
                  <span v-else class="UserDrawer-Number">{{ format.number(creditBalance?.quota ?? 0) }}</span>
                </TxDescriptionsItem>
              </TxDescriptions>
              <TxProgressBar
                :percentage="creditUsagePercent"
                height="6px"
                :aria-label="t('dashboard.sections.users.credits.usageLabel', 'Credit usage this month')"
              />
            </section>

            <form id="admin-user-credits" class="UserDrawer-Form UserDrawer-Group" novalidate @submit.prevent="adjustCredits">
              <h3 class="UserDrawer-GroupTitle">
                {{ t('dashboard.sections.users.credits.adjustTitle', 'Adjust quota') }}
              </h3>
              <TxAlert v-if="creditsLockMessage" type="warning" :closable="false" :message="creditsLockMessage" />
              <div class="UserDrawer-Fields">
                <AdminFormField :label="t('dashboard.sections.users.credits.direction', 'Direction')">
                  <TxSelect v-model="creditForm.direction" :options="creditDirectionOptions" :disabled="selectedLifecycleLocked || credits.saving.value" />
                </AdminFormField>
                <AdminFormField
                  :label="t('dashboard.sections.users.credits.amount', 'Amount')"
                  :for="fieldIds.amount"
                  :hint="creditAmountHint?.text"
                  :invalid="creditAmountHint?.invalid"
                >
                  <TuffInput
                    :id="fieldIds.amount"
                    v-model="creditForm.amount"
                    type="number"
                    min="1"
                    step="1"
                    :disabled="selectedLifecycleLocked || credits.saving.value"
                  />
                </AdminFormField>
                <AdminFormField class="UserDrawer-Field--full" :label="t('dashboard.sections.users.credits.reason', 'Reason')" :for="fieldIds.reason">
                  <TuffInput
                    :id="fieldIds.reason"
                    v-model="creditForm.reason"
                    maxlength="120"
                    autocomplete="off"
                    :placeholder="t('dashboard.sections.users.credits.reasonPlaceholder', 'Optional audit reason')"
                    :disabled="selectedLifecycleLocked || credits.saving.value"
                  />
                </AdminFormField>
              </div>
              <div class="UserDrawer-FormActions">
                <TxButton
                  variant="primary"
                  size="sm"
                  native-type="submit"
                  :loading="credits.saving.value"
                  :disabled="selectedLifecycleLocked || credits.saving.value || !credits.credits.value || Boolean(creditAmountHint?.invalid)"
                >
                  {{ t('dashboard.sections.users.credits.apply', 'Apply') }}
                </TxButton>
              </div>
            </form>

            <section class="UserDrawer-Group">
              <h3 class="UserDrawer-GroupTitle">
                {{ t('dashboard.sections.users.credits.ledger', 'Credit ledger') }}
              </h3>
              <AdminTable
                class="UserDrawer-Ledger"
                :columns="ledgerColumns"
                :rows="credits.credits.value?.entries ?? []"
                row-key="id"
                :loading="creditsFirstLoad"
                :refreshing="credits.loading.value && Boolean(credits.credits.value)"
                :empty-title="t('dashboard.sections.users.credits.emptyLedger', 'No credit ledger entries.')"
                :page="credits.credits.value?.page ?? 1"
                :limit="credits.credits.value?.limit ?? USER_CREDIT_LEDGER_PAGE_SIZE"
                :total="credits.credits.value?.total ?? 0"
                table-layout="fixed"
                @update:page="credits.setPage"
              >
                <template #cell-createdAt="{ row }">
                  <span class="UsersText is-numeric" :title="format.dateTimeTitle(row.createdAt)">{{ format.tableDateTime(row.createdAt) }}</span>
                </template>
                <template #cell-reason="{ row }">
                  <span class="UsersText" :title="ledgerReason(row)">{{ ledgerReason(row) }}</span>
                </template>
                <template #cell-delta="{ row }">
                  <span class="UsersText is-numeric" :class="row.delta < 0 ? 'is-negative' : 'is-positive'">{{ ledgerDelta(row) }}</span>
                </template>
              </AdminTable>
            </section>
          </template>
        </template>
      </div>

      <template #footer>
        <div class="UserDrawer-Footer">
          <TxButton variant="secondary" size="sm" :disabled="drawerBusy" @click="drawerOpen = false">
            {{ drawerMode === 'details' || drawerMode === 'credits' ? t('common.close', 'Close') : t('common.cancel', 'Cancel') }}
          </TxButton>
          <TxButton
            v-if="drawerMode === 'edit'"
            variant="primary"
            size="sm"
            native-type="submit"
            form="admin-user-editor"
            :loading="editorSaving"
            :disabled="editorSaving || selectedLifecycleLocked"
          >
            {{ t('common.save', 'Save') }}
          </TxButton>
          <TxButton
            v-else-if="drawerMode === 'subscription'"
            variant="primary"
            size="sm"
            native-type="submit"
            form="admin-user-subscription"
            :loading="subscription.granting.value"
            :disabled="subscription.granting.value || !canGrantSubscription"
          >
            {{ t('dashboard.sections.users.editor.grantSubscription', 'Grant / renew') }}
          </TxButton>
        </div>
      </template>
    </TxDrawer>

    <AdminConfirmDialog
      v-model:open="deletionOpen"
      :title="t('dashboard.sections.users.deletion.title', 'Request User Deletion')"
      :description="deletionDescription"
      :confirm-label="t('dashboard.sections.users.deletion.confirmAction', 'Schedule deletion')"
      tone="danger"
      :require-text="deletionTarget?.email"
      :loading="deletionSaving"
      @confirm="requestDeletion"
    >
      <AdminIdentity
        v-if="deletionTarget"
        :name="deletionTarget.name"
        :email="deletionTarget.email"
        :avatar="deletionTarget.image"
        :fallback="deletionTarget.id"
        size="sm"
      />
    </AdminConfirmDialog>
  </AdminPageShell>
</template>

<style scoped>
/* A cell of buttons or badges is one line box tall, like a text cell and like
   the skeleton row it replaces: the 26px buttons and 23px badges overhang it
   into the cell padding instead of making the row taller. */
.UsersLine {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 1lh;
  min-width: 0;
  white-space: nowrap;
}

/* One line; what does not fit is cut and shown in full in the title. */
.UsersText {
  display: block;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.UsersText.is-muted {
  color: var(--tx-text-color-regular);
}

.UsersText.is-numeric {
  font-variant-numeric: tabular-nums;
}

.UsersText.is-positive {
  color: var(--tx-color-success);
}

.UsersText.is-negative {
  color: var(--tx-color-danger);
}

.UserDrawer {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.UserDrawer-Identity {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.UserDrawer-Id {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.UserDrawer-Group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.UserDrawer-GroupHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.UserDrawer-GroupTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.UserDrawer-Meta {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

/* Fields span the drawer like the descriptions and the ledger around them. */
.UserDrawer-Form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.UserDrawer-Form.UserDrawer-Group {
  gap: 12px;
}

/* Two columns of fields; a field that needs the room spans both. */
.UserDrawer-Fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.UserDrawer-Field--full {
  grid-column: 1 / -1;
}

.UserDrawer-FormActions {
  display: flex;
  justify-content: flex-end;
}

/* A placeholder value is one line box tall, like the value it stands for; next
   to a number it takes the number's size, so its line box is the same height. */
.UserDrawer-SkeletonValue {
  display: inline-flex;
  align-items: center;
  height: 1lh;
  vertical-align: top;
}

/* A small badge is 23px tall (a 15px disc in 4px of padding), taller than the
   19.5px line around it. It and its placeholder share one top-aligned box of
   that height, so the row neither grows nor moves its label when the
   subscription arrives. */
.UserDrawer-BadgeValue {
  display: inline-flex;
  align-items: center;
  vertical-align: top;
}

.UserDrawer-Number {
  color: var(--tx-text-color-primary);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* The ledger and its pager read as one block inside the drawer. */
.UserDrawer-Ledger {
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
}

.UserDrawer-Footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
