<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const formRef = ref<any>()
const message = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      name: '名称',
      email: '邮箱',
      namePlaceholder: '请输入名称',
      emailPlaceholder: 'name@example.com',
      validate: '校验',
      reset: '重置',
      nameRequired: '请输入名称',
      emailRequired: '请输入邮箱',
      emailInvalid: '邮箱格式错误',
      pass: '表单校验通过',
      failed: '请检查表单',
    }
  }

  return {
    name: 'Name',
    email: 'Email',
    namePlaceholder: 'Enter your name',
    emailPlaceholder: 'name@example.com',
    validate: 'Validate',
    reset: 'Reset',
    nameRequired: 'Please enter your name',
    emailRequired: 'Please enter your email',
    emailInvalid: 'Invalid email format',
    pass: 'Form validation passed',
    failed: 'Please check the form',
  }
})

const form = reactive({
  name: '',
  email: '',
})

const rules = computed(() => ({
  name: { required: true, message: labels.value.nameRequired },
  email: {
    validator: (value: string) => {
      if (!value)
        return labels.value.emailRequired
      return value.includes('@') || labels.value.emailInvalid
    },
  },
}))

async function handleValidate() {
  const ok = await formRef.value?.validate()
  message.value = ok ? labels.value.pass : labels.value.failed
}

function handleReset() {
  formRef.value?.resetFields()
  message.value = ''
}
</script>

<template>
  <div class="group" style="max-width: 420px;">
    <TxForm ref="formRef" :model="form" :rules="rules" label-width="90px">
      <TxFormItem :label="labels.name" prop="name">
        <TuffInput v-model="form.name" :placeholder="labels.namePlaceholder" />
      </TxFormItem>
      <TxFormItem :label="labels.email" prop="email">
        <TuffInput v-model="form.email" :placeholder="labels.emailPlaceholder" />
      </TxFormItem>
      <div style="display: flex; gap: 8px;">
        <TxButton variant="primary" @click="handleValidate">
          {{ labels.validate }}
        </TxButton>
        <TxButton @click="handleReset">
          {{ labels.reset }}
        </TxButton>
      </div>
      <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
        {{ message }}
      </div>
    </TxForm>
  </div>
</template>
