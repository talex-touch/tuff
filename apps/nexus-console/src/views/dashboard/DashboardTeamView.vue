<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { DashboardTeamResponse, ReceivedTeamInvitation, TeamInviteItem, TeamMemberItem } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleStatGrid from '@/components/ConsoleStatGrid.vue'
import type { ConsoleStatItem } from '@/components/ConsoleStatGrid.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage } from '@/composables/useConsoleList'
import { formatDateTime, formatNumber } from '@/utils/format'

const { t, locale } = useI18n()

const loading = ref(true)
const teamData = ref<DashboardTeamResponse['team'] | null>(null)
const teamCreditsUsed = ref(0)
const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)

const memberPage = ref(1)
const memberLimit = ref(10)
const invitePage = ref(1)
const inviteLimit = ref(10)

const createTeamOpen = ref(false)
const createTeamName = ref('')
const creatingTeam = ref(false)

const disbandOpen = ref(false)
const disbanding = ref(false)

const createInviteOpen = ref(false)
const creatingInvite = ref(false)
const inviteForm = reactive({
  target: '',
  role: 'member' as 'admin' | 'member',
  expiresInDays: '7',
})

const roleOptions = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
]

const stats = computed<ConsoleStatItem[]>(() => {
  const tm = teamData.value
  return [
    {
      key: 'seats',
      label: t('dashboard.teamSeats'),
      value: tm ? `${tm.seats.used} / ${tm.seats.total}` : '—',
      meta: tm?.name,
      iconClass: 'i-carbon-group',
    },
    {
      key: 'plan',
      label: t('dashboard.teamPlan'),
      value: tm?.plan || 'FREE',
      meta: tm?.type,
      iconClass: 'i-carbon-badge',
    },
    {
      key: 'ai',
      label: t('dashboard.teamAiQuota'),
      value: tm?.quota
        ? `${formatNumber(tm.quota.aiRequests.used, locale.value)} / ${formatNumber(tm.quota.aiRequests.limit, locale.value)}`
        : '—',
      iconClass: 'i-carbon-machine-learning-model',
    },
    {
      key: 'credits',
      label: t('dashboard.teamCreditsUsed'),
      value: formatNumber(teamCreditsUsed.value, locale.value),
      iconClass: 'i-carbon-currency',
    },
  ]
})

const memberPageSlice = computed(() =>
  sliceClientPage(teamData.value?.members ?? [], memberPage.value, memberLimit.value),
)

const invitePageSlice = computed(() =>
  sliceClientPage(teamData.value?.invites ?? [], invitePage.value, inviteLimit.value),
)

const memberColumns = computed<DataTableColumn<TeamMemberItem>[]>(() => [
  { key: 'name', title: t('dashboard.memberCol'), minWidth: 200 },
  { key: 'role', title: t('dashboard.roleCol'), minWidth: 110 },
  { key: 'status', title: t('common.status'), minWidth: 100 },
  { key: 'joinedAt', title: t('dashboard.joinedCol'), minWidth: 150 },
])

