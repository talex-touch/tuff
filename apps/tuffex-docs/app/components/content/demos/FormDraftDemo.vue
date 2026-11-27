<script setup lang="ts">
import type { FormMessages, FormPersistOptions } from '@talex-touch/tuffex/form'
import { computed, nextTick, reactive, ref } from 'vue'

const { locale } = useI18n()
const manual = ref(false)
const open = ref(true)
const status = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      manual: '恢复前先询问',
      name: '昵称',
      bio: '简介',
      password: '当前密码',
      passwordHelp: '密码不会写进草稿',
      reopen: '关闭后重新打开',
      save: '保存',
      saved: '已保存，草稿随之删除',
      person: '林晓',
      about: '在上海做设计。',
      restored: (time: string) => `已恢复 ${time} 未保存的更改。`,
      pending: (time: string) => `有 ${time} 未保存的更改。`,
      restore: '恢复',
      discard: '丢弃',
    }
  }

  return {
    manual: 'Ask before restoring',
    name: 'Nickname',
    bio: 'Bio',
    password: 'Current password',
    passwordHelp: 'Passwords never go into the draft',
    reopen: 'Close and reopen',
    save: 'Save',
    saved: 'Saved, and the draft is gone',
    person: 'Lin Xiao',
    about: 'Designs things in Shanghai.',
    restored: (time: string) => `Restored unsaved changes from ${time}.`,
    pending: (time: string) => `You have unsaved changes from ${time}.`,
    restore: 'Restore',
    discard: 'Discard',
  }
})

// What the server holds; reopening fetches it again.
let server: { name: string, bio: string } | null = null

function fetchProfile() {
  return reactive({ ...(server ?? { name: labels.value.person, bio: labels.value.about }), password: '' })
}

const profile = ref(fetchProfile())

// Session storage keeps the demo's draft out of your browser once the tab closes.
const persist = computed<FormPersistOptions>(() => ({ storage: 'session', restore: manual.value ? 'manual' : 'auto' }))

function savedAt(date: Date) {
  return date.toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
}

const messages = computed<Partial<FormMessages>>(() => ({
  draftRestored: date => labels.value.restored(savedAt(date)),
  draftPending: date => labels.value.pending(savedAt(date)),
  draftRestore: labels.value.restore,
  draftDiscard: labels.value.discard,
}))

async function reopen() {
  open.value = false
  status.value = ''
  await nextTick()
  profile.value = fetchProfile()
  open.value = true
}

function save(values: Record<string, any>) {
  server = { name: values.name, bio: values.bio }
  status.value = labels.value.saved
}
</script>

<template>
  <div class="form-draft-demo not-prose">
    <TuffSwitch v-model="manual" size="small" :label="labels.manual" />
    <TxForm v-if="open" id="docs-form-draft" :model="profile" :persist="persist" :messages="messages" @submit="save">
      <TxFormItem :label="labels.name" prop="name">
        <TuffInput v-model="profile.name" />
      </TxFormItem>
      <TxFormItem :label="labels.bio" prop="bio">
        <TxTextarea v-model="profile.bio" :rows="2" resize="none" />
      </TxFormItem>
      <TxFormItem :label="labels.password" prop="password" :help="labels.passwordHelp">
        <TuffInput v-model="profile.password" type="password" autocomplete="current-password" />
      </TxFormItem>
      <TxFormItem>
        <div class="form-draft-demo__actions">
          <TxButton @click="reopen">
            {{ labels.reopen }}
          </TxButton>
          <TxButton variant="primary" native-type="submit">
            {{ labels.save }}
          </TxButton>
          <span class="form-draft-demo__status" role="status">{{ status }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-draft-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 560px);
  min-height: 300px;
}

.form-draft-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.form-draft-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
