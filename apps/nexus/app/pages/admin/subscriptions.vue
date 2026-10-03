<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import type { AdminActivationCode, CodeGenerationField } from '~/utils/admin-codes'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton, TxCopyButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, reactive, ref, useId } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminFilterField from '~/components/admin/AdminFilterField.vue'
import AdminFormField from '~/components/admin/AdminFormField.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import AdminTable from '~/components/admin/AdminTable.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminList } from '~/composables/useAdminList'
import { useToast } from '~/composables/useToast'
import {
  ACTIVATION_CODE_PLANS,
  buildCodePlanOptions,
  buildCodeStatusLabels,
  buildCodeStatusOptions,
  CODE_GENERATION_DEFAULTS,
  CODE_GENERATION_LIMITS,
  codeDurationLabel,
  codeStatusTone,
  createCodeListOptions,
  isRevocableCode,
  showCodeActionsColumn,
  validateCodeGeneration,
} from '~/utils/admin-codes'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
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

const list = useAdminList(createCodeListOptions(requestJson, t))
const filters = list.filters

const planOptions = computed(() => buildCodePlanOptions(t))
const statusOptions = computed(() => buildCodeStatusOptions(t))
const statusLabels = computed(() => buildCodeStatusLabels(t))

function statusLabel(status: string): string {
  return statusLabels.value[status] ?? status
}

const showActions = computed(() => showCodeActionsColumn({
  rows: list.rows.value,
  loading: list.loading.value,
  status: list.appliedFilters.value.status,
}))

// Every cell is one line, so a row is exactly as tall as the skeleton row it
// replaces. Each fixed column is its widest value plus the 24px cell padding and
// 2–4px to spare, measured in both locales with the fonts the console renders
// (PingFang SC, SF Mono for the badges): the ENTERPRISE tag 88px, "365 days" 56px,
// "1,000 / 1,000" 79px, the "Exhausted" badge 100px, a timestamp 117px, "Revoke"
// 62px — 807px in all. At 1440px with a classic scrollbar the table is 1119px
// wide, so the code column keeps 312px: the longest code (TUFF-ENTERPRISE-…,
// 29 characters, 233px) and its 38px icon-only copy button with 9px to spare.
// Narrower, the code is cut (full text in its title) and the copy button still
// copies all of it.
const columns = computed<DataTableColumn<AdminActivationCode>[]>(() => [
  { key: 'code', title: t('dashboard.sections.codes.table.code', 'Code') },
  { key: 'plan', title: t('dashboard.sections.codes.table.plan', 'Plan'), width: 115 },
  { key: 'duration', title: t('dashboard.sections.codes.table.duration', 'Duration'), width: 84 },
  { key: 'uses', title: t('dashboard.sections.codes.table.uses', 'Uses'), width: 106 },
  { key: 'status', title: t('dashboard.sections.codes.table.status', 'Status'), width: 126 },
  { key: 'created', title: t('dashboard.sections.codes.table.created', 'Created'), width: 144 },
  { key: 'expires', title: t('dashboard.sections.codes.table.expires', 'Expires'), width: 144 },
  ...(showActions.value
    ? [{ key: 'actions', title: t('dashboard.sections.codes.table.actions', 'Actions'), width: 88 }]
    : []),
])

function durationLabel(days: number): string {
  return codeDurationLabel(days, t, format.number)
}

function copyFailed() {
  toast.warning(t('dashboard.sections.codes.copyFailed', 'Failed to copy activation code.'))
}

// ─── Revoke ────────────────────────────────────────────────────────────────

const revokeOpen = ref(false)
const revokeTarget = ref<AdminActivationCode | null>(null)
const revoking = ref(false)

function openRevoke(code: AdminActivationCode) {
  if (!isRevocableCode(code))
    return
  revokeTarget.value = code
  revokeOpen.value = true
}

async function revokeCode() {
  const code = revokeTarget.value
  if (!code || revoking.value)
    return
  revoking.value = true
  try {
    await requestJson(`/api/admin/codes/${encodeURIComponent(code.id)}`, { method: 'PATCH', body: { status: 'revoked' } })
    toast.success(t('dashboard.sections.codes.revokeSuccess', 'Activation code revoked.'))
    revokeOpen.value = false
    void list.refresh()
  }
  catch (cause) {
    toast.warning(resolveAdminErrorMessage(cause, t('dashboard.sections.codes.revokeFailed', 'Failed to revoke activation code.')))
  }
  finally {
    revoking.value = false
  }
}

// ─── Generator ─────────────────────────────────────────────────────────────

