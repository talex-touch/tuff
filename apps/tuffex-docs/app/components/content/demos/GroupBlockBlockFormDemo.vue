<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { TxBlockInput, TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const status = ref('')

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '通知设置',
      description: '设了 prop 的行参与表单校验',
      name: '显示名称',
      nameDesc: '用于协作空间和通知。',
      email: '通知邮箱',
      emailDesc: '每周摘要发送到这个地址。',
      digest: '每周摘要',
      digestDesc: '每周一汇总上周动态。',
      save: '保存',
      saved: '已保存',
      nameRequired: '请输入显示名称',
      emailRequired: '请输入通知邮箱',
      emailInvalid: '邮箱格式不正确',
    }
  : {
      title: 'Notifications',
      description: 'Rows with prop take part in validation',
      name: 'Display name',
      nameDesc: 'Shown in shared workspaces and notifications.',
      email: 'Notification email',
      emailDesc: 'The weekly digest goes to this address.',
      digest: 'Weekly digest',
      digestDesc: 'A summary of last week, every Monday.',
      save: 'Save',
      saved: 'Saved',
      nameRequired: 'Enter a display name',
      emailRequired: 'Enter a notification email',
      emailInvalid: 'Enter a valid email address',
    })

const settings = reactive({
  name: '',
  email: '',
  digest: true,
})

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  email: [
    { required: true, message: labels.value.emailRequired },
    { type: 'email', message: labels.value.emailInvalid },
  ],
}))

function save() {
  status.value = labels.value.saved
}
</script>

<template>
  <div class="group-block-showcase not-prose">
    <TxForm :model="settings" :rules="rules" @submit="save">
      <TxGroupBlock
        :name="labels.title"
        :description="labels.description"
        default-icon="i-carbon-notification"
        active-icon="i-carbon-notification"
        :collapsible="false"
      >
        <TxBlockInput
          v-model="settings.name"
          prop="name"
          :title="labels.name"
          :description="labels.nameDesc"
          default-icon="i-carbon-user-profile"
        />
        <TxBlockInput
          v-model="settings.email"
          prop="email"
          input-type="email"
          :title="labels.email"
          :description="labels.emailDesc"
          default-icon="i-carbon-email"
        />
        <TxBlockSwitch
          v-model="settings.digest"
          :title="labels.digest"
          :description="labels.digestDesc"
          default-icon="i-carbon-calendar"
        />
      </TxGroupBlock>
      <div class="group-block-showcase__actions">
        <TxButton variant="primary" native-type="submit">
          {{ labels.save }}
        </TxButton>
        <span class="group-block-showcase__status" role="status">{{ status }}</span>
      </div>
    </TxForm>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}

.group-block-showcase__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-block-showcase__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
