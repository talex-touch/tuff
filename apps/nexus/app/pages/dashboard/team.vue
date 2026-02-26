<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxPagination, TxSkeleton, TxSpinner, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { computed, reactive, ref, watch } from 'vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'

defineI18nRoute(false)

interface TeamInvite {
  id: string
  code: string
  email: string | null
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: string | null
  createdAt: string
}

interface TeamMember {
  id: string
  userId: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  status: string
}

interface TeamPermissions {
  canInvite: boolean
  canManageMembers: boolean
  canDisband: boolean
  canCreateTeam: boolean
  canViewUsage: boolean
}

interface TeamUpgradeHint {
  required: boolean
  targetPlan: 'TEAM' | null
}

interface DashboardTeam {
  id: string
  name: string
  type: 'personal' | 'organization'
  role: 'owner' | 'admin' | 'member'
  plan: 'FREE' | 'PLUS' | 'PRO' | 'TEAM' | 'ENTERPRISE'
  collaborationEnabled: boolean
  seats: { used: number, total: number }
  permissions: TeamPermissions
  upgrade: TeamUpgradeHint
  members: TeamMember[]
  invites: TeamInvite[]
}

interface CreditUsageItem {
  userId: string
  name: string | null
  email: string | null
  quota: number
  used: number
  month: string
}

interface CreditLedgerItem {
  id: string
  teamId: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, any> | null
}

interface CreditTrendData {
  days: string[]
  values: number[]
  totalUsed: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface InvitePreview {
  invite: {
    code: string
    teamId: string
    teamName: string
    expiresAt: string | null
    status: string
    role: 'admin' | 'member'
    seats: { used: number, total: number }
  }
  validation: {
    canJoin: boolean
    reason: string
  }
}

const { t } = useI18n()
const { data, pending, refresh } = useFetch<{ team: DashboardTeam }>('/api/dashboard/team')

const team = computed(() => data.value?.team)
const canInvite = computed(() => Boolean(team.value?.permissions.canInvite))
const canCreateTeam = computed(() => Boolean(team.value?.permissions.canCreateTeam))
const canDisband = computed(() => Boolean(team.value?.permissions.canDisband))
const isPersonalTeam = computed(() => team.value?.type === 'personal')
const showTeamCredits = computed(() => team.value?.type === 'organization' && team.value?.permissions.canViewUsage)

const actionError = ref('')
const actionSuccess = ref('')
const createLoading = ref(false)
const inviteLoading = ref(false)
const deleteInviteLoading = ref(false)
const disbandLoading = ref(false)
const joinLoading = ref(false)
const joinPreviewLoading = ref(false)
const activationLoading = ref(false)

const creditUsage = ref<CreditUsageItem[]>([])
const creditUsageLoading = ref(false)
const creditUsageError = ref('')
const creditUsageSummary = reactive({ totalUsed: 0, totalQuota: 0, month: '' })
const creditUsageQuery = ref('')
const creditUsagePagination = reactive<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})

const creditLedger = ref<CreditLedgerItem[]>([])
const creditLedgerLoading = ref(false)
const creditLedgerError = ref('')
const creditLedgerQuery = ref('')
const creditLedgerPagination = reactive<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})

const creditTab = ref<'usage' | 'trend' | 'ledger'>('usage')
const creditTrend = ref<CreditTrendData | null>(null)
const creditTrendLoading = ref(false)
const creditTrendError = ref('')

const createOverlayVisible = ref(false)
const inviteOverlayVisible = ref(false)
const disbandOverlayVisible = ref(false)
const joinOverlayVisible = ref(false)

const createTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const inviteTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const disbandTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const joinTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)

const createTeamName = ref('')
const inviteEmail = ref('')
const inviteRole = ref<'admin' | 'member'>('member')
const joinCode = ref('')
const activationCode = ref('')
const invitePreview = ref<InvitePreview | null>(null)
const joinPreviewMessage = ref('')

