<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { ActivationCodeItem, AdminSubscriptionItem, CreditLedgerEntry, CreditPricingRule } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFilterBar from '@/components/ConsoleFilterBar.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { formatDateTime, formatNumber } from '@/utils/format'

const { t, locale } = useI18n()

const activeTab = ref<'pricing' | 'codes' | 'subscriptions' | 'ledger'>('pricing')
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const planOptions = [
  { value: 'PLUS', label: 'PLUS' },
  { value: 'PRO', label: 'PRO' },
  { value: 'TEAM', label: 'TEAM' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
]

const planFilterOptions = [
  { value: '', label: 'All' },
  { value: 'FREE', label: 'FREE' },
  ...planOptions,
]

// ─── Tab 1: Unified Model Pricing ─────────────────────────────────────────────
const pricingCache = ref<CreditPricingRule[] | null>(null)
const editingRule = ref<CreditPricingRule | null>(null)
const savingRule = ref(false)
const pricingForm = reactive({
  creditsPerUnit: '1',
  minCredits: '1',
  reserveMultiplier: '1.5',
  upstreamCostUsdPerUnit: '',
  active: true,
})

const pricingList = useConsoleList<CreditPricingRule, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!pricingCache.value) {
      const res = await consoleApi.listAdminCreditPricing()
      pricingCache.value = res.rules ?? []
    }
    const q = filters.q.toLowerCase()
    const rows = q
      ? pricingCache.value.filter(r => r.capability.toLowerCase().includes(q))
      : pricingCache.value
    return sliceClientPage(rows, page, limit)
  },
})

const pricingColumns = computed<DataTableColumn<CreditPricingRule>[]>(() => [
  { key: 'capability', title: t('dashboard.capabilityCol'), minWidth: 200 },
  { key: 'creditsPerUnit', title: t('dashboard.creditsPerUnitCol'), align: 'right', minWidth: 130 },
  { key: 'minCredits', title: t('dashboard.minCreditsCol'), align: 'right', minWidth: 110 },
  { key: 'reserveMultiplier', title: t('admin.reserveMultiplierCol'), align: 'right', minWidth: 100 },
  { key: 'upstreamCostUsdPerUnit', title: t('admin.upstreamCostCol'), align: 'right', minWidth: 140 },
  { key: 'active', title: t('common.status'), minWidth: 100 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 100 },
])

function openEditRule(rule: CreditPricingRule) {
  editingRule.value = rule
  pricingForm.creditsPerUnit = String(rule.creditsPerUnit)
  pricingForm.minCredits = String(rule.minCredits)
  pricingForm.reserveMultiplier = String(rule.reserveMultiplier)
  pricingForm.upstreamCostUsdPerUnit = rule.upstreamCostUsdPerUnit != null ? String(rule.upstreamCostUsdPerUnit) : ''
  pricingForm.active = rule.active
}

async function savePricingRule() {
  if (!editingRule.value)
    return
  savingRule.value = true
  try {
    await consoleApi.updateAdminCreditPricing({
      capability: editingRule.value.capability,
      creditsPerUnit: Number(pricingForm.creditsPerUnit),
      minCredits: Number(pricingForm.minCredits),
      reserveMultiplier: Number(pricingForm.reserveMultiplier),
      upstreamCostUsdPerUnit: pricingForm.upstreamCostUsdPerUnit.trim()
        ? Number(pricingForm.upstreamCostUsdPerUnit)
        : null,
      active: pricingForm.active,
    })
    editingRule.value = null
    pricingCache.value = null
    await pricingList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingRule.value = false
  }
}

// ─── Tab 2: Redemption Codes ──────────────────────────────────────────────────
const generateOpen = ref(false)
const generatingCodes = ref(false)
const revokeCodeTarget = ref<ActivationCodeItem | null>(null)
const revokingCode = ref(false)

const codeForm = reactive({
  plan: 'PRO',
  durationDays: '30',
  maxUses: '1',
  expiresInDays: '90',
  count: '5',
})