const inviteColumns = computed<DataTableColumn<TeamInviteItem>[]>(() => [
  { key: 'email', title: t('auth.emailLabel'), minWidth: 200 },
  { key: 'role', title: t('dashboard.roleCol'), minWidth: 100 },
  { key: 'status', title: t('common.status'), minWidth: 110 },
  { key: 'expiresAt', title: t('dashboard.apiKeyExpires'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 100 },
])

const receivedColumns = computed<DataTableColumn<ReceivedTeamInvitation>[]>(() => [
  { key: 'teamName', title: t('dashboard.teamNameLabel'), minWidth: 180 },
  { key: 'role', title: t('dashboard.roleCol'), minWidth: 100 },
  { key: 'expiresAt', title: t('dashboard.apiKeyExpires'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 130 },
])

async function loadTeam() {
  loading.value = true
  feedback.value = null
  try {
    const [overviewRes, usageRes] = await Promise.allSettled([
      consoleApi.getTeamOverview(),
      consoleApi.getTeamCreditsUsage(),
    ])
    if (overviewRes.status === 'fulfilled')
      teamData.value = overviewRes.value.team
    else
      feedback.value = { type: 'error', message: resolveErrorMessage(overviewRes.reason, t('common.loadFailed')) }

    if (usageRes.status === 'fulfilled')
      teamCreditsUsed.value = usageRes.value.totalUsed ?? usageRes.value.used ?? usageRes.value.totalCredits ?? 0
  }
  finally {
    loading.value = false
  }
}

async function submitCreateTeam() {
  if (!createTeamName.value.trim())
    return
  creatingTeam.value = true
  try {
    await consoleApi.createTeam({ name: createTeamName.value.trim() })
    createTeamOpen.value = false
    createTeamName.value = ''
    await loadTeam()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    creatingTeam.value = false
  }
}

async function confirmDisband() {
  disbanding.value = true
  try {
    await consoleApi.disbandTeam()
    disbandOpen.value = false
    await loadTeam()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    disbanding.value = false
  }
}

async function submitCreateInvite() {
  if (!inviteForm.target.trim())
    return
  creatingInvite.value = true
  try {
    const days = Number(inviteForm.expiresInDays)
    await consoleApi.createTeamInvite({
      target: inviteForm.target.trim(),
      role: inviteForm.role,
      expiresInDays: Number.isFinite(days) && days > 0 ? days : 7,
    })
    createInviteOpen.value = false
    inviteForm.target = ''
    await loadTeam()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    creatingInvite.value = false
  }
}

async function revokeInvite(invite: TeamInviteItem) {
  try {
    await consoleApi.revokeTeamInvite(invite.id)
    await loadTeam()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

async function acceptReceived(invite: ReceivedTeamInvitation) {
  try {
    await consoleApi.acceptInvitation(invite.id)
    await loadTeam()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
}

onMounted(() => void loadTeam())
</script>

<template>
  <ConsolePageShell :title="t('dashboard.teamTitle')">
    <template #actions>
      <TxButton variant="secondary" size="sm" icon="i-carbon-renew" :loading="loading" @click="loadTeam">
        {{ t('common.refresh') }}
      </TxButton>
      <TxButton
        v-if="teamData?.permissions.canCreateTeam"
        variant="primary"
        size="sm"
        icon="i-carbon-add"
        @click="createTeamOpen = true"
      >
        {{ t('dashboard.createTeam') }}
      </TxButton>
      <TxButton
        v-if="teamData?.permissions.canInvite"
        variant="primary"
        size="sm"
        icon="i-carbon-user-follow"
        @click="createInviteOpen = true"
      >
        {{ t('dashboard.createInvite') }}
      </TxButton>
      <TxButton
        v-if="teamData?.permissions.canDisband"
        variant="danger"
        size="sm"
        @click="disbandOpen = true"
      >
        {{ t('dashboard.disbandTeam') }}
      </TxButton>
    </template>

    <TxAlert v-if="feedback" :type="feedback.type" :message="feedback.message" closable @close="feedback = null" />

    <ConsoleStatGrid :items="stats" :loading="loading" :skeleton-count="4" />

    <ConsoleSection :title="t('dashboard.membersSection')" :padded="false">
      <ConsoleTable
        :columns="memberColumns"
        :rows="memberPageSlice.rows"
        row-key="id"
        :loading="loading"
        :page="memberPage"
        :limit="memberLimit"
        :total="memberPageSlice.total"
        :page-sizes="[10, 20, 50]"
        @retry="loadTeam"
        @update:page="memberPage = $event"
        @update:limit="memberLimit = $event; memberPage = 1"
      >
        <template #cell-name="{ row }">
          <div>
            <div>{{ row.name }}</div>
            <div v-if="row.email && row.email !== row.name" class="console-muted">
{{ row.email }}
</div>
          </div>
        </template>
        <template #cell-role="{ row }">
          <TxTag :label="row.role" size="sm" variant="soft" />
        </template>
        <template #cell-status="{ row }">
          <TxStatusBadge :text="row.status" status="success" size="sm" />
        </template>
        <template #cell-joinedAt="{ row }">
          {{ formatDateTime(row.joinedAt, locale) }}
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection v-if="teamData?.permissions.canInvite" :title="t('dashboard.invitesSection')" :padded="false">
      <ConsoleTable
        :columns="inviteColumns"
        :rows="invitePageSlice.rows"
        row-key="id"
        :loading="loading"
        :page="invitePage"
        :limit="inviteLimit"
        :total="invitePageSlice.total"
        :page-sizes="[10, 20]"
        @retry="loadTeam"
        @update:page="invitePage = $event"
        @update:limit="inviteLimit = $event; invitePage = 1"
      >
        <template #cell-role="{ row }">
          <TxTag :label="row.role" size="sm" variant="soft" />
        </template>
        <template #cell-status="{ row }">
          <TxStatusBadge
            :text="row.status"
            :status="row.status === 'pending' ? 'warning' : row.status === 'accepted' ? 'success' : 'muted'"
            size="sm"
          />
        </template>
        <template #cell-expiresAt="{ row }">
          {{ formatDateTime(row.expiresAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton v-if="row.status === 'pending'" variant="danger" size="sm" @click="revokeInvite(row)">
            {{ t('common.revoke') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection
      v-if="teamData?.receivedInvites?.length"
      :title="t('dashboard.receivedInvitesSection')"
      :padded="false"
    >
      <ConsoleTable
        :columns="receivedColumns"
        :rows="teamData.receivedInvites"
        row-key="id"
        :loading="loading"
        :page="1"
        :limit="20"
        :total="teamData.receivedInvites.length"
      >
        <template #cell-teamName="{ row }">
          {{ row.teamName || row.organizationName || row.teamId }}
        </template>
        <template #cell-role="{ row }">
          <TxTag :label="row.role" size="sm" variant="soft" />
        </template>
        <template #cell-expiresAt="{ row }">
          {{ formatDateTime(row.expiresAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton variant="primary" size="sm" @click="acceptReceived(row)">
            {{ t('auth.acceptInvite') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <TxModal
      v-model="createTeamOpen"
      :title="t('dashboard.createTeam')"
      :close-label="t('common.close')"
      width="420px"
    >
      <ConsoleFormField :label="t('dashboard.teamNameLabel')" for-id="new-team-name">
        <TuffInput id="new-team-name" v-model="createTeamName" />
      </ConsoleFormField>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="createTeamOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="creatingTeam"
          :disabled="!createTeamName.trim()"
          @click="submitCreateTeam"
        >
          {{ t('common.create') }}
        </TxButton>
      </template>
    </TxModal>

    <TxModal
      v-model="createInviteOpen"
      :title="t('dashboard.createInvite')"
      :close-label="t('common.close')"
      width="440px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('dashboard.inviteTarget')" for-id="invite-target">
          <TuffInput id="invite-target" v-model="inviteForm.target" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.inviteRole')">
          <TxSelect v-model="inviteForm.role" :options="roleOptions" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.inviteExpiry')" for-id="invite-expiry">
          <TuffInput id="invite-expiry" v-model="inviteForm.expiresInDays" type="number" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="createInviteOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="creatingInvite"
          :disabled="!inviteForm.target.trim()"
          @click="submitCreateInvite"
        >
          {{ t('common.create') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      v-model:open="disbandOpen"
      :title="t('dashboard.disbandTeamTitle')"
      :description="t('dashboard.disbandTeamDesc')"
      require-text="DISBAND"
      :loading="disbanding"
      @confirm="confirmDisband"
    />
  </ConsolePageShell>
</template>
