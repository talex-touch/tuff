<script setup lang="ts">
import { computed, ref } from 'vue'
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
  if (!activationCode.value.trim()) return
  
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
  } catch (error: any) {
    activationError.value = error.data?.statusMessage || 'Failed to activate code'
  } finally {
    activating.value = false
  }
}

// Create team
const showCreateTeamModal = ref(false)
const newTeamName = ref('')
const creatingTeam = ref(false)

async function createTeam() {
  if (!newTeamName.value.trim()) return
  creatingTeam.value = true
  try {
    await $fetch('/api/dashboard/team/create', {
      method: 'POST',
      body: { name: newTeamName.value.trim() },
    })
    showCreateTeamModal.value = false
    newTeamName.value = ''
    await refreshTeam()
  } catch (error) {
    console.error('Failed to create team:', error)
  } finally {
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
  } catch (error) {
    console.error('Failed to create invite:', error)
  } finally {
    creating.value = false
  }
}

async function revokeInvite(id: string) {
  try {
    await $fetch(`/api/dashboard/team/invites/${id}`, { method: 'DELETE' })
    await refreshInvites()
    await refreshTeam()
  } catch (error) {
    console.error('Failed to revoke invite:', error)
  }
}

function copyInviteLink(code: string) {
  const url = `${window.location.origin}/team/join?code=${code}`
  navigator.clipboard.writeText(url)
}

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

const hasTeam = computed(() => !!team.value?.organization)
</script>

<template>
  <div class="space-y-6">
    <!-- Subscription Card - Compact -->
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/60 p-4 dark:bg-dark/40">
      <div class="flex items-center gap-3">
        <div :class="[planColors[plan] || planColors.FREE, 'flex h-10 w-10 items-center justify-center rounded-xl']">
          <span :class="[planIcons[plan] || planIcons.FREE, 'text-xl']" />
        </div>
        <div>
          <span class="text-xs text-black/50 dark:text-light/50">Current Plan</span>
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
          {{ activating ? '...' : 'Activate' }}
        </button>
      </div>
    </div>

    <!-- Quota Bars - Inline -->
    <div v-if="subscription?.features" class="flex gap-6">
      <div class="flex-1">
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="text-black/50 dark:text-light/50">AI Requests</span>
          <span class="font-medium text-black dark:text-light">
            {{ subscription.features.aiRequests.used }}/{{ subscription.features.aiRequests.limit === -1 ? '∞' : subscription.features.aiRequests.limit }}
          </span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
          <div
            class="h-full rounded-full bg-blue-500 transition-all"
            :style="{ width: subscription.features.aiRequests.limit === -1 ? '0%' : `${Math.min(100, (subscription.features.aiRequests.used / subscription.features.aiRequests.limit) * 100)}%` }"
          />
        </div>
      </div>
      <div class="flex-1">
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="text-black/50 dark:text-light/50">AI Tokens</span>
          <span class="font-medium text-black dark:text-light">
            {{ (subscription.features.aiTokens.used / 1000).toFixed(1) }}k/{{ subscription.features.aiTokens.limit === -1 ? '∞' : `${(subscription.features.aiTokens.limit / 1000).toFixed(0)}k` }}
          </span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-light/10">
          <div
            class="h-full rounded-full bg-purple-500 transition-all"
            :style="{ width: subscription.features.aiTokens.limit === -1 ? '0%' : `${Math.min(100, (subscription.features.aiTokens.used / subscription.features.aiTokens.limit) * 100)}%` }"
          />
        </div>
      </div>
    </div>

    <!-- Team Section -->
    <div class="rounded-2xl bg-white/60 p-5 dark:bg-dark/40">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="font-semibold text-black dark:text-light">Team</h2>
        <div class="flex gap-2">
          <button
            v-if="!hasTeam"
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            @click="showCreateTeamModal = true"
          >
            Create Team
          </button>
          <button
            v-if="hasTeam"
            class="rounded-lg bg-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-black/20 dark:bg-light/10 dark:text-light dark:hover:bg-light/20"
            @click="showInviteModal = true"
          >
            Invite
          </button>
        </div>
      </div>

      <div v-if="teamPending" class="flex items-center justify-center py-8">
        <span class="i-carbon-circle-dash animate-spin text-xl text-black/30 dark:text-light/30" />
      </div>

      <div v-else-if="!hasTeam" class="py-8 text-center">
        <span class="i-carbon-group mb-3 text-4xl text-black/20 dark:text-light/20" />
        <p class="text-sm text-black/50 dark:text-light/50">
          Create a team to collaborate with others
        </p>
      </div>

      <div v-else>
        <!-- Organization Info -->
        <div class="mb-4 flex items-center gap-3 rounded-xl bg-black/5 p-3 dark:bg-light/5">
          <span class="i-carbon-enterprise text-xl text-black/60 dark:text-light/60" />
          <div class="flex-1">
            <p class="font-medium text-black dark:text-light">{{ team?.organization?.name }}</p>
            <p class="text-xs text-black/50 dark:text-light/50">
              {{ team?.organization?.role }} · {{ team?.slots?.used ?? 0 }}/{{ team?.slots?.total ?? 0 }} seats
            </p>
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
                <p class="text-sm font-medium text-black dark:text-light">{{ member.name }}</p>
                <p class="text-xs text-black/50 dark:text-light/50">{{ member.email || member.role }}</p>
              </div>
            </div>
            <span class="text-xs text-black/40 dark:text-light/40">{{ resolveTeamStatus(member.status) }}</span>
          </div>
        </div>

        <!-- Pending Invites -->
        <div v-if="invites.length > 0" class="mt-4 border-t border-black/10 pt-4 dark:border-light/10">
          <p class="mb-2 text-xs text-black/50 dark:text-light/50">Pending Invites</p>
          <div class="space-y-2">
            <div
              v-for="invite in invites"
              :key="invite.id"
              class="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2"
            >
              <div>
                <p class="font-mono text-xs text-amber-700 dark:text-amber-300">{{ invite.code }}</p>
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
        <h3 class="font-semibold text-black dark:text-light">Create Team</h3>
        <p class="mt-1 text-sm text-black/50 dark:text-light/50">
          Start collaborating with your team members
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
            Cancel
          </button>
          <button
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            :disabled="creatingTeam || !newTeamName.trim()"
            @click="createTeam"
          >
            {{ creatingTeam ? 'Creating...' : 'Create' }}
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
        <h3 class="font-semibold text-black dark:text-light">Invite Member</h3>
        <p class="mt-1 text-sm text-black/50 dark:text-light/50">
          Add someone to your team
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
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg px-4 py-2 text-sm text-black/60 transition hover:text-black dark:text-light/60 dark:hover:text-light"
            @click="showInviteModal = false"
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-dark dark:hover:bg-light/80"
            :disabled="creating"
            @click="createInvite"
          >
            {{ creating ? 'Creating...' : 'Create Invite' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
