<script setup lang="ts">
import type { FormRules, FormValues } from '@talex-touch/tuffex/form'
import { computed, reactive, ref, watch } from 'vue'

const { locale } = useI18n()
const mode = ref<'signin' | 'signup'>('signin')
const sent = ref(false)
const status = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      mode: '登录或注册',
      signin: '登录',
      signup: '注册',
      email: '邮箱',
      secret: '密码',
      secretHelp: '至少 8 位',
      capsLock: '大写锁定已开启',
      code: '验证码',
      send: '发送验证码',
      resend: '重新发送',
      sent: '已发送。演示中填任意 6 位数字',
      emailRequired: '请输入邮箱',
      emailInvalid: '邮箱格式不正确',
      secretRequired: '请输入密码',
      secretShort: '密码至少 8 位',
      codeRequired: '请输入验证码',
      codeInvalid: '验证码是 6 位数字',
      signedIn: (email: string) => `已登录：${email}`,
      signedUp: (email: string) => `已注册：${email}`,
    }
  }

  return {
    mode: 'Sign in or sign up',
    signin: 'Sign in',
    signup: 'Sign up',
    email: 'Email',
    secret: 'Password',
    secretHelp: 'At least 8 characters',
    capsLock: 'Caps Lock is on',
    code: 'Verification code',
    send: 'Send code',
    resend: 'Send again',
    sent: 'Sent. In this demo, any 6 digits will do',
    emailRequired: 'Enter your email',
    emailInvalid: 'Enter a valid email address',
    secretRequired: 'Enter your password',
    secretShort: 'Use at least 8 characters',
    codeRequired: 'Enter the code',
    codeInvalid: 'The code is 6 digits',
    signedIn: (email: string) => `Signed in as ${email}`,
    signedUp: (email: string) => `Signed up as ${email}`,
  }
})

// No `persist`: none of this belongs in a draft.
const form = ref(reactive({ email: '', password: '', code: '' }))

// A field the other mode does not show is not checked: only mounted items are.
const rules = computed<FormRules>(() => ({
  email: [
    { required: true, message: labels.value.emailRequired },
    { type: 'email', message: labels.value.emailInvalid },
  ],
  password: mode.value === 'signup'
    ? [{ required: true, message: labels.value.secretRequired }, { minLength: 8, message: labels.value.secretShort }]
    : { required: true, message: labels.value.secretRequired },
  code: [
    { required: true, message: labels.value.codeRequired },
    { pattern: /^\d{6}$/, message: labels.value.codeInvalid },
  ],
}))

// Another form: the email carries over, the rest starts again.
watch(mode, () => {
  form.value = reactive({ email: form.value.email, password: '', code: '' })
  sent.value = false
  status.value = ''
})

// Stands in for the request.
async function submit(values: FormValues) {
  await new Promise(resolve => setTimeout(resolve, 800))
  status.value = mode.value === 'signin' ? labels.value.signedIn(values.email) : labels.value.signedUp(values.email)
}
</script>

<template>
  <div class="form-login-demo not-prose">
    <TxFlatRadio v-model="mode" size="sm" :aria-label="labels.mode">
      <TxFlatRadioItem value="signin" :label="labels.signin" />
      <TxFlatRadioItem value="signup" :label="labels.signup" />
    </TxFlatRadio>
    <TxForm v-slot="{ submitting }" :model="form" :rules="rules" layout="stacked" :leave-confirm="false" @submit="submit">
      <TxFormItem :label="labels.email" prop="email">
        <TuffInput v-model="form.email" type="email" autocomplete="username" />
      </TxFormItem>
      <TxFormItem v-if="mode === 'signup'" :label="labels.code" prop="code" :help="sent ? labels.sent : undefined">
        <div class="form-login-demo__code">
          <TuffInput v-model="form.code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
          <TxButton :disabled="!form.email" @click="sent = true">
            {{ sent ? labels.resend : labels.send }}
          </TxButton>
        </div>
      </TxFormItem>
      <TxFormItem :label="labels.secret" prop="password" :help="mode === 'signup' ? labels.secretHelp : undefined">
        <TuffInput
          v-model="form.password"
          type="password"
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          :caps-lock-text="labels.capsLock"
        />
      </TxFormItem>
      <TxFormItem>
        <div class="form-login-demo__actions">
          <TxButton variant="primary" native-type="submit" :loading="submitting">
            {{ mode === 'signin' ? labels.signin : labels.signup }}
          </TxButton>
          <span class="form-login-demo__status" role="status">{{ status }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-login-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  width: min(100%, 360px);
}

.form-login-demo > :last-child {
  align-self: stretch;
}

.form-login-demo__code {
  display: flex;
  gap: 8px;
}

.form-login-demo__code > :first-child {
  flex: 1;
  min-width: 0;
}

.form-login-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.form-login-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
