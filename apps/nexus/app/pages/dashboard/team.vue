<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDashboardTeamData, useSubscriptionData, useTeamInvitesData } from '~/composables/useDashboardData'

const { t } = useI18n()

const { team, pending: teamPending, refresh: refreshTeam } = useDashboardTeamData()
const { subscription, plan, pending: subPending, refresh: refreshSubscription } = useSubscriptionData()
const { invites, pending: invitesPending, refresh: refreshInvites } = useTeamInvitesData()

defineI18nRoute(false)

// Activation code
const activationCode = ref('')
const activating = ref(false)
const activationError = ref('')
const activationSuccess = ref(false)

async function activateCode() {
  if (!activationCode.value.trim())
    return

  activating.value = true
  activationError.value = ''
  activationSuccess.value = false

  try {
    await $fetch('/api/subscription/activate', {
      method: 'POST',
      body: { code: activationCode.value.trim() },
    })
    activationSuccess.value = true
    activationCode.value = ''
    await refreshSubscription()
  }
  catch (error: any) {
    activationError.value = error.data?.statusMessage || 'Failed to activate code'
  }
  finally {
    activating.value = false
  }
}

// Create team
const showCreateTeamModal = ref(false)
const newTeamName = ref('')
const creatingTeam = ref(false)

async function createTeam() {
  if (!newTeamName.value.trim())
    return
  creatingTeam.value = true
  try {
    await $fetch('/api/dashboard/team/create', {
      method: 'POST',
      body: { name: newTeamName.value.trim() },
    })
    showCreateTeamModal.value = false
    newTeamName.value = ''
    await refreshTeam()
  }
  catch (error) {
    console.error('Failed to create team:', error)
  }
  finally {
    creatingTeam.value = false
  }
}

// Team invites
const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<'member' | 'admin'>('member')
const creating = ref(false)

async function createInvite() {
  creating.value = true
  try {
    await $fetch('/api/dashboard/team/invites', {
      method: 'POST',
      body: {
        email: inviteEmail.value || undefined,
        role: inviteRole.value,
        maxUses: 1,
        expiresInDays: 7,
      },
    })
    showInviteModal.value = false
    inviteEmail.value = ''
    inviteRole.value = 'member'
    await refreshInvites()
    await refreshTeam()
  }
  catch (error) {
    console.error('Failed to create invite:', error)
  }
  finally {
    creating.value = false
  }
}

async function revokeInvite(id: string) {
  try {
    await $fetch(`/api/dashboard/team/invites/${id}`, { method: 'DELETE' })
    await refreshInvites()
    await refreshTeam()
  }
  catch (error) {
    console.error('Failed to revoke invite:', error)
  }
}

function copyInviteLink(code: string) {
  const url = `${window.location.origin}/team/join?code=${code}`
  navigator.clipboard.writeText(url)
}

// Disband team
const showDisbandModal = ref(false)
const disbanding = ref(false)
const disbandConfirm = ref('')

async function disbandTeam() {
  if (disbandConfirm.value !== 'DISBAND')
    return
  disbanding.value = true
  try {
    await $fetch('/api/dashboard/team/disband', { method: 'POST' })
    showDisbandModal.value = false
    disbandConfirm.value = ''
    await refreshTeam()
  }
  catch (error: any) {
    console.error('Failed to disband team:', error)
  }
  finally {
    disbanding.value = false
  }
}

// Team quota
const teamQuota = ref<any>(null)
const quotaLoading = ref(false)

const memberUsageMap = ref<Record<string, { aiRequestsUsed: number, aiTokensUsed: number }>>({})

const hasTeam = computed(() => !!team.value?.organization)
const isTeamAdmin = computed(() => team.value?.organization?.role === 'admin' || team.value?.organization?.role === 'org:admin')

function calcNextResetDate(weekStartDate: string): Date {
  const base = new Date(`${weekStartDate}T00:00:00.000Z`)
  return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000)
}

async function fetchTeamQuota() {
  if (!team.value?.organization)
    return
  quotaLoading.value = true
  try {
    const res = await $fetch('/api/dashboard/team/quota')
    teamQuota.value = res.quota
  }
  catch (error) {
    console.error('Failed to fetch team quota:', error)
  }
  finally {
    quotaLoading.value = false
  }
}