function formatDateTime(value: string | null) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function normalizeSparkline(values: number[], width: number, height: number): { line: string, area: string } {
  if (!values.length) {
    return { line: '', area: '' }
  }

  const max = Math.max(1, ...values)
  const stepX = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => {
    const x = Number((index * stepX).toFixed(2))
    const y = Number((height - (value / max) * height).toFixed(2))
    return { x, y }
  })
  const line = points.map(point => `${point.x},${point.y}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return { line, area }
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number')
    return '0'
  return new Intl.NumberFormat().format(value)
}

function resolveCreditUserLabel(item: { name?: string | null; email?: string | null; userId?: string | null }) {
  return item.name || item.email || item.userId || '-'
}

function usagePercent(item: { used: number; quota: number }) {
  if (!item.quota)
    return 0
  return Math.min(100, Math.round((item.used / item.quota) * 100))
}

const creditTrendSparkline = computed(() => {
  const values = creditTrend.value?.values ?? []
  if (!values.length) {
    return { line: '', area: '', trend: '0%' }
  }
  const baseline = values[0] ?? 0
  const latest = values[values.length - 1] ?? 0
  const delta = latest - baseline
  const trend = delta === 0
    ? '0%'
    : `${delta > 0 ? '+' : ''}${Math.round((delta / Math.max(1, baseline || 1)) * 100)}%`
  const chart = normalizeSparkline(values, 280, 72)
  return {
    line: chart.line,
    area: chart.area,
    trend,
  }
})

function normalizeErrorMessage(error: any, fallback: string) {
  return error?.data?.statusMessage || error?.message || fallback
}

function resetMessages() {
  actionError.value = ''
  actionSuccess.value = ''
}

function resolveJoinReason(reason: string) {
  const key = reason || 'unknown'
  const mapping: Record<string, string> = {
    ok: t('team.join.reason.ok', '邀请码可用，可以加入团队。'),
    expired: t('team.join.reason.expired', '邀请码已过期。'),
    revoked: t('team.join.reason.revoked', '邀请码已撤销。'),
    used_up: t('team.join.reason.usedUp', '邀请码已达到使用上限。'),
    email_mismatch: t('team.join.reason.emailMismatch', '当前账号邮箱与邀请码绑定邮箱不一致。'),
    already_member: t('team.join.reason.alreadyMember', '你已经在团队中。'),
    seat_full: t('team.join.reason.seatFull', '团队席位已满。'),
    plan_locked: t('team.join.reason.planLocked', '团队套餐不支持协作。'),
  }

  return mapping[key] || t('team.join.reason.unknown', '邀请码暂不可用。')
}

async function handleCreateTeam(close?: () => void) {
  if (!canCreateTeam.value || createLoading.value)
    return

  createLoading.value = true
  resetMessages()

  try {
    await $fetch('/api/dashboard/team/create', {
      method: 'POST',
      body: {
        name: createTeamName.value.trim() || undefined,
      },
    })

    createTeamName.value = ''
    createOverlayVisible.value = false
    close?.()
    await refresh()
    actionSuccess.value = t('dashboard.team.success.teamCreated', '团队创建成功')
  }
  catch (error: any) {
    actionError.value = normalizeErrorMessage(error, t('dashboard.team.errors.createFailed', '创建团队失败'))
  }
  finally {
    createLoading.value = false
  }
}

async function handleCreateInvite(close?: () => void) {
  if (!canInvite.value || inviteLoading.value)
    return

  inviteLoading.value = true
  resetMessages()

  try {
    await $fetch('/api/dashboard/team/invites', {
      method: 'POST',
      body: {
        email: inviteEmail.value.trim() || undefined,
        role: inviteRole.value,
        maxUses: 1,
        expiresInDays: 7,
      },
    })

    inviteEmail.value = ''
    inviteRole.value = 'member'
    inviteOverlayVisible.value = false
    close?.()
    await refresh()
    actionSuccess.value = t('dashboard.team.success.inviteCreated', '邀请已生成')
  }
  catch (error: any) {
    actionError.value = normalizeErrorMessage(error, t('dashboard.team.errors.inviteFailed', '生成邀请失败'))
  }
  finally {
    inviteLoading.value = false
  }
}

async function handleDeleteInvite(id: string) {
  if (!canInvite.value || deleteInviteLoading.value)
    return

  deleteInviteLoading.value = true
  resetMessages()

  try {
    await $fetch(`/api/dashboard/team/invites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    await refresh()
    actionSuccess.value = t('dashboard.team.success.inviteDeleted', '邀请已删除')
  }
  catch (error: any) {
    actionError.value = normalizeErrorMessage(error, t('dashboard.team.errors.deleteInviteFailed', '删除邀请失败'))
  }
  finally {
    deleteInviteLoading.value = false
  }
}

