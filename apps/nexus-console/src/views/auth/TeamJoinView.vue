<script setup lang="ts">
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxTag } from '@talex-touch/tuffex/tag'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { ReceivedTeamInvitation } from '@/api/types'
import { formatDateTime } from '@/utils/format'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const acceptingId = ref<string | null>(null)
const invitations = ref<ReceivedTeamInvitation[]>([])
const errorMessage = ref<string | null>(null)
const acceptedTeam = ref<string | null>(null)

async function loadInvitations() {
  loading.value = true
  errorMessage.value = null
  try {
    const idParam = typeof route.query.id === 'string' ? route.query.id.trim() : ''
    if (idParam) {
      const detail = await consoleApi.getInvitationDetail(idParam)
      const invite = detail.invitation ?? detail.invite
      invitations.value = invite ? [invite] : []
    }
    else {
      const list = await consoleApi.listMyInvitations()
      invitations.value = list.invitations ?? list.invites ?? []
    }
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    loading.value = false
  }
}

async function accept(invite: ReceivedTeamInvitation) {
  acceptingId.value = invite.id
  errorMessage.value = null
  try {
    const res = await consoleApi.acceptInvitation(invite.id)
    acceptedTeam.value = res.team?.name || invite.teamName || invite.organizationName || invite.id
    invitations.value = invitations.value.filter(item => item.id !== invite.id)
  }
  catch (cause) {
    errorMessage.value = resolveErrorMessage(cause, t('common.unknownError'))
  }
  finally {
    acceptingId.value = null
  }
}

onMounted(() => void loadInvitations())
</script>

<template>
  <div class="TeamJoin">
    <div class="TeamJoin-Header">
      <h1 class="TeamJoin-Title">
{{ t('auth.teamJoinTitle') }}
</h1>
      <p class="TeamJoin-Subtitle">
{{ t('auth.teamJoinSubtitle') }}
</p>
    </div>

    <TxAlert
      v-if="acceptedTeam"
      type="success"
      :message="t('auth.inviteAccepted', { team: acceptedTeam })"
    />
    <TxAlert v-if="errorMessage" type="error" :message="errorMessage" />

    <div v-if="loading" class="console-form-stack" aria-busy="true">
      <TxSkeleton width="100%" :height="72" :radius="12" />
      <TxSkeleton width="100%" :height="72" :radius="12" />
    </div>

    <div v-else-if="invitations.length" class="TeamJoin-List">
      <div v-for="invite in invitations" :key="invite.id" class="TeamJoin-Item">
        <div class="TeamJoin-Meta">
          <div class="TeamJoin-NameRow">
            <strong>{{ invite.teamName || invite.organizationName || invite.teamId }}</strong>
            <TxTag :label="invite.role" size="sm" variant="soft" />
          </div>
          <span class="console-muted">
            {{ formatDateTime(invite.expiresAt, locale) }}
          </span>
        </div>
        <TxButton
          variant="primary"
          size="sm"
          :loading="acceptingId === invite.id"
          @click="accept(invite)"
        >
          {{ t('auth.acceptInvite') }}
        </TxButton>
      </div>
    </div>

    <TxEmptyState
      v-else
      variant="no-data"
      size="small"
      :title="t('auth.noInvitations')"
      description=""
    />

    <TxButton variant="secondary" block @click="router.push('/dashboard/team')">
      {{ t('app.backToDashboard') }}
    </TxButton>
  </div>
</template>

<style scoped>
.TeamJoin {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.TeamJoin-Header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.TeamJoin-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.TeamJoin-Subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-regular);
}

.TeamJoin-List {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.TeamJoin-Item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
}

.TeamJoin-Meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.TeamJoin-NameRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--tx-text-color-primary);
}
</style>