async function fetchMemberUsage() {
  if (!team.value?.organization)
    return
  try {
    const res = await $fetch('/api/dashboard/team/member-usage') as any
    const nextMap: Record<string, { aiRequestsUsed: number, aiTokensUsed: number }> = {}
    for (const m of (res.members ?? [])) {
      nextMap[m.userId] = {
        aiRequestsUsed: m.usage?.aiRequestsUsed ?? 0,
        aiTokensUsed: m.usage?.aiTokensUsed ?? 0,
      }
    }
    memberUsageMap.value = nextMap
  }
  catch (error) {
    console.error('Failed to fetch member usage:', error)
  }
}

watch(hasTeam, (has) => {
  if (has) {
    fetchTeamQuota()
    fetchMemberUsage()
  }
}, { immediate: true })

const teamStatusLabels = computed<Record<string, string>>(() => ({
  active: t('dashboard.sections.team.memberStatus.active'),
  automation: t('dashboard.sections.team.memberStatus.automation'),
  invited: t('dashboard.sections.team.memberStatus.invited'),
}))

function resolveTeamStatus(status: string) {
  return teamStatusLabels.value[status] ?? status
}

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  PRO: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300',
  PLUS: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300',
  TEAM: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300',
  ENTERPRISE: 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300',
}

const planIcons: Record<string, string> = {
  FREE: 'i-carbon-user',
  PRO: 'i-carbon-star',
  PLUS: 'i-carbon-star-filled',
  TEAM: 'i-carbon-group',
  ENTERPRISE: 'i-carbon-enterprise',
}
</script>

