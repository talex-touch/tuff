<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const status = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      username: '用户名',
      usernameHelp: '3 到 20 个字符',
      email: '邮箱',
      confirm: '确认邮箱',
      website: '个人主页',
      submit: '注册',
      reset: '重置',
      usernameRequired: '请输入用户名',
      usernameLength: '用户名需要 3 到 20 个字符',
      emailRequired: '请输入邮箱',
      emailInvalid: '邮箱格式不正确',
      confirmRequired: '请再次输入邮箱',
      confirmMismatch: '两次输入的邮箱不一致',
      websiteInvalid: '请输入以 http:// 或 https:// 开头的地址',
      websiteInsecure: '建议使用 https 地址',
      done: '全部校验通过',
    }
  }

  return {
    username: 'Username',
    usernameHelp: '3 to 20 characters',
    email: 'Email',
    confirm: 'Confirm email',
    website: 'Website',
    submit: 'Sign up',
    reset: 'Reset',
    usernameRequired: 'Enter a username',
    usernameLength: 'Use 3 to 20 characters',
    emailRequired: 'Enter your email',
    emailInvalid: 'Enter a valid email address',
    confirmRequired: 'Enter your email again',
    confirmMismatch: 'The emails do not match',
    websiteInvalid: 'Start the address with http:// or https://',
    websiteInsecure: 'An https address is safer',
    done: 'All checks passed',
  }
})

const form = reactive({
  username: '',
  email: '',
  confirm: '',
  website: '',
})

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: labels.value.usernameRequired },
    { minLength: 3, maxLength: 20, message: labels.value.usernameLength },
  ],
  email: [
    { required: true, message: labels.value.emailRequired },
    { type: 'email', message: labels.value.emailInvalid },
  ],
  confirm: [
    { required: true, message: labels.value.confirmRequired },
    { validator: value => value === form.email || labels.value.confirmMismatch, deps: ['email'] },
  ],
  website: [
    { type: 'url', message: labels.value.websiteInvalid },
    { validator: value => !value || value.startsWith('https://') || labels.value.websiteInsecure, level: 'warning' },
  ],
}))

function handleSubmit() {
  status.value = labels.value.done
}
</script>

<template>
  <div class="form-demo not-prose">
    <TxForm :model="form" :rules="rules" @submit="handleSubmit">
      <TxFormItem :label="labels.username" prop="username" :help="labels.usernameHelp">
        <TuffInput v-model="form.username" autocomplete="username" />
      </TxFormItem>
      <TxFormItem :label="labels.email" prop="email">
        <TuffInput v-model="form.email" type="email" autocomplete="email" />
      </TxFormItem>
      <TxFormItem :label="labels.confirm" prop="confirm">
        <TuffInput v-model="form.confirm" type="email" autocomplete="off" />
      </TxFormItem>
      <TxFormItem :label="labels.website" prop="website">
        <TuffInput v-model="form.website" placeholder="https://" autocomplete="url" />
      </TxFormItem>
      <TxFormItem>
        <div class="form-demo__actions">
          <TxButton variant="primary" native-type="submit">
            {{ labels.submit }}
          </TxButton>
          <TxButton native-type="reset" @click="status = ''">
            {{ labels.reset }}
          </TxButton>
          <span class="form-demo__status" role="status">{{ status }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-demo {
  width: min(100%, 560px);
}

.form-demo__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
