<script setup lang="ts">
import type { FormRules, FormValues, TxFormInstance } from '@talex-touch/tuffex/form'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'

const { locale } = useI18n()
const formRef = ref<TxFormInstance | null>(null)
const offline = ref(false)
const status = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      offline: '模拟断网',
      summary: '提交前请修正以下问题',
      name: '昵称',
      email: '邮箱',
      emailHelp: '试试 taken@example.com',
      submit: '创建账号',
      nameRequired: '请输入昵称',
      emailRequired: '请输入邮箱',
      emailInvalid: '邮箱格式不正确',
      taken: '该邮箱已注册',
      network: '网络连接失败，请稍后重试',
      created: (name: string) => `已为 ${name} 创建账号`,
    }
  }

  return {
    offline: 'Simulate offline',
    summary: 'Fix these before you continue',
    name: 'Nickname',
    email: 'Email',
    emailHelp: 'Try taken@example.com',
    submit: 'Create account',
    nameRequired: 'Enter a nickname',
    emailRequired: 'Enter your email',
    emailInvalid: 'Enter a valid email address',
    taken: 'This email is already registered',
    network: 'Could not reach the server. Try again.',
    created: (name: string) => `Created an account for ${name}`,
  }
})

const form = reactive({ name: '', email: '' })

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  email: [
    { required: true, message: labels.value.emailRequired },
    { type: 'email', message: labels.value.emailInvalid },
  ],
}))

let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(timer))

// Stands in for the request.
function respond(): Promise<void> {
  return new Promise((resolve) => {
    timer = setTimeout(resolve, 900)
  })
}

async function handleSubmit(values: FormValues) {
  status.value = ''
  await respond()
  if (offline.value) {
    formRef.value?.setRootError(labels.value.network)
    return
  }
  if (values.email === 'taken@example.com') {
    formRef.value?.setErrors({ email: labels.value.taken })
    return
  }
  status.value = labels.value.created(values.name)
}
</script>

<template>
  <div class="form-submit-demo not-prose">
    <TuffSwitch v-model="offline" size="small" :label="labels.offline" />
    <TxForm ref="formRef" v-slot="{ submitting }" :model="form" :rules="rules" @submit="handleSubmit">
      <TxFormErrorSummary :title="labels.summary" />
      <TxFormItem :label="labels.name" prop="name">
        <TuffInput v-model="form.name" autocomplete="nickname" />
      </TxFormItem>
      <TxFormItem :label="labels.email" prop="email" :help="labels.emailHelp">
        <TuffInput v-model="form.email" type="email" autocomplete="email" />
      </TxFormItem>
      <TxFormItem>
        <div class="form-submit-demo__actions">
          <TxButton variant="primary" native-type="submit" :loading="submitting">
            {{ labels.submit }}
          </TxButton>
          <span class="form-submit-demo__status" role="status">{{ status }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-submit-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 560px);
}

.form-submit-demo__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-submit-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
