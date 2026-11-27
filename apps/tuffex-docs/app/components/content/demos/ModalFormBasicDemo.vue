<script setup lang="ts">
import type { FormRules, FormValues } from '@talex-touch/tuffex/form'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      edit: '编辑',
      title: '编辑成员',
      name: '姓名',
      email: '邮箱',
      role: '角色',
      roles: [
        { value: 'owner', label: '所有者' },
        { value: 'editor', label: '编辑者' },
        { value: 'viewer', label: '查看者' },
      ],
      save: '保存',
      cancel: '取消',
      close: '关闭',
      nameRequired: '请输入姓名',
      emailRequired: '请输入邮箱',
      emailInvalid: '邮箱格式不正确',
      leave: '有未保存的更改，仍要关闭吗？',
      person: '林晓',
    }
  }

  return {
    edit: 'Edit',
    title: 'Edit member',
    name: 'Name',
    email: 'Email',
    role: 'Role',
    roles: [
      { value: 'owner', label: 'Owner' },
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Viewer' },
    ],
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    nameRequired: 'Enter a name',
    emailRequired: 'Enter an email address',
    emailInvalid: 'Enter a valid email address',
    leave: 'You have unsaved changes. Close anyway?',
    person: 'Lin Xiao',
  }
})

// What the server holds. The dialog edits a copy of it.
const saved = ref<FormValues | null>(null)
const member = computed<FormValues>(() => saved.value ?? { name: labels.value.person, email: 'lin@example.com', role: 'editor' })
const roleLabel = computed(() => labels.value.roles.find(role => role.value === member.value.role)?.label)

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  email: [
    { required: true, message: labels.value.emailRequired },
    { type: 'email', message: labels.value.emailInvalid },
  ],
}))

// Stands in for the request: the dialog stays open, its button spinning, until it resolves.
async function save(values: FormValues) {
  await new Promise(resolve => setTimeout(resolve, 800))
  saved.value = values
}
</script>

<template>
  <div class="modal-form-demo not-prose">
    <div class="modal-form-demo__member">
      <div class="modal-form-demo__text">
        <span class="modal-form-demo__name">{{ member.name }}</span>
        <span class="modal-form-demo__meta">{{ member.email }} · {{ roleLabel }}</span>
      </div>
      <TxButton @click="open = true">
        {{ labels.edit }}
      </TxButton>
    </div>
    <TxModalForm
      v-model="open"
      :title="labels.title"
      :initial-values="member"
      :rules="rules"
      :messages="{ leaveConfirm: labels.leave }"
      :submit-text="labels.save"
      :cancel-text="labels.cancel"
      :modal-props="{ closeLabel: labels.close }"
      @submit="save"
    >
      <template #default="{ model }">
        <TxFormItem :label="labels.name" prop="name">
          <TuffInput v-model="model.name" autocomplete="off" />
        </TxFormItem>
        <TxFormItem :label="labels.email" prop="email">
          <TuffInput v-model="model.email" type="email" autocomplete="off" />
        </TxFormItem>
        <TxFormItem :label="labels.role" prop="role">
          <TxSelect v-model="model.role" :options="labels.roles" />
        </TxFormItem>
      </template>
    </TxModalForm>
  </div>
</template>

<style scoped>
.modal-form-demo {
  width: min(100%, 480px);
}

.modal-form-demo__member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 12px;
}

.modal-form-demo__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.modal-form-demo__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.modal-form-demo__meta {
  overflow: hidden;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