const codesList = useConsoleList<ActivationCodeItem, { q: string, plan: string }>({
  defaults: { q: '', plan: '' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listAdminCodes({
      page,
      limit,
      q: filters.q || undefined,
      plan: filters.plan || undefined,
    })
    return {
      rows: res.codes ?? [],
      total: res.pagination?.total ?? 0,
    }
  },
})

const codeColumns = computed<DataTableColumn<ActivationCodeItem>[]>(() => [
  { key: 'code', title: t('admin.codeCol'), minWidth: 180 },
  { key: 'plan', title: t('admin.planCol'), minWidth: 100 },
  { key: 'uses', title: t('admin.usesCol'), align: 'right', minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 100 },
  { key: 'expiresAt', title: t('admin.expiresAtCol'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 110 },
])

async function submitGenerateCodes() {
  generatingCodes.value = true
  try {
    await consoleApi.generateAdminCodes({
      plan: codeForm.plan,
      durationDays: Number(codeForm.durationDays) || 30,
      maxUses: Number(codeForm.maxUses) || 1,
      expiresInDays: Number(codeForm.expiresInDays) || 90,
      count: Number(codeForm.count) || 1,
    })
    generateOpen.value = false
    await codesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    generatingCodes.value = false
  }
}

async function confirmRevokeCode() {
  if (!revokeCodeTarget.value)
    return
  revokingCode.value = true
  try {
    await consoleApi.updateAdminCodeStatus(revokeCodeTarget.value.id, 'revoked')
    revokeCodeTarget.value = null
    await codesList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    revokingCode.value = false
  }
}

// ─── Tab 3: Subscription Grants ───────────────────────────────────────────────
const grantOpen = ref(false)
const granting = ref(false)
const grantForm = reactive({
  email: '',
  plan: 'PRO',
  durationDays: '30',
})

const subscriptionsList = useConsoleList<AdminSubscriptionItem, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listAdminSubscriptions({
      page,
      limit,
      q: filters.q || undefined,
    })
    return {
      rows: res.subscriptions ?? [],
      total: res.pagination?.total ?? 0,
    }
  },
})

const subscriptionColumns = computed<DataTableColumn<AdminSubscriptionItem>[]>(() => [
  { key: 'user', title: t('admin.userCol'), minWidth: 220 },
  { key: 'plan', title: t('admin.planCol'), minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 110 },
  { key: 'expiresAt', title: t('admin.expiresAtCol'), minWidth: 160 },
])

async function submitGrantSubscription() {
  if (!grantForm.email.trim())
    return
  granting.value = true
  try {
    await consoleApi.grantAdminSubscription({
      email: grantForm.email.trim().toLowerCase(),
      plan: grantForm.plan,
      durationDays: Number(grantForm.durationDays) || 30,
    })
    grantOpen.value = false
    grantForm.email = ''
    await subscriptionsList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    granting.value = false
  }
}

// ─── Tab 4: Global Credit Ledger ──────────────────────────────────────────────
const ledgerList = useConsoleList<CreditLedgerEntry, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 20,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    const res = await consoleApi.listAdminCreditLedger({
      page,
      limit,
      q: filters.q || undefined,
    })
    return {
      rows: res.entries ?? [],
      total: res.pagination?.total ?? 0,
    }
  },
})

const ledgerColumns = computed<DataTableColumn<CreditLedgerEntry>[]>(() => [
  { key: 'createdAt', title: t('common.createdAt'), minWidth: 160 },
  { key: 'user', title: t('admin.userCol'), minWidth: 180 },
  { key: 'reason', title: t('dashboard.reasonCol'), minWidth: 180 },
  { key: 'delta', title: t('dashboard.deltaCol'), align: 'right', minWidth: 100 },
])
</script>