async function handleDisband(close?: () => void) {
  if (!canDisband.value || disbandLoading.value)
    return

  disbandLoading.value = true
  resetMessages()

  try {
    await $fetch('/api/dashboard/team/disband', {
      method: 'POST',
    })

    disbandOverlayVisible.value = false
    close?.()
    await refresh()
    actionSuccess.value = t('dashboard.team.success.teamDisbanded', '团队已解散')
  }
  catch (error: any) {
    actionError.value = normalizeErrorMessage(error, t('dashboard.team.errors.disbandFailed', '解散团队失败'))
  }
  finally {
    disbandLoading.value = false
  }
}

async function previewInvite() {
  const code = joinCode.value.trim()
  invitePreview.value = null
  joinPreviewMessage.value = ''

  if (!code)
    return

  joinPreviewLoading.value = true
  resetMessages()

  try {
    const result = await $fetch<InvitePreview>(`/api/team/invite/${encodeURIComponent(code)}`)
    invitePreview.value = result
    joinPreviewMessage.value = resolveJoinReason(result.validation.reason)
  }
  catch (error: any) {
    const reason = error?.data?.data?.reason
    joinPreviewMessage.value = reason ? resolveJoinReason(reason) : normalizeErrorMessage(error, t('team.join.previewFailed', '邀请码预览失败'))
  }
  finally {
    joinPreviewLoading.value = false
  }
}

async function handleJoinTeam(close?: () => void) {
  if (joinLoading.value)
    return

  const code = joinCode.value.trim()
  if (!code) {
    joinPreviewMessage.value = t('team.join.codeRequired', '请输入邀请码')
    return
  }

  if (!invitePreview.value)
    await previewInvite()

  if (!invitePreview.value?.validation.canJoin)
    return

  joinLoading.value = true
  resetMessages()

  try {
    await $fetch('/api/team/join', {
      method: 'POST',
      body: { code },
    })

    joinCode.value = ''
    invitePreview.value = null
    joinPreviewMessage.value = ''
    joinOverlayVisible.value = false
    close?.()
    await refresh()
    actionSuccess.value = t('team.join.success', '加入成功')
  }
  catch (error: any) {
    const reason = error?.data?.data?.reason
    joinPreviewMessage.value = reason ? resolveJoinReason(reason) : normalizeErrorMessage(error, t('team.join.failed', '加入团队失败'))
  }
  finally {
    joinLoading.value = false
  }
}

async function handleActivateCode() {
  const code = activationCode.value.trim()
  if (!code || activationLoading.value)
    return

  activationLoading.value = true
  resetMessages()

  try {
    const result = await $fetch<{ plan: string, expiresAt: string | null }>('/api/subscription/activate', {
      method: 'POST',
      body: { code },
    })

    activationCode.value = ''
    await refresh()
    actionSuccess.value = `${t('dashboard.team.success.codeActivated', '激活码兑换成功')} (${result.plan})`
  }
  catch (error: any) {
    actionError.value = normalizeErrorMessage(error, t('dashboard.team.errors.activateFailed', '激活码兑换失败'))
  }
  finally {
    activationLoading.value = false
  }
}

async function fetchTeamCreditUsage(options: { resetPage?: boolean } = {}) {
  if (!showTeamCredits.value)
    return
  if (options.resetPage)
    creditUsagePagination.page = 1

  creditUsageLoading.value = true
  creditUsageError.value = ''
  try {
    const result = await $fetch<{
      month: string
      totalUsed: number
      totalQuota: number
      users: CreditUsageItem[]
      pagination: Pagination
    }>('/api/dashboard/team/credits/usage', {
      query: {
        page: creditUsagePagination.page,
        limit: creditUsagePagination.limit,
        q: creditUsageQuery.value.trim() || undefined,
      },
    })
    creditUsage.value = result.users || []
    creditUsageSummary.totalUsed = result.totalUsed ?? 0
    creditUsageSummary.totalQuota = result.totalQuota ?? 0
    creditUsageSummary.month = result.month || ''
    creditUsagePagination.page = result.pagination.page
    creditUsagePagination.limit = result.pagination.limit
    creditUsagePagination.total = result.pagination.total
    creditUsagePagination.totalPages = result.pagination.totalPages
  }
  catch (error: any) {
    creditUsageError.value = normalizeErrorMessage(error, t('dashboard.team.credits.errors.usage', '加载积分消耗失败'))
  }
  finally {
    creditUsageLoading.value = false
  }
}

