<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { TxButton, TxSpinner } from '@talex-touch/tuffex'
import { toast } from 'vue-sonner'
import Input from '~/components/ui/Input.vue'
import { sanitizeRedirect } from '~/composables/useOauthContext'

interface AdminBootstrapStatus {
  enabled: boolean
  required: boolean
  adminExists: boolean
  isFirstUser: boolean
  canPromote: boolean
}

definePageMeta({
  layout: false,
  requiresAuth: true,
})

defineI18nRoute(false)

const { t } = useI18n()
const route = useRoute()
const { refresh } = useAuthUser()
const { signOut } = useAuth()

const secret = ref('')
const submitting = ref(false)
const reauthing = ref(false)

const {
  data: statusData,
  pending: statusPending,
  error: statusError,
  refresh: refreshStatus,
} = await useFetch<AdminBootstrapStatus>('/api/admin-bootstrap/status', {
  cache: 'no-store',
})

const redirectTarget = computed(() => {
  const value = route.query.redirect_url
  const target = Array.isArray(value) ? value[0] : value
  return sanitizeRedirect(typeof target === 'string' ? target : '/dashboard', '/dashboard')
})

const canSubmit = computed(() => {
  if (!statusData.value)
    return false
  return statusData.value.canPromote && secret.value.length > 0 && !submitting.value
})

const statusMessage = computed(() => {
  const status = statusData.value
  if (!status)
    return ''
  if (!status.required)
    return t('auth.adminBootstrapDone', '管理员已就绪，正在跳转...')
  if (!status.enabled)
    return t('auth.adminBootstrapSecretMissing', '服务器未配置 ADMINSECRET，请联系系统维护者。')
  if (!status.isFirstUser)
    return t('auth.adminBootstrapOnlyFirstUser', '仅首个活跃用户可完成管理员初始化，请使用首个账号登录。')
  return t('auth.adminBootstrapHint', '检测到系统尚无管理员，请输入 ADMINSECRET 完成首次提权。')
})

watchEffect(() => {
  if (!statusData.value || statusData.value.required)
    return
  void navigateTo(redirectTarget.value, { replace: true })
})

watchEffect(() => {
  if (reauthing.value)
    return
  const code = statusError.value?.statusCode ?? statusError.value?.data?.statusCode
  if (code !== 401)
    return
  reauthing.value = true
  void (async () => {
    await signOut({ redirect: false })
    await navigateTo({
      path: '/sign-in',
      query: {
        reason: 'reauth',
        redirect_url: redirectTarget.value,
      },
    }, { replace: true })
  })()
})

async function handleSubmit() {
  if (!statusData.value?.canPromote) {
    toast.error(t('auth.adminBootstrapBlocked', '当前账号无法执行管理员初始化。'))
    return
  }
  if (!secret.value) {
    toast.error(t('auth.adminBootstrapSecretRequired', '请输入 ADMINSECRET。'))
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/admin-bootstrap/promote', {
      method: 'POST',
      body: {
        secret: secret.value,
      },
    })
    secret.value = ''
    await Promise.all([refresh(), refreshStatus()])
    toast.success(t('auth.adminBootstrapSuccess', '提权成功，已成为管理员。'))
    await navigateTo(redirectTarget.value, { replace: true })
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || t('auth.adminBootstrapFailed', '管理员提权失败。'))
    await refreshStatus()
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthVisualShell :loading="statusPending">
    <div class="bootstrap-shell">
      <div class="bootstrap-header">
        <h1 class="bootstrap-title">
          {{ t('auth.adminBootstrapTitle', '管理员初始化认证') }}
        </h1>
        <p class="bootstrap-subtitle">
          {{ statusMessage }}
        </p>
      </div>

      <div v-if="statusError" class="bootstrap-error">
        {{ statusError.data?.statusMessage || statusError.message || t('auth.adminBootstrapStatusFailed', '初始化状态获取失败。') }}
      </div>

      <div class="bootstrap-form">
        <Input
          v-model="secret"
          type="password"
          class="bootstrap-input"
          :disabled="!statusData?.canPromote || submitting"
          :placeholder="t('auth.adminBootstrapSecretPlaceholder', '请输入 ADMINSECRET')"
          @keyup.enter="handleSubmit"
        />

        <TxButton
          class="bootstrap-submit"
          size="lg"
          block
          :disabled="!canSubmit"
          :loading="submitting"
          @click="handleSubmit"
        >
          <span>{{ t('auth.adminBootstrapSubmit', '验证并提权') }}</span>
        </TxButton>
      </div>

      <div v-if="statusPending" class="bootstrap-pending">
        <TxSpinner :size="16" />
        <span>{{ t('auth.adminBootstrapChecking', '正在检查管理员状态...') }}</span>
      </div>
    </div>
  </AuthVisualShell>
</template>

<style scoped>
.bootstrap-shell {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-bottom: 4rem;
}

.bootstrap-header {
  text-align: center;
}

.bootstrap-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.bootstrap-subtitle {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.7);
}

.bootstrap-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bootstrap-submit {
  margin-top: 4px;
}

.bootstrap-error {
  border-radius: 10px;
  border: 1px solid rgba(255, 107, 107, 0.5);
  background: rgba(255, 107, 107, 0.12);
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(255, 208, 208, 0.95);
}

.bootstrap-pending {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}
</style>