const generatorOpen = ref(false)
const generating = ref(false)
const generationError = ref<string | null>(null)
// Number fields hold what `TuffInput type="number"` emits: a number, or '' while empty.
const generatorForm = reactive<{ plan: string } & Record<CodeGenerationField, number | string>>({ ...CODE_GENERATION_DEFAULTS })
const invalidFields = ref<CodeGenerationField[]>([])
const generatorPlanOptions = ACTIVATION_CODE_PLANS.map(plan => ({ value: plan, label: plan }))

const generatorFieldIds: Record<CodeGenerationField, string> = {
  durationDays: useId(),
  maxUses: useId(),
  expiresInDays: useId(),
  count: useId(),
}

const generatorFields = computed(() => [
  { key: 'durationDays' as const, label: t('dashboard.sections.codes.form.durationDays', 'Duration (days)') },
  { key: 'expiresInDays' as const, label: t('dashboard.sections.codes.form.expiresInDays', 'Expires in (days)') },
  { key: 'maxUses' as const, label: t('dashboard.sections.codes.form.maxUses', 'Max uses') },
  { key: 'count' as const, label: t('dashboard.sections.codes.form.count', 'Count') },
])

// The accepted range sits under each field (`AdminFormField`'s hint); it turns red
// when the value is out of it.
function rangeHint(field: CodeGenerationField): string {
  const { min, max } = CODE_GENERATION_LIMITS[field]
  return t('dashboard.sections.codes.form.range', { min: format.number(min), max: format.number(max) })
}

function openGenerator() {
  Object.assign(generatorForm, CODE_GENERATION_DEFAULTS)
  invalidFields.value = []
  generationError.value = null
  generatorOpen.value = true
}

// Nothing closes the dialog while the request runs: the codes would be created
// with nowhere left to say so.
function requestCloseGenerator(open: boolean) {
  if (!open && generating.value)
    return
  generatorOpen.value = open
}

