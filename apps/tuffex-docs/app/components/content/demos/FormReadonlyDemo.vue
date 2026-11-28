<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const readonly = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      readonly: '只读',
      name: '成员',
      role: '角色',
      roles: [
        { value: 'owner', label: '所有者' },
        { value: 'editor', label: '编辑者' },
        { value: 'viewer', label: '查看者' },
      ],
      plan: '套餐',
      plans: [
        { value: 'free', label: '免费版' },
        { value: 'pro', label: '专业版' },
        { value: 'team', label: '团队版' },
      ],
      seats: '席位',
      notify: '邮件通知',
      decrease: '减少',
      increase: '增加',
      nameRequired: '请输入成员姓名',
      person: '林晓',
    }
  }

  return {
    readonly: 'Read-only',
    name: 'Member',
    role: 'Role',
    roles: [
      { value: 'owner', label: 'Owner' },
      { value: 'editor', label: 'Editor' },
      { value: 'viewer', label: 'Viewer' },
    ],
    plan: 'Plan',
    plans: [
      { value: 'free', label: 'Free' },
      { value: 'pro', label: 'Pro' },
      { value: 'team', label: 'Team' },
    ],
    seats: 'Seats',
    notify: 'Email notifications',
    decrease: 'Decrease',
    increase: 'Increase',
    nameRequired: 'Enter a member name',
    person: 'Lin Xiao',
  }
})

const member = reactive({ name: labels.value.person, role: 'editor', plan: 'pro', seats: 5, notify: true })

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
}))
</script>

<template>
  <div class="form-readonly-demo not-prose">
    <TuffSwitch v-model="readonly" size="small" :label="labels.readonly" />
    <TxForm :model="member" :rules="rules" :readonly="readonly">
      <TxFormItem :label="labels.name" prop="name">
        <TuffInput v-model="member.name" autocomplete="off" />
      </TxFormItem>
      <TxFormItem :label="labels.role" prop="role" width="md">
        <TxSelect v-model="member.role" :options="labels.roles" />
      </TxFormItem>
      <TxFormItem :label="labels.plan" prop="plan">
        <TxRadioGroup v-model="member.plan" type="standard" direction="row">
          <TxRadio v-for="option in labels.plans" :key="option.value" :value="option.value" :label="option.label" />
        </TxRadioGroup>
      </TxFormItem>
      <TxFormItem :label="labels.seats" prop="seats" width="sm">
        <TxNumberInput v-model="member.seats" :min="1" :max="50" :decrease-label="labels.decrease" :increase-label="labels.increase" />
      </TxFormItem>
      <TxFormItem :label="labels.notify" prop="notify" inline>
        <TuffSwitch v-model="member.notify" />
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-readonly-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 560px);
}
</style>