async function fetchTeamCreditLedger(options: { resetPage?: boolean } = {}) {
  if (!showTeamCredits.value)
    return
  if (options.resetPage)
    creditLedgerPagination.page = 1

  creditLedgerLoading.value = true
  creditLedgerError.value = ''
  try {
    const result = await $fetch<{
      entries: CreditLedgerItem[]
      pagination: Pagination
    }>('/api/dashboard/team/credits/ledger', {
      query: {
        page: creditLedgerPagination.page,
        limit: creditLedgerPagination.limit,
        q: creditLedgerQuery.value.trim() || undefined,
      },
    })
    creditLedger.value = result.entries || []
    creditLedgerPagination.page = result.pagination.page
    creditLedgerPagination.limit = result.pagination.limit
    creditLedgerPagination.total = result.pagination.total
    creditLedgerPagination.totalPages = result.pagination.totalPages
  }
  catch (error: any) {
    creditLedgerError.value = normalizeErrorMessage(error, t('dashboard.team.credits.errors.ledger', '加载积分流水失败'))
  }
  finally {
    creditLedgerLoading.value = false
  }
}

async function fetchTeamCreditTrend() {
  if (!showTeamCredits.value)
    return

  creditTrendLoading.value = true
  creditTrendError.value = ''
  try {
    const result = await $fetch<CreditTrendData>('/api/dashboard/team/credits/trend')
    creditTrend.value = result
  }
  catch (error: any) {
    creditTrendError.value = normalizeErrorMessage(error, t('dashboard.team.credits.errors.trend', '加载趋势失败'))
  }
  finally {
    creditTrendLoading.value = false
  }
}

function applyCreditUsageFilter() {
  fetchTeamCreditUsage({ resetPage: true })
}

function applyCreditLedgerFilter() {
  fetchTeamCreditLedger({ resetPage: true })
}

function openManagePlan() {
  return navigateTo('/pricing')
}

watch(
  () => showTeamCredits.value,
  (value) => {
    if (value) {
      fetchTeamCreditUsage()
      fetchTeamCreditLedger()
      if (creditTab.value === 'trend')
        fetchTeamCreditTrend()
    }
  },
  { immediate: true },
)

watch(() => creditUsagePagination.page, () => fetchTeamCreditUsage())
watch(() => creditLedgerPagination.page, () => fetchTeamCreditLedger())