<template>
  <ConsolePageShell :title="t('admin.creditsTitle')">
    <template #actions>
      <TxButton v-if="activeTab === 'codes'" variant="primary" size="sm" icon="i-carbon-add" @click="generateOpen = true">
        {{ t('admin.generateCodes') }}
      </TxButton>
      <TxButton v-else-if="activeTab === 'subscriptions'" variant="primary" size="sm" icon="i-carbon-gift" @click="grantOpen = true">
        {{ t('admin.grantSubscription') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <TxTabs v-model="activeTab">
      <TxTabItem name="pricing">
        <template #name>
{{ t('admin.tabPricing') }}
</template>
        <div class="console-form-stack CreditsTab">
          <ConsoleFilterBar :active="pricingList.hasActiveFilters.value" @clear="pricingList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="cred-price-q">
              <TuffInput id="cred-price-q" v-model="pricingList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="pricingColumns"
              :rows="pricingList.rows.value"
              row-key="capability"
              :loading="pricingList.loading.value"
              :refreshing="pricingList.refreshing.value"
              :error="pricingList.error.value"
              :filtered="pricingList.hasActiveFilters.value"
              :page="pricingList.page.value"
              :limit="pricingList.limit.value"
              :total="pricingList.total.value"
              :page-sizes="pricingList.pageSizes"
              @retry="pricingCache = null; pricingList.refresh()"
              @clear-filters="pricingList.clearFilters()"
              @update:page="pricingList.setPage($event)"
              @update:limit="pricingList.setLimit($event)"
            >
              <template #cell-capability="{ row }">
                <span class="console-mono">{{ row.capability }}</span>
              </template>
              <template #cell-creditsPerUnit="{ row }">
                {{ formatNumber(row.creditsPerUnit, locale) }}
              </template>
              <template #cell-minCredits="{ row }">
                {{ formatNumber(row.minCredits, locale) }}
              </template>
              <template #cell-upstreamCostUsdPerUnit="{ row }">
                {{ row.upstreamCostUsdPerUnit != null ? `$${row.upstreamCostUsdPerUnit}` : '—' }}
              </template>
              <template #cell-active="{ row }">
                <TxStatusBadge
                  :text="row.active ? t('common.active') : t('common.disabled')"
                  :status="row.active ? 'success' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-actions="{ row }">
                <TxButton variant="ghost" size="sm" @click="openEditRule(row)">
                  {{ t('common.edit') }}
                </TxButton>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="codes">
        <template #name>
{{ t('admin.tabCodes') }}
</template>
        <div class="console-form-stack CreditsTab">
          <ConsoleFilterBar :active="codesList.hasActiveFilters.value" @clear="codesList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="codes-q">
              <TuffInput id="codes-q" v-model="codesList.filters.q" :placeholder="t('admin.codeCol')" />
            </ConsoleFormField>
            <ConsoleFormField :label="t('admin.planCol')">
              <TxSelect v-model="codesList.filters.plan" :options="planFilterOptions" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="codeColumns"
              :rows="codesList.rows.value"
              row-key="id"
              :loading="codesList.loading.value"
              :refreshing="codesList.refreshing.value"
              :error="codesList.error.value"
              :filtered="codesList.hasActiveFilters.value"
              :page="codesList.page.value"
              :limit="codesList.limit.value"
              :total="codesList.total.value"
              :page-sizes="codesList.pageSizes"
              @retry="codesList.refresh()"
              @clear-filters="codesList.clearFilters()"
              @update:page="codesList.setPage($event)"
              @update:limit="codesList.setLimit($event)"
            >
              <template #cell-code="{ row }">
                <span class="console-mono">{{ row.code }}</span>
              </template>
              <template #cell-plan="{ row }">
                <TxTag :label="row.plan" size="sm" variant="soft" />
              </template>
              <template #cell-uses="{ row }">
                {{ row.uses ?? row.used_count ?? 0 }} / {{ row.maxUses ?? row.max_uses ?? 1 }}
              </template>
              <template #cell-status="{ row }">
                <TxStatusBadge
                  :text="row.status"
                  :status="row.status === 'active' ? 'success' : row.status === 'revoked' ? 'danger' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-expiresAt="{ row }">
                {{ formatDateTime(row.expiresAt ?? row.expires_at, locale) }}
              </template>
              <template #cell-actions="{ row }">
                <TxButton v-if="row.status === 'active'" variant="danger" size="sm" @click="revokeCodeTarget = row">
                  {{ t('common.revoke') }}
                </TxButton>
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="subscriptions">
        <template #name>
{{ t('admin.tabSubscriptions') }}
</template>
        <div class="console-form-stack CreditsTab">
          <ConsoleFilterBar :active="subscriptionsList.hasActiveFilters.value" @clear="subscriptionsList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="subs-q">
              <TuffInput id="subs-q" v-model="subscriptionsList.filters.q" :placeholder="t('admin.searchUsersPlaceholder')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="subscriptionColumns"
              :rows="subscriptionsList.rows.value"
              :row-key="(row: AdminSubscriptionItem) => row.user.id"
              :loading="subscriptionsList.loading.value"
              :refreshing="subscriptionsList.refreshing.value"
              :error="subscriptionsList.error.value"
              :filtered="subscriptionsList.hasActiveFilters.value"
              :page="subscriptionsList.page.value"
              :limit="subscriptionsList.limit.value"
              :total="subscriptionsList.total.value"
              :page-sizes="subscriptionsList.pageSizes"
              @retry="subscriptionsList.refresh()"
              @clear-filters="subscriptionsList.clearFilters()"
              @update:page="subscriptionsList.setPage($event)"
              @update:limit="subscriptionsList.setLimit($event)"
            >
              <template #cell-user="{ row }">
                <div>
                  <div>{{ row.user.name || row.user.email }}</div>
                  <div v-if="row.user.name" class="console-muted">
{{ row.user.email }}
</div>
                </div>
              </template>
              <template #cell-plan="{ row }">
                <TxTag :label="row.subscription.plan" size="sm" variant="soft" />
              </template>
              <template #cell-status="{ row }">
                <TxStatusBadge
                  :text="row.subscription.isActive ? t('common.active') : t('common.disabled')"
                  :status="row.subscription.isActive ? 'success' : 'muted'"
                  size="sm"
                />
              </template>
              <template #cell-expiresAt="{ row }">
                {{ formatDateTime(row.subscription.expiresAt, locale) }}
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>

      <TxTabItem name="ledger">
        <template #name>
{{ t('admin.tabLedger') }}
</template>
        <div class="console-form-stack CreditsTab">
          <ConsoleFilterBar :active="ledgerList.hasActiveFilters.value" @clear="ledgerList.clearFilters()">
            <ConsoleFormField :label="t('common.search')" for-id="admin-ledger-q">
              <TuffInput id="admin-ledger-q" v-model="ledgerList.filters.q" :placeholder="t('common.search')" />
            </ConsoleFormField>
          </ConsoleFilterBar>
          <ConsoleSection :padded="false">
            <ConsoleTable
              :columns="ledgerColumns"
              :rows="ledgerList.rows.value"
              row-key="id"
              :loading="ledgerList.loading.value"
              :refreshing="ledgerList.refreshing.value"
              :error="ledgerList.error.value"
              :filtered="ledgerList.hasActiveFilters.value"
              :page="ledgerList.page.value"
              :limit="ledgerList.limit.value"
              :total="ledgerList.total.value"
              :page-sizes="ledgerList.pageSizes"
              @retry="ledgerList.refresh()"
              @clear-filters="ledgerList.clearFilters()"
              @update:page="ledgerList.setPage($event)"
              @update:limit="ledgerList.setLimit($event)"
            >
              <template #cell-createdAt="{ row }">
                {{ formatDateTime(row.createdAt, locale) }}
              </template>
              <template #cell-user="{ row }">
                {{ row.userEmail || row.userId || '—' }}
              </template>
              <template #cell-delta="{ row }">
                <TxStatusBadge
                  :text="row.delta >= 0 ? `+${formatNumber(row.delta, locale)}` : formatNumber(row.delta, locale)"
                  :status="row.delta >= 0 ? 'success' : 'muted'"
                  size="sm"
                />
              </template>
            </ConsoleTable>
          </ConsoleSection>
        </div>
      </TxTabItem>
    </TxTabs>

    <TxModal
      :model-value="Boolean(editingRule)"
      :title="t('admin.editPricing')"
      :close-label="t('common.close')"
      width="460px"
      @update:model-value="!$event && (editingRule = null)"
    >
      <div class="console-form-stack">
        <div class="console-mono">
{{ editingRule?.capability }}
</div>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('dashboard.creditsPerUnitCol')" for-id="pr-cpu">
            <TuffInput id="pr-cpu" v-model="pricingForm.creditsPerUnit" type="number" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.minCreditsCol')" for-id="pr-min">
            <TuffInput id="pr-min" v-model="pricingForm.minCredits" type="number" />
          </ConsoleFormField>
        </div>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.reserveMultiplierCol')" for-id="pr-res">
            <TuffInput id="pr-res" v-model="pricingForm.reserveMultiplier" type="number" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.upstreamCostCol')" for-id="pr-usd">
            <TuffInput id="pr-usd" v-model="pricingForm.upstreamCostUsdPerUnit" type="number" />
          </ConsoleFormField>
        </div>
        <div class="CreditsSwitchRow">
          <span>{{ t('common.active') }}</span>
          <TxSwitch v-model="pricingForm.active" />
        </div>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="editingRule = null">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="savingRule" @click="savePricingRule">
          {{ t('common.save') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="generateOpen"
      :title="t('admin.generateCodes')"
      :close-label="t('common.close')"
      width="460px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('admin.planCol')">
          <TxSelect v-model="codeForm.plan" :options="planOptions" />
        </ConsoleFormField>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.durationDays')" for-id="gc-dur">
            <TuffInput id="gc-dur" v-model="codeForm.durationDays" type="number" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.codeCount')" for-id="gc-cnt">
            <TuffInput id="gc-cnt" v-model="codeForm.count" type="number" />
          </ConsoleFormField>
        </div>
        <div class="console-form-grid">
          <ConsoleFormField :label="t('admin.maxUses')" for-id="gc-uses">
            <TuffInput id="gc-uses" v-model="codeForm.maxUses" type="number" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('admin.expiresInDays')" for-id="gc-exp">
            <TuffInput id="gc-exp" v-model="codeForm.expiresInDays" type="number" />
          </ConsoleFormField>
        </div>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="generateOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" :loading="generatingCodes" @click="submitGenerateCodes">
          {{ t('common.create') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="grantOpen"
      :title="t('admin.grantSubscription')"
      :close-label="t('common.close')"
      width="440px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('admin.targetEmail')" for-id="gr-email">
          <TuffInput id="gr-email" v-model="grantForm.email" type="email" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('admin.planCol')">
          <TxSelect v-model="grantForm.plan" :options="planOptions" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('admin.durationDays')" for-id="gr-dur">
          <TuffInput id="gr-dur" v-model="grantForm.durationDays" type="number" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="grantOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="granting"
          :disabled="!grantForm.email.trim()"
          @click="submitGrantSubscription"
        >
          {{ t('common.confirm') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(revokeCodeTarget)"
      :title="t('admin.revokeCodeTitle')"
      :description="t('admin.revokeCodeDesc', { code: revokeCodeTarget?.code || '' })"
      :loading="revokingCode"
      @update:open="!$event && (revokeCodeTarget = null)"
      @confirm="confirmRevokeCode"
    />
  </ConsolePageShell>
</template>

<style scoped>
.CreditsTab {
  padding-top: 12px;
}

.CreditsSwitchRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}
</style>