async function generateCodes() {
  if (generating.value)
    return
  const check = validateCodeGeneration(generatorForm)
  if (!check.ok) {
    invalidFields.value = check.fields
    return
  }
  invalidFields.value = []
  generationError.value = null
  generating.value = true
  try {
    await requestJson('/api/admin/codes/generate', { method: 'POST', body: check.body })
    toast.success(t('dashboard.sections.codes.generateSuccess', 'Activation codes generated.'))
    generatorOpen.value = false
    // Newest first: the new codes are on the first page.
    if (list.page.value === 1)
      void list.refresh()
    else
      list.setPage(1)
  }
  catch (cause) {
    generationError.value = resolveAdminErrorMessage(cause, t('dashboard.sections.codes.errors.generateFailed', 'Failed to generate activation codes.'))
  }
  finally {
    generating.value = false
  }
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.subscriptions', 'Activation Codes')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="list.loading.value || list.refreshing.value" @click="list.refresh()">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
      <TxButton variant="primary" size="sm" icon="i-carbon-add" @click="openGenerator">
        {{ t('dashboard.sections.codes.generateButton', 'Generate Codes') }}
      </TxButton>
    </template>

    <template #filters>
      <AdminFilterBar :active="list.hasActiveFilters.value" @clear="list.clearFilters()">
        <AdminFilterField :label="t('dashboard.sections.codes.filters.search', 'Search')" for="admin-code-search" wide>
          <TxSearchInput
            id="admin-code-search"
            v-model="filters.q"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('dashboard.sections.codes.filters.searchPlaceholder', 'Search activation code')"
          />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.codes.form.plan', 'Plan')">
          <TxSelect v-model="filters.plan" :options="planOptions" />
        </AdminFilterField>
        <AdminFilterField :label="t('dashboard.sections.codes.table.status', 'Status')">
          <TxSelect v-model="filters.status" :options="statusOptions" />
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
        :empty-title="t('dashboard.sections.codes.empty', 'No activation codes yet. Use Generate Codes to create some.')"
        :filtered-empty-title="t('dashboard.sections.codes.emptyFiltered', 'No activation codes match these filters.')"
        :filtered="list.hasActiveFilters.value"
        :page="list.page.value"
        :limit="list.limit.value"
        :total="list.total.value"
        :page-sizes="list.pageSizes"
        table-layout="fixed"
        @retry="list.refresh()"
        @clear-filters="list.clearFilters()"
        @update:page="list.setPage"
        @update:limit="list.setLimit"
      >
        <template #cell-code="{ row }">
          <span class="CodesLine">
            <code class="CodesCode" :title="row.code">{{ row.code }}</code>
            <!-- Icon only: a visible "Copy" / "Copied" label costs the code column
                 the 40–50px that the full code needs at 1440px. The button keeps
                 its accessible name and announces "Copied" all the same. -->
            <TxCopyButton
              class="CodesCopy"
              :text="row.code"
              :copy-label="t('dashboard.sections.adminKit.copy', 'Copy')"
              :copied-label="t('dashboard.sections.adminKit.copied', 'Copied')"
              :title="t('dashboard.sections.adminKit.copy', 'Copy')"
              @error="copyFailed"
            >
              <span aria-hidden="true" />
            </TxCopyButton>
          </span>
        </template>
        <template #cell-plan="{ row }">
          <span class="CodesLine">
            <TxTag :label="row.plan" size="sm" :variant="row.plan === 'FREE' ? 'plain' : 'soft'" />
          </span>
        </template>
        <template #cell-duration="{ row }">
          <span class="CodesText is-numeric">{{ durationLabel(row.duration_days) }}</span>
        </template>
        <template #cell-uses="{ row }">
          <span class="CodesText is-numeric">{{ format.number(row.uses) }} / {{ format.number(row.max_uses) }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="CodesLine">
            <TxStatusBadge :text="statusLabel(row.status)" :status="codeStatusTone(row.status)" size="sm" />
          </span>
        </template>
        <template #cell-created="{ row }">
          <span class="CodesText is-numeric" :title="format.dateTimeTitle(row.created_at)">{{ format.tableDateTime(row.created_at) }}</span>
        </template>
        <template #cell-expires="{ row }">
          <span class="CodesText is-numeric" :title="format.dateTimeTitle(row.expires_at)">{{ format.tableDateTime(row.expires_at) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <span v-if="isRevocableCode(row)" class="CodesLine">
            <TxButton variant="secondary" size="sm" @click="openRevoke(row)">
              {{ t('dashboard.sections.codes.revoke', 'Revoke') }}
            </TxButton>
          </span>
        </template>
      </AdminTable>
    </AdminSection>

    <AdminConfirmDialog
      v-model:open="revokeOpen"
      :title="t('dashboard.sections.codes.revokeConfirm.title', 'Revoke activation code?')"
      :description="revokeTarget ? t('dashboard.sections.codes.revokeConfirm.description', { code: revokeTarget.code }) : ''"
      :confirm-label="t('dashboard.sections.codes.revoke', 'Revoke')"
      tone="danger"
      :loading="revoking"
      @confirm="revokeCode"
    />

    <TxModal
      :model-value="generatorOpen"
      :title="t('dashboard.sections.codes.generateTitle', 'Generate New Codes')"
      width="480px"
      @update:model-value="requestCloseGenerator"
    >
      <form id="admin-code-generator" class="CodeForm" novalidate @submit.prevent="generateCodes">
        <AdminFormField class="CodeForm-Field--full" :label="t('dashboard.sections.codes.form.plan', 'Plan')">
          <TxSelect v-model="generatorForm.plan" :options="generatorPlanOptions" :disabled="generating" />
        </AdminFormField>
        <AdminFormField
          v-for="field in generatorFields"
          :key="field.key"
          :label="field.label"
          :for="generatorFieldIds[field.key]"
          :hint="rangeHint(field.key)"
          :invalid="invalidFields.includes(field.key)"
        >
          <TuffInput
            :id="generatorFieldIds[field.key]"
            v-model="generatorForm[field.key]"
            type="number"
            :min="CODE_GENERATION_LIMITS[field.key].min"
            :max="CODE_GENERATION_LIMITS[field.key].max"
            step="1"
            :disabled="generating"
          />
        </AdminFormField>
        <TxAlert v-if="generationError" class="CodeForm-Field--full" type="error" :closable="false" :message="generationError" />
      </form>
      <template #footer>
        <TxButton variant="secondary" size="sm" :disabled="generating" @click="requestCloseGenerator(false)">
          {{ t('common.cancel', 'Cancel') }}
        </TxButton>
        <TxButton variant="primary" size="sm" native-type="submit" form="admin-code-generator" :loading="generating" :disabled="generating">
          {{ t('dashboard.sections.codes.generateButton', 'Generate Codes') }}
        </TxButton>
      </template>
    </TxModal>
  </AdminPageShell>
</template>

<style scoped>
/* A cell holding a control is one line box tall, like a text cell and like the
   skeleton row it replaces: the copy and revoke buttons and the badges overhang
   it into the cell padding instead of making the row taller. */
.CodesLine {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 1lh;
  min-width: 0;
  white-space: nowrap;
}

.CodesCode {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* No gap left for the empty label, so the icon sits in the middle of the button.
   Scoped under the cell so it outranks the button's own equally specific rule
   whichever stylesheet loads last. */
.CodesLine > .CodesCopy {
  flex: none;
  gap: 0;
}

/* One line; what does not fit is cut and shown in full in the title. */
.CodesText {
  display: block;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CodesText.is-numeric {
  font-variant-numeric: tabular-nums;
}

/* Two columns of fields; the plan spans both. */
.CodeForm {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.CodeForm-Field--full {
  grid-column: 1 / -1;
}
</style>