watch(() => creditTab.value, (value) => {
  if (value === 'trend' && !creditTrendLoading.value && !creditTrend.value) {
    fetchTeamCreditTrend()
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.menu.team', 'Plan & Team') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.team.subtitle', '统一管理套餐、团队成员与协作权限。') }}
      </p>
    </header>

    <section v-if="pending" class="apple-card-lg p-6 space-y-4">
      <div class="flex items-center gap-2 text-sm text-black/50 dark:text-white/50">
        <TxSpinner :size="16" />
        {{ t('dashboard.team.pending', '正在加载团队信息…') }}
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
    </section>

    <template v-else-if="team">
      <section class="apple-card-lg p-6">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <p class="apple-section-title">
              {{ t('dashboard.team.planLabel', '当前套餐') }}
            </p>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ team.plan }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <p class="apple-section-title">
              {{ t('dashboard.sections.team.currentTeam', '当前团队') }}
            </p>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ team.name }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <p class="apple-section-title">
              {{ t('dashboard.team.currentRole', '角色') }}
            </p>
            <p class="mt-2 text-2xl font-semibold capitalize text-black dark:text-white">
              {{ team.role }}
            </p>
          </div>
          <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
            <p class="apple-section-title">
              {{ t('dashboard.team.memberStatus.active', '已激活') }}
            </p>
            <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
              {{ team.seats.used }}/{{ team.seats.total }}
            </p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <TxButton variant="secondary" size="small" @click="refresh()">
            {{ t('common.refresh', '刷新') }}
          </TxButton>
          <TxButton variant="secondary" size="small" @click="openManagePlan">
            {{ t('dashboard.team.managePlan', '管理套餐') }}
          </TxButton>
        </div>
      </section>

      <section class="apple-card-lg p-6 space-y-4">
        <div>
          <h2 class="apple-heading-sm">
            {{ t('dashboard.team.activationTitle', '激活码兑换') }}
          </h2>
          <p class="mt-1 text-sm text-black/50 dark:text-white/50">
            {{ t('dashboard.team.activationDesc', '输入系统发放的 activation code 进行套餐兑换。') }}
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
          <TuffInput
            v-model="activationCode"
            type="text"
            autocomplete="off"
            placeholder="TUFF-TEAM-XXXX-XXXX"
            @keyup.enter="handleActivateCode"
          />
          <TxButton variant="primary" size="small" :loading="activationLoading" @click="handleActivateCode">
            {{ t('dashboard.team.activateCode', '兑换') }}
          </TxButton>
        </div>
      </section>

      <section class="apple-card-lg p-6">
        <div class="flex flex-wrap items-center gap-2">
          <TxButton v-if="isPersonalTeam" ref="joinTriggerRef" variant="secondary" size="small" @click="joinOverlayVisible = true">
            {{ t('dashboard.team.joinByCode', '通过邀请码加入团队') }}
          </TxButton>
          <TxButton v-if="canCreateTeam" ref="createTriggerRef" variant="secondary" size="small" @click="createOverlayVisible = true">
            {{ t('dashboard.team.modal.createTitle', '创建团队') }}
          </TxButton>
          <TxButton v-if="canInvite" ref="inviteTriggerRef" variant="secondary" size="small" @click="inviteOverlayVisible = true">
            {{ t('dashboard.team.modal.inviteTitle', '邀请成员') }}
          </TxButton>
          <TxButton v-if="canDisband" ref="disbandTriggerRef" variant="danger" size="small" @click="disbandOverlayVisible = true">
            {{ t('dashboard.team.disband', '解散团队') }}
          </TxButton>
        </div>

        <p v-if="team.upgrade.required" class="mt-3 text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.team.notInvitedDesc', '当前套餐仅支持个人团队，升级到 TEAM 后可邀请成员协作。') }}
        </p>
      </section>

      <section v-if="team.type === 'organization'" class="apple-card-lg p-6 space-y-5">
        <div>
          <h2 class="apple-heading-sm">
            {{ t('dashboard.team.teamMembers', '团队成员') }}
          </h2>
          <p class="mt-1 text-sm text-black/50 dark:text-white/50">
            {{ t('dashboard.team.seatUsage', { used: team.seats.used, total: team.seats.total }) }}
          </p>
        </div>

        <div class="space-y-2">
          <div
            v-for="member in team.members"
            :key="member.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]"
          >
            <div>
              <p class="text-sm font-medium text-black dark:text-white">
                {{ member.name }}
              </p>
              <p class="text-xs text-black/55 dark:text-white/55">
                {{ member.email || member.userId }}
              </p>
            </div>
            <span class="rounded-full bg-black/[0.08] px-2 py-0.5 text-xs uppercase text-black/60 dark:bg-white/[0.12] dark:text-white/70">
              {{ member.role }}
            </span>
          </div>
        </div>
      </section>

      <section v-if="showTeamCredits" class="apple-card-lg p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="apple-heading-sm">
              {{ t('dashboard.team.credits.title', 'AI 积分消耗') }}
            </h2>
            <p class="mt-1 text-sm text-black/50 dark:text-white/50">
              {{ t('dashboard.team.credits.subtitle', '团队成员本月积分消耗与额度') }}
            </p>
          </div>
        </div>

        <TxTabs v-model="creditTab" placement="top" :content-scrollable="false">
          <TxTabItem name="usage" icon-class="i-carbon-calculator">
            <template #name>
              {{ t('dashboard.team.credits.tabs.usage', '成员消耗') }}
            </template>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <TxButton variant="secondary" size="small" @click="() => fetchTeamCreditUsage()">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                  <p class="text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.team.credits.totalUsed', '本月总消耗') }}
                  </p>
                  <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                    {{ formatNumber(creditUsageSummary.totalUsed) }}
                  </p>
                </div>
                <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                  <p class="text-xs text-black/40 dark:text-white/40">
                    {{ t('dashboard.team.credits.totalQuota', '本月总额度') }}
                  </p>
                  <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                    {{ formatNumber(creditUsageSummary.totalQuota) }}
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <TuffInput
                  v-model="creditUsageQuery"
                  :placeholder="t('dashboard.team.credits.searchPlaceholder', '搜索用户 ID / 邮箱')"
                  class="w-full max-w-xs"
                />
                <TxButton variant="secondary" size="mini" @click="applyCreditUsageFilter">
                  {{ t('dashboard.team.credits.filter', '筛选') }}
                </TxButton>
              </div>

              <div v-if="creditUsageError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
                {{ creditUsageError }}
              </div>

              <div v-if="creditUsageLoading" class="flex items-center justify-center py-4">
                <TxSpinner :size="16" />
              </div>

              <div v-else-if="creditUsage.length" class="space-y-2">
                <div
                  v-for="item in creditUsage"
                  :key="item.userId"
                  class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
                >
                  <div>
                    <p class="text-sm font-medium text-black dark:text-white">
                      {{ resolveCreditUserLabel({ name: item.name, email: item.email, userId: item.userId }) }}
                    </p>
                    <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                      {{ item.userId }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold text-black dark:text-white">
                      {{ formatNumber(item.used) }} / {{ formatNumber(item.quota) }}
                    </p>
                    <p class="text-[11px] text-black/40 dark:text-white/40">
                      {{ usagePercent(item) }}%
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.team.credits.empty', '暂无记录') }}
              </div>

              <div v-if="creditUsagePagination.total > creditUsagePagination.limit" class="flex justify-end pt-2">
                <TxPagination v-model:current-page="creditUsagePagination.page" :total="creditUsagePagination.total" :page-size="creditUsagePagination.limit" />
              </div>
            </div>
          </TxTabItem>

          <TxTabItem name="trend" icon-class="i-carbon-chart-line-smooth">
            <template #name>
              {{ t('dashboard.team.credits.tabs.trend', '趋势') }}
            </template>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <TxButton variant="secondary" size="small" @click="fetchTeamCreditTrend">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
              </div>

              <div v-if="creditTrendError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
                {{ creditTrendError }}
              </div>

              <div v-if="creditTrendLoading" class="flex items-center justify-center py-4">
                <TxSpinner :size="16" />
              </div>

              <div v-else-if="creditTrend?.values?.length" class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <div class="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
                  <span>{{ t('dashboard.team.credits.trendLabel', '最近趋势') }}</span>
                  <span>{{ creditTrendSparkline.trend }}</span>
                </div>
                <p class="mt-2 text-2xl font-semibold text-black dark:text-white">
                  {{ formatNumber(creditTrend?.totalUsed ?? 0) }}
                </p>
                <svg viewBox="0 0 280 72" preserveAspectRatio="none" class="mt-3 h-24 w-full">
                  <polygon
                    :points="creditTrendSparkline.area"
                    style="fill: color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);"
                  />
                  <polyline
                    :points="creditTrendSparkline.line"
                    style="fill: none; stroke: var(--tx-color-primary, #409eff); stroke-width: 2;"
                  />
                </svg>
              </div>

              <div v-else class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.team.credits.trendEmpty', '暂无趋势数据') }}
              </div>
            </div>
          </TxTabItem>

          <TxTabItem name="ledger" icon-class="i-carbon-list">
            <template #name>
              {{ t('dashboard.team.credits.tabs.ledger', '流水') }}
            </template>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <TxButton variant="secondary" size="small" @click="() => fetchTeamCreditLedger()">
                  {{ t('common.refresh', '刷新') }}
                </TxButton>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <TuffInput
                  v-model="creditLedgerQuery"
                  :placeholder="t('dashboard.team.credits.ledgerSearchPlaceholder', '筛选用户 ID / 邮箱')"
                  class="w-full max-w-xs"
                />
                <TxButton variant="secondary" size="mini" @click="applyCreditLedgerFilter">
                  {{ t('dashboard.team.credits.filter', '筛选') }}
                </TxButton>
              </div>

              <div v-if="creditLedgerError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
                {{ creditLedgerError }}
              </div>

              <div v-if="creditLedgerLoading" class="flex items-center justify-center py-4">
                <TxSpinner :size="16" />
              </div>

              <div v-else-if="creditLedger.length" class="space-y-2">
                <div
                  v-for="entry in creditLedger"
                  :key="entry.id"
                  class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
                >
                  <div>
                    <p class="text-sm font-medium text-black dark:text-white">
                      {{ resolveCreditUserLabel({ name: entry.userName, email: entry.userEmail, userId: entry.userId }) }}
                    </p>
                    <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                      {{ entry.userId || '-' }} · {{ formatDateTime(entry.createdAt) }}
                    </p>
                    <p class="mt-1 text-[11px] text-black/40 dark:text-white/40">
                      {{ entry.reason }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold" :class="entry.delta < 0 ? 'text-red-500' : 'text-green-600'">
                      {{ entry.delta }}
                    </p>
                    <p v-if="entry.metadata?.tokens" class="text-[11px] text-black/40 dark:text-white/40">
                      tokens {{ entry.metadata.tokens }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.team.credits.ledgerEmpty', '暂无流水') }}
              </div>

              <div v-if="creditLedgerPagination.total > creditLedgerPagination.limit" class="flex justify-end pt-2">
                <TxPagination v-model:current-page="creditLedgerPagination.page" :total="creditLedgerPagination.total" :page-size="creditLedgerPagination.limit" />
              </div>
            </div>
          </TxTabItem>
        </TxTabs>
      </section>

      <section v-if="team.type === 'organization' && team.invites.length" class="apple-card-lg p-6 space-y-4">
        <h2 class="apple-heading-sm">
          {{ t('dashboard.team.pendingInvites', '待处理邀请') }}
        </h2>

        <div class="space-y-2">
          <div
            v-for="invite in team.invites"
            :key="invite.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/[0.02] px-4 py-3 dark:bg-white/[0.03]"
          >
            <div>
              <p class="font-mono text-xs text-black/70 dark:text-white/70">
                {{ invite.code }}
              </p>
              <p class="text-xs text-black/55 dark:text-white/55">
                {{ invite.email || '-' }} · {{ invite.role }} · {{ invite.status }} · {{ formatDateTime(invite.expiresAt) }}
              </p>
            </div>
            <TxButton v-if="canInvite" variant="secondary" size="small" :disabled="deleteInviteLoading" @click="handleDeleteInvite(invite.id)">
              {{ t('common.delete', '删除') }}
            </TxButton>
          </div>
        </div>
      </section>

      <p v-if="actionSuccess" class="text-sm text-emerald-600 dark:text-emerald-300">
        {{ actionSuccess }}
      </p>
      <p v-if="actionError" class="text-sm text-red-500">
        {{ actionError }}
      </p>
    </template>

    <FlipDialog
        v-model="createOverlayVisible"
        :reference="createTriggerRef?.$el || null"
        size="md"
      >
        <template #default="{ close }">
          <div class="TeamOverlay-Inner">
            <h2 class="TeamOverlay-Title">
              {{ t('dashboard.team.modal.createTitle', '创建团队') }}
            </h2>
            <p class="TeamOverlay-Desc">
              {{ t('dashboard.team.modal.createDesc', '输入一个团队名称，创建后即可邀请成员。') }}
            </p>

            <TuffInput
              v-model="createTeamName"
              type="text"
              :placeholder="t('dashboard.team.modal.createInput', '例如：Acme Team')"
            />

            <div class="TeamOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                {{ t('common.cancel', '取消') }}
              </TxButton>
              <TxButton variant="primary" size="small" :loading="createLoading" @click="handleCreateTeam(close)">
                {{ t('dashboard.team.modal.create', '创建') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

    <FlipDialog
        v-model="inviteOverlayVisible"
        :reference="inviteTriggerRef?.$el || null"
        size="md"
      >
        <template #default="{ close }">
          <div class="TeamOverlay-Inner">
            <h2 class="TeamOverlay-Title">
              {{ t('dashboard.team.modal.inviteTitle', '邀请成员') }}
            </h2>
            <p class="TeamOverlay-Desc">
              {{ t('dashboard.team.modal.inviteDesc', '输入成员邮箱，系统会生成专属邀请码。') }}
            </p>

            <div class="space-y-3">
              <TuffInput
                v-model="inviteEmail"
                type="email"
                autocomplete="off"
                placeholder="user@example.com"
              />

              <TuffSelect v-model="inviteRole" class="w-full">
                <TuffSelectItem value="member" :label="t('dashboard.team.roles.member', '成员')" />
                <TuffSelectItem value="admin" :label="t('dashboard.team.roles.admin', '管理员')" />
              </TuffSelect>
            </div>

            <div class="TeamOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                {{ t('common.cancel', '取消') }}
              </TxButton>
              <TxButton variant="primary" size="small" :loading="inviteLoading" @click="handleCreateInvite(close)">
                {{ t('dashboard.team.modal.createInvite', '生成邀请') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

    <FlipDialog
        v-model="joinOverlayVisible"
        :reference="joinTriggerRef?.$el || null"
        size="md"
      >
        <template #default="{ close }">
          <div class="TeamOverlay-Inner">
            <h2 class="TeamOverlay-Title">
              {{ t('dashboard.team.joinByCode', '通过邀请码加入团队') }}
            </h2>
            <p class="TeamOverlay-Desc">
              {{ t('team.join.desc', '输入邀请码后可预览并加入团队。') }}
            </p>

            <div class="space-y-3">
              <TuffInput
                v-model="joinCode"
                type="text"
                autocomplete="off"
                placeholder="ABCDEFGH"
                @keyup.enter="previewInvite"
              />

              <TxButton variant="secondary" size="small" :loading="joinPreviewLoading" @click="previewInvite">
                {{ t('team.join.preview', '预览邀请码') }}
              </TxButton>

              <div v-if="invitePreview" class="rounded-xl bg-black/[0.03] px-3 py-2 text-xs text-black/70 dark:bg-white/[0.06] dark:text-white/70">
                <p class="font-medium text-black dark:text-white">
                  {{ invitePreview.invite.teamName }}
                </p>
                <p>
                  {{ invitePreview.invite.seats.used }}/{{ invitePreview.invite.seats.total }} seats · {{ invitePreview.invite.role }}
                </p>
              </div>

              <p v-if="joinPreviewMessage" class="text-xs" :class="invitePreview?.validation.canJoin ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500'">
                {{ joinPreviewMessage }}
              </p>
            </div>

            <div class="TeamOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                {{ t('common.cancel', '取消') }}
              </TxButton>
              <TxButton variant="primary" size="small" :loading="joinLoading" :disabled="!invitePreview?.validation.canJoin" @click="handleJoinTeam(close)">
                {{ t('team.join.join', '加入团队') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

    <FlipDialog
        v-model="disbandOverlayVisible"
        :reference="disbandTriggerRef?.$el || null"
        size="md"
      >
        <template #default="{ close }">
          <div class="TeamOverlay-Inner">
            <h2 class="TeamOverlay-Title">
              {{ t('dashboard.team.modal.disbandTitle', '解散团队') }}
            </h2>
            <p class="TeamOverlay-Desc">
              {{ t('dashboard.team.modal.disbandDesc', '该操作无法撤销，成员和邀请将被清理。') }}
            </p>

            <div class="TeamOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                {{ t('common.cancel', '取消') }}
              </TxButton>
              <TxButton variant="danger" size="small" :loading="disbandLoading" @click="handleDisband(close)">
                {{ t('dashboard.team.modal.disbandConfirm', '确认解散') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>
  </div>
</template>

<style scoped>
.TeamOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 18px;
}

.TeamOverlay-Title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.TeamOverlay-Desc {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.TeamOverlay-Actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