<template>
  <div class="space-y-6">
    <!-- Subscription Card - Compact -->
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/60 p-4 dark:bg-dark/40">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl" :class="[planColors[plan] || planColors.FREE]">
          <span class="text-xl" :class="[planIcons[plan] || planIcons.FREE]" />
        </div>
        <div>
          <span class="text-xs text-black/50 dark:text-light/50">{{ t('dashboard.sections.team.currentPlan', 'Current Plan') }}</span>
          <div class="flex items-center gap-2">
            <span class="font-semibold text-black dark:text-light">{{ plan }}</span>
            <span v-if="subscription?.expiresAt" class="text-xs text-black/50 dark:text-light/50">
              expires {{ new Date(subscription.expiresAt).toLocaleDateString() }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="activationCode"
          type="text"
          placeholder="TUFF-PRO-XXXX-XXXX"
          class="w-48 rounded-lg border-0 bg-black/5 px-3 py-2 text-sm text-black placeholder-black/30 outline-none dark:bg-light/5 dark:text-light dark:placeholder-light/30"
          :disabled="activating"
          @keyup.enter="activateCode"
        >
        <button
          class="rounded-lg bg-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/20 disabled:opacity-50 dark:bg-light/10 dark:text-light dark:hover:bg-light/20"
          :disabled="activating || !activationCode.trim()"
          @click="activateCode"
        >
          {{ activating ? '...' : t('dashboard.sections.team.activate', 'Activate') }}
        </button>
      </div>
    </div>

    <!-- Team Section -->
    <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.team.title', 'Team') }}
        </h2>
        <div class="flex gap-2">
          <button
            v-if="!hasTeam"
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            @click="showCreateTeamModal = true"
          >
            {{ t('dashboard.sections.team.createTeam', 'Create Team') }}
          </button>
          <button
            v-if="hasTeam"
            class="rounded-lg bg-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/20 dark:bg-light/10 dark:text-light dark:hover:bg-light/20"
            @click="showInviteModal = true"
          >
            {{ t('dashboard.sections.team.invite', 'Invite') }}
          </button>
        </div>
      </div>

      <div v-if="teamPending" class="flex items-center justify-center py-8">
        <span class="i-carbon-circle-dash animate-spin text-xl text-black/30 dark:text-light/30" />
      </div>

      <div v-else-if="!hasTeam" class="py-8 text-center">
        <span class="i-carbon-group mb-3 text-4xl text-black/20 dark:text-light/20" />
        <p class="text-sm text-black/50 dark:text-light/50">
          {{ t('dashboard.sections.team.emptyState', 'Create a team to collaborate with others') }}
        </p>
      </div>

      <div v-else>
        <!-- Organization Info -->
        <div class="mb-4 flex items-center gap-3 rounded-xl bg-black/5 p-3 dark:bg-light/5">
          <span class="i-carbon-enterprise text-xl text-black/60 dark:text-light/60" />
          <div class="flex-1">
            <p class="font-medium text-black dark:text-light">
              {{ team?.organization?.name }}
            </p>
            <p class="text-xs text-black/50 dark:text-light/50">
              {{ team?.organization?.role }} · {{ team?.slots?.used ?? 0 }}/{{ team?.slots?.total ?? 0 }} seats
            </p>
          </div>
          <button
            v-if="isTeamAdmin"
            class="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/20"
            @click="showDisbandModal = true"
          >
            {{ t('dashboard.sections.team.disband', 'Disband') }}
          </button>
        </div>

        <!-- Team Quota (Weekly Reset) -->
        <div v-if="teamQuota" class="mb-4 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 p-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-medium text-black/60 dark:text-light/60">{{ t('dashboard.sections.team.weeklyUsage', 'Team Usage (Weekly)') }}</span>
            <div class="flex items-center gap-2">
              <span class="text-xs text-black/40 dark:text-light/40">
                Resets {{ calcNextResetDate(teamQuota.weekStartDate).toLocaleDateString() }}
              </span>
              <button
                v-if="isTeamAdmin"
                class="rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-3 py-1 text-xs font-medium text-white transition hover:opacity-90"
                @click="() => {}"
              >
                {{ t('dashboard.sections.team.buyMore', 'Buy more') }}
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="text-black/50 dark:text-light/50">{{ t('dashboard.sections.team.aiRequests', 'AI Requests') }}</span>
                <span class="font-medium text-black dark:text-light">
                  {{ teamQuota.aiRequestsUsed }}/{{ teamQuota.aiRequestsLimit }}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
                <div
                  class="h-full rounded-full bg-blue-500 transition-all"
                  :style="{ width: `${Math.min(100, (teamQuota.aiRequestsUsed / teamQuota.aiRequestsLimit) * 100)}%` }"
                />
              </div>
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="text-black/50 dark:text-light/50">{{ t('dashboard.sections.team.aiTokens', 'AI Tokens') }}</span>
                <span class="font-medium text-black dark:text-light">
                  {{ (teamQuota.aiTokensUsed / 1000).toFixed(1) }}k/{{ (teamQuota.aiTokensLimit / 1000).toFixed(0) }}k
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
                <div
                  class="h-full rounded-full bg-purple-500 transition-all"
                  :style="{ width: `${Math.min(100, (teamQuota.aiTokensUsed / teamQuota.aiTokensLimit) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Members -->
        <div class="space-y-2">
          <div
            v-for="member in team?.members || []"
            :key="member.id"
            class="flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-black/5 dark:hover:bg-light/5"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-sm font-medium text-black dark:bg-light/10 dark:text-light">
                {{ member.name?.charAt(0)?.toUpperCase() || '?' }}
              </div>
              <div>
                <p class="text-sm font-medium text-black dark:text-light">
                  {{ member.name }}
                </p>
                <p class="text-xs text-black/50 dark:text-light/50">
                  {{ member.email || member.role }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[11px] text-black/40 dark:text-light/40">
                {{ (memberUsageMap[member.id]?.aiRequestsUsed ?? 0) }} req · {{ ((memberUsageMap[member.id]?.aiTokensUsed ?? 0) / 1000).toFixed(1) }}k tok
              </div>
              <div class="text-[11px] text-black/30 dark:text-light/30">
                {{ resolveTeamStatus(member.status) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Pending Invites -->
        <div v-if="invites.length > 0" class="mt-4 border-t border-black/10 pt-4 dark:border-light/10">
          <p class="mb-2 text-xs text-black/50 dark:text-light/50">
            {{ t('dashboard.sections.team.pendingInvites', 'Pending Invites') }}
          </p>
          <div class="space-y-2">
            <div
              v-for="invite in invites"
              :key="invite.id"
              class="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2"
            >
              <div>
                <p class="font-mono text-xs text-amber-700 dark:text-amber-300">
                  {{ invite.code }}
                </p>
                <p class="text-xs text-black/50 dark:text-light/50">
                  {{ invite.email || 'Anyone' }} · {{ invite.role }}
                </p>
              </div>
              <div class="flex gap-1">
                <button
                  class="rounded p-1.5 text-black/40 transition hover:bg-black/10 hover:text-black dark:text-light/40 dark:hover:bg-light/10 dark:hover:text-light"
                  @click="copyInviteLink(invite.code)"
                >
                  <span class="i-carbon-copy text-sm" />
                </button>
                <button
                  class="rounded p-1.5 text-red-400 transition hover:bg-red-500/10 hover:text-red-500"
                  @click="revokeInvite(invite.id)"
                >
                  <span class="i-carbon-trash-can text-sm" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Team Modal -->
  <Teleport to="body">
    <div
      v-if="showCreateTeamModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="showCreateTeamModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-dark">
        <h3 class="font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.team.modal.createTitle', 'Create Team') }}
        </h3>
        <p class="mt-1 text-sm text-black/50 dark:text-light/50">
          {{ t('dashboard.sections.team.modal.createDesc', 'Start collaborating with your team members') }}
        </p>
        <div class="mt-4">
          <input
            v-model="newTeamName"
            type="text"
            placeholder="Team name"
            class="w-full rounded-lg border-0 bg-black/5 px-4 py-3 text-sm text-black placeholder-black/30 outline-none dark:bg-light/5 dark:text-light dark:placeholder-light/30"
            @keyup.enter="createTeam"
          >
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg px-4 py-2 text-sm text-black/60 transition hover:text-black dark:text-light/60 dark:hover:text-light"
            @click="showCreateTeamModal = false"
          >
            {{ t('dashboard.sections.team.modal.cancel', 'Cancel') }}
          </button>
          <button
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            :disabled="creatingTeam || !newTeamName.trim()"
            @click="createTeam"
          >
            {{ creatingTeam ? t('dashboard.sections.team.modal.creating', 'Creating...') : t('dashboard.sections.team.modal.create', 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Invite Modal -->
  <Teleport to="body">
    <div
      v-if="showInviteModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="showInviteModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-dark">
        <h3 class="font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.team.modal.inviteTitle', 'Invite Member') }}
        </h3>
        <p class="mt-1 text-sm text-black/50 dark:text-light/50">
          {{ t('dashboard.sections.team.modal.inviteDesc', 'Add someone to your team') }}
        </p>
        <div class="mt-4 space-y-3">
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="Email (optional)"
            class="w-full rounded-lg border-0 bg-black/5 px-4 py-3 text-sm text-black placeholder-black/30 outline-none dark:bg-light/5 dark:text-light dark:placeholder-light/30"
          >
          <select
            v-model="inviteRole"
            class="w-full rounded-lg border-0 bg-black/5 px-4 py-3 text-sm text-black outline-none dark:bg-light/5 dark:text-light"
          >
            <option value="member">
              Member
            </option>
            <option value="admin">
              Admin
            </option>
          </select>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg px-4 py-2 text-sm text-black/60 transition hover:text-black dark:text-light/60 dark:hover:text-light"
            @click="showInviteModal = false"
          >
            {{ t('dashboard.sections.team.modal.cancel', 'Cancel') }}
          </button>
          <button
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            :disabled="creating"
            @click="createInvite"
          >
            {{ creating ? t('dashboard.sections.team.modal.creating', 'Creating...') : t('dashboard.sections.team.modal.createInvite', 'Create Invite') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Disband Team Modal -->
  <Teleport to="body">
    <div
      v-if="showDisbandModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="showDisbandModal = false"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-dark">
        <h3 class="font-semibold text-red-500">
          {{ t('dashboard.sections.team.modal.disbandTitle', 'Disband Team') }}
        </h3>
        <p class="mt-1 text-sm text-black/50 dark:text-light/50">
          {{ t('dashboard.sections.team.modal.disbandDesc', 'This action cannot be undone. All members will be removed and team data will be deleted.') }}
        </p>
        <div class="mt-4">
          <p class="mb-2 text-xs text-black/60 dark:text-light/60">
            Type <code class="rounded bg-red-500/10 px-1 py-0.5 text-red-500">DISBAND</code> to confirm
          </p>
          <input
            v-model="disbandConfirm"
            type="text"
            placeholder="DISBAND"
            class="w-full rounded-lg border-0 bg-red-500/5 px-4 py-3 text-sm text-red-600 placeholder-red-300 outline-none dark:text-red-400 dark:placeholder-red-800"
            @keyup.enter="disbandTeam"
          >
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg px-4 py-2 text-sm text-black/60 transition hover:text-black dark:text-light/60 dark:hover:text-light"
            @click="showDisbandModal = false; disbandConfirm = ''"
          >
            {{ t('dashboard.sections.team.modal.cancel', 'Cancel') }}
          </button>
          <button
            class="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
            :disabled="disbanding || disbandConfirm !== 'DISBAND'"
            @click="disbandTeam"
          >
            {{ disbanding ? t('dashboard.sections.team.modal.disbanding', 'Disbanding...') : t('dashboard.sections.team.modal.disbandConfirm', 'Disband Team') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
