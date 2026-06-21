<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'
import { requestJson } from '~/utils/request'
import { base64UrlToBuffer, serializeCredential } from '~/utils/webauthn'

definePageMeta({
  requiresAuth: true,
})

defineI18nRoute(false)

interface InvitationPreview {
  invitation: {
    id: string
    teamId: string
    teamName: string
    expiresAt: string | null
    status: string
    role: 'admin' | 'member'
    seats: {
      used: number
      total: number
    }
  }
  validation: {
    canJoin: boolean
    reason: string
  }
}

const { t } = useI18n()
const route = useRoute()

const invitationId = ref('')
const pending = ref(false)
const previewPending = ref(false)
const stepUpPending = ref(false)
const errorMessage = ref('')
const success = ref(false)
const preview = ref<InvitationPreview | null>(null)
const supportsPasskey = ref(false)
const stepUpToken = ref('')

const canSubmit = computed(() => {
  if (pending.value || stepUpPending.value || !invitationId.value)
    return false
  if (!preview.value)
    return false
  return preview.value.validation.canJoin
})

function resolveInviteReason(reason: string) {
  const key = reason || 'unknown'
  const mapping: Record<string, string> = {
    ok: t('team.join.reason.ok', '邀请可用，完成二次验证后即可加入团队。'),
    expired: t('team.join.reason.expired', '邀请已过期。'),
    revoked: t('team.join.reason.revoked', '邀请已撤销。'),
    used_up: t('team.join.reason.usedUp', '邀请已被使用。'),
    email_mismatch: t('team.join.reason.emailMismatch', '当前账号邮箱与邀请接收人不一致。'),
    already_member: t('team.join.reason.alreadyMember', '你已经在团队中。'),
    seat_full: t('team.join.reason.seatFull', '团队席位已满。'),
    plan_locked: t('team.join.reason.planLocked', '团队套餐不支持协作。'),
  }

  return mapping[key] || t('team.join.reason.unknown', '邀请暂不可用。')
}

async function loadInvitation(id: string) {
  if (import.meta.server)
    return

  preview.value = null
  errorMessage.value = ''
  success.value = false

  if (!id)
    return

  previewPending.value = true
  try {
    preview.value = await requestJson<InvitationPreview>(`/api/team/invitations/${encodeURIComponent(id)}`)
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || t('team.join.previewFailed', '加载邀请信息失败')
  }
  finally {
    previewPending.value = false
  }
}

watch(
  () => route.query.invitation,
  (next) => {
    const nextId = typeof next === 'string' ? next : ''
    invitationId.value = nextId
    void loadInvitation(nextId)
  },
  { immediate: true },
)

onMounted(() => {
  supportsPasskey.value = Boolean(window.PublicKeyCredential)
})

async function verifyWithPasskey() {
  if (stepUpPending.value)
    return ''
  if (!supportsPasskey.value) {
    throw new Error(t('team.join.passkeyUnsupported', '当前浏览器不支持 Passkey 二次验证。'))
  }

  stepUpPending.value = true
  try {
    const me = await fetchCurrentUserProfile()
    const email = typeof me?.email === 'string' ? me.email : ''
    const options = await requestJson<any>(
      '/api/passkeys/options',
      email ? { query: { email } } : undefined,
    )

    const allowCredentials = Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: base64UrlToBuffer(cred.id),
        }))
      : undefined

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: base64UrlToBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: 'required',
      ...(allowCredentials ? { allowCredentials } : {}),
    }

    const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null
    if (!credential) {
      throw new Error(t('auth.passkeyCancelled', 'Passkey cancelled.'))
    }

    const payload = serializeCredential(credential)
    const { token } = await requestJson<{ token: string }>('/api/passkeys/verify', {
      method: 'POST',
      body: { credential: payload },
    })

    stepUpToken.value = token
    return token
  }
  finally {
    stepUpPending.value = false
  }
}

async function acceptInvitation(): Promise<void> {
  if (!canSubmit.value)
    return

  pending.value = true
  errorMessage.value = ''
  success.value = false

  try {
    const token = stepUpToken.value || await verifyWithPasskey()
    await requestJson(`/api/team/invitations/${encodeURIComponent(invitationId.value)}/accept`, {
      method: 'POST',
      headers: {
        'X-Login-Token': token,
      },
    })

    success.value = true
    await navigateTo('/dashboard/team')
  }
  catch (error: any) {
    stepUpToken.value = ''
    errorMessage.value = error?.data?.statusMessage || error?.message || t('team.join.failed', '加入团队失败')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-md px-4 py-10">
    <div class="rounded-2xl bg-white/60 p-6 dark:bg-dark/40">
      <h1 class="text-lg font-semibold text-black dark:text-light">
        {{ t('team.join.title', '加入团队') }}
      </h1>
      <p class="mt-1 text-sm text-black/50 dark:text-light/50">
        {{ t('team.join.desc', '确认邀请并完成二次验证后加入团队。') }}
      </p>

      <div class="mt-5 space-y-3">
        <div v-if="previewPending" class="text-xs text-black/50 dark:text-light/50">
          {{ t('dashboard.team.pending', '正在加载团队信息…') }}
        </div>

        <div v-if="preview" class="rounded-xl bg-black/[0.03] p-3 text-xs text-black/70 dark:bg-white/[0.06] dark:text-white/70">
          <p class="font-medium text-black dark:text-white">
            {{ preview.invitation.teamName }}
          </p>
          <p>
            {{ t('team.join.seatUsage', { used: preview.invitation.seats.used, total: preview.invitation.seats.total }) }} · {{ preview.invitation.role }}
          </p>
          <p class="mt-2" :class="preview.validation.canJoin ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500'">
            {{ resolveInviteReason(preview.validation.reason) }}
          </p>
        </div>

        <TxButton block :disabled="!canSubmit" :loading="pending || stepUpPending" @click="acceptInvitation">
          {{ pending || stepUpPending ? t('team.join.verifying', '验证中...') : t('team.join.join', '加入团队') }}
        </TxButton>

        <p v-if="errorMessage" class="text-sm text-red-500">
          {{ errorMessage }}
        </p>

        <p v-else-if="success" class="text-sm text-green-600 dark:text-green-400">
          {{ t('team.join.success', '加入成功') }}
        </p>

        <NuxtLink
          to="/dashboard/team"
          class="block text-center text-xs text-black/50 transition hover:text-black dark:text-light/50 dark:hover:text-light"
        >
          {{ t('team.join.back', '返回团队') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
