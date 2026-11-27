<script setup lang="ts">
import type { FormMessages, FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const savedAt = ref<Date | null>(null)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      name: '显示名称',
      email: '通知邮箱',
      notify: '邮件通知',
      language: '界面语言',
      languages: [
        { value: 'zh', label: '简体中文' },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
      ],
      nameRequired: '请输入显示名称',
      emailInvalid: '邮箱格式不正确',
      idle: '停止编辑一秒后自动保存',
      saving: '正在保存…',
      saved: (time: string) => `已保存 ${time}`,
      autosaved: '更改已保存。',
      autosaveFailed: '更改未能保存。',
      person: '林晓',
    }
  }

  return {
    name: 'Display name',
    email: 'Notification email',
    notify: 'Email notifications',
    language: 'Language',
    languages: [
      { value: 'zh', label: '简体中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
    ],
    nameRequired: 'Enter a display name',
    emailInvalid: 'Enter a valid email address',
    idle: 'Saves a second after you stop editing',
    saving: 'Saving…',
    saved: (time: string) => `Saved at ${time}`,
    autosaved: 'Changes saved.',
    autosaveFailed: 'Your changes could not be saved.',
    person: 'Lin Xiao',
  }
})

const settings = reactive({ name: labels.value.person, email: 'lin@example.com', notify: true, language: 'zh' })

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  email: { type: 'email', message: labels.value.emailInvalid },
}))

// Read out by the form's own status region; the line below is for the eye.
const messages = computed<Partial<FormMessages>>(() => ({
  autosaved: labels.value.autosaved,
  autosaveFailed: labels.value.autosaveFailed,
}))

function time(date: Date) {
  return date.toLocaleTimeString(locale.value === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Stands in for the request.
async function save() {
  await new Promise(resolve => setTimeout(resolve, 500))
}
</script>

<template>
  <div class="form-autosave-demo not-prose">
    <TxForm :model="settings" :rules="rules" :messages="messages" autosave @submit="save" @submit-success="savedAt = new Date()">
      <template #default="{ submitting }">
        <TxFormItem :label="labels.name" prop="name">
          <TuffInput v-model="settings.name" autocomplete="nickname" />
        </TxFormItem>
        <TxFormItem :label="labels.email" prop="email">
          <TuffInput v-model="settings.email" type="email" autocomplete="email" />
        </TxFormItem>
        <TxFormItem :label="labels.notify" prop="notify" inline>
          <TuffSwitch v-model="settings.notify" />
        </TxFormItem>
        <TxFormItem :label="labels.language" prop="language" width="md">
          <TxSelect v-model="settings.language" :options="labels.languages" />
        </TxFormItem>
        <TxFormItem>
          <span class="form-autosave-demo__status">
            {{ submitting ? labels.saving : savedAt ? labels.saved(time(savedAt)) : labels.idle }}
          </span>
        </TxFormItem>
      </template>
    </TxForm>
  </div>
</template>

<style scoped>
.form-autosave-demo {
  width: min(100%, 560px);
}

.form-autosave-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
