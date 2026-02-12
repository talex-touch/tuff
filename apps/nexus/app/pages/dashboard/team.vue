<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

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

const actionError = ref('')
const actionSuccess = ref('')
const createLoading = ref(false)
const inviteLoading = ref(false)
const deleteInviteLoading = ref(false)
const disbandLoading = ref(false)
const joinLoading = ref(false)
const joinPreviewLoading = ref(false)
const activationLoading = ref(false)

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

function openManagePlan() {
  return navigateTo('/pricing')
}
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

    <Teleport to="body">
      <TxFlipOverlay
        v-model="createOverlayVisible"
        :source="createTriggerRef?.$el || null"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="TeamOverlay-Mask"
        mask-class="TeamOverlay-Mask"
        card-class="TeamOverlay-Card"
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
      </TxFlipOverlay>
    </Teleport>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="inviteOverlayVisible"
        :source="inviteTriggerRef?.$el || null"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="TeamOverlay-Mask"
        mask-class="TeamOverlay-Mask"
        card-class="TeamOverlay-Card"
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
      </TxFlipOverlay>
    </Teleport>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="joinOverlayVisible"
        :source="joinTriggerRef?.$el || null"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="TeamOverlay-Mask"
        mask-class="TeamOverlay-Mask"
        card-class="TeamOverlay-Card"
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
      </TxFlipOverlay>
    </Teleport>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="disbandOverlayVisible"
        :source="disbandTriggerRef?.$el || null"
        :duration="420"
        :rotate-x="6"
        :rotate-y="8"
        transition-name="TeamOverlay-Mask"
        mask-class="TeamOverlay-Mask"
        card-class="TeamOverlay-Card"
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
      </TxFlipOverlay>
    </Teleport>
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

<style>
.TeamOverlay-Mask {
  position: fixed;
  inset: 0;
  z-index: 1900;
  background: rgba(12, 12, 16, 0.4);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.TeamOverlay-Mask-enter-active,
.TeamOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.TeamOverlay-Mask-enter-from,
.TeamOverlay-Mask-leave-to {
  opacity: 0;
}

.TeamOverlay-Card {
  width: min(520px, 92vw);
  min-height: 260px;
  max-height: 82vh;
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: auto;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>
