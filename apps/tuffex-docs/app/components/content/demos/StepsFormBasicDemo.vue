<script setup lang="ts">
import type { FormMessages, FormRules, FormValues } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      team: '团队',
      invite: '邀请',
      plan: '套餐',
      name: '团队名称',
      handle: '团队地址',
      handleHelp: '小写字母、数字或连字符',
      email: '成员邮箱',
      role: '角色',
      roles: [
        { value: 'admin', label: '管理员' },
        { value: 'member', label: '成员' },
      ],
      plans: [
        { value: 'free', label: '免费版' },
        { value: 'pro', label: '专业版' },
        { value: 'team', label: '团队版' },
      ],
      prev: '上一步',
      next: '下一步',
      submit: '创建团队',
      nameRequired: '请输入团队名称',
      handleRequired: '请输入团队地址',
      handleInvalid: '只能使用小写字母、数字或连字符',
      emailInvalid: '邮箱格式不正确',
      planRequired: '请选择套餐',
      done: (name: string) => `「${name}」已创建。`,
      again: '再建一个',
      hint: '填到一半刷新页面，表单回到原来那一步',
      restored: (time: string) => `已恢复 ${time} 未保存的更改。`,
      pending: (time: string) => `有 ${time} 未保存的更改。`,
      restore: '恢复',
      discard: '丢弃',
    }
  }

  return {
    team: 'Team',
    invite: 'Invite',
    plan: 'Plan',
    name: 'Team name',
    handle: 'Team address',
    handleHelp: 'Lowercase letters, digits or hyphens',
    email: 'Member email',
    role: 'Role',
    roles: [
      { value: 'admin', label: 'Admin' },
      { value: 'member', label: 'Member' },
    ],
    plans: [
      { value: 'free', label: 'Free' },
      { value: 'pro', label: 'Pro' },
      { value: 'team', label: 'Team' },
    ],
    prev: 'Back',
    next: 'Next',
    submit: 'Create team',
    nameRequired: 'Enter a team name',
    handleRequired: 'Enter a team address',
    handleInvalid: 'Use lowercase letters, digits or hyphens',
    emailInvalid: 'Enter a valid email address',
    planRequired: 'Choose a plan',
    done: (name: string) => `“${name}” is ready.`,
    again: 'Create another',
    hint: 'Reload halfway through: the form comes back on the same step',
    restored: (time: string) => `Restored unsaved changes from ${time}.`,
    pending: (time: string) => `You have unsaved changes from ${time}.`,
    restore: 'Restore',
    discard: 'Discard',
  }
})

function blank() {
  return reactive({ name: '', handle: '', email: '', role: 'member', plan: '' })
}

const team = ref(blank())
const active = ref(0)
const created = ref('')

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  handle: [
    { required: true, message: labels.value.handleRequired },
    { pattern: /^[a-z0-9-]+$/, message: labels.value.handleInvalid },
  ],
  email: { type: 'email', message: labels.value.emailInvalid },
  plan: { required: true, message: labels.value.planRequired },
}))

function savedAt(date: Date) {
  return date.toLocaleString(locale.value === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' })
}

const messages = computed<Partial<FormMessages>>(() => ({
  draftRestored: date => labels.value.restored(savedAt(date)),
  draftPending: date => labels.value.pending(savedAt(date)),
  draftRestore: labels.value.restore,
  draftDiscard: labels.value.discard,
}))

async function create(values: FormValues) {
  await new Promise(resolve => setTimeout(resolve, 800))
  created.value = values.name
}

// A new record for a new team: the form starts over from the first step.
function again() {
  team.value = blank()
  active.value = 0
  created.value = ''
}
</script>

<template>
  <div class="steps-form-demo not-prose">
    <div v-if="created" class="steps-form-demo__done">
      <p>{{ labels.done(created) }}</p>
      <TxButton @click="again">
        {{ labels.again }}
      </TxButton>
    </div>
    <template v-else>
      <TxStepsForm
        id="docs-steps-form"
        v-model:active="active"
        :model="team"
        :rules="rules"
        :persist="{ storage: 'session' }"
        :messages="messages"
        :prev-text="labels.prev"
        :next-text="labels.next"
        :submit-text="labels.submit"
        layout="stacked"
        @submit="create"
      >
        <TxFormStep :title="labels.team">
          <TxFormItem :label="labels.name" prop="name">
            <TuffInput v-model="team.name" autocomplete="organization" />
          </TxFormItem>
          <TxFormItem :label="labels.handle" prop="handle" :help="labels.handleHelp">
            <TuffInput v-model="team.handle" autocomplete="off" />
          </TxFormItem>
        </TxFormStep>
        <TxFormStep :title="labels.invite">
          <TxFormItem :label="labels.email" prop="email">
            <TuffInput v-model="team.email" type="email" autocomplete="off" />
          </TxFormItem>
          <TxFormItem :label="labels.role" prop="role">
            <TxSelect v-model="team.role" :options="labels.roles" />
          </TxFormItem>
        </TxFormStep>
        <TxFormStep :title="labels.plan">
          <TxFormItem :label="labels.plan" prop="plan">
            <TxRadioGroup v-model="team.plan" type="standard" direction="row">
              <TxRadio v-for="option in labels.plans" :key="option.value" :value="option.value" :label="option.label" />
            </TxRadioGroup>
          </TxFormItem>
        </TxFormStep>
      </TxStepsForm>
      <p class="steps-form-demo__hint">
        {{ labels.hint }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.steps-form-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(100%, 560px);
}

.steps-form-demo__done {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.steps-form-demo__done p {
  margin: 0;
  font-size: 14px;
  color: var(--tx-text-color-primary, #303133);
}

.steps-form-demo__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
