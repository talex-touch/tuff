<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const status = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      summary: '提交前还有几处要处理',
      role: '你的角色',
      roles: [
        { value: 'design', label: '设计' },
        { value: 'engineering', label: '开发' },
        { value: 'product', label: '产品' },
        { value: 'other', label: '其他' },
      ],
      choose: '请选择',
      years: '使用年数',
      satisfaction: '整体满意度',
      levels: [
        { value: '1', label: '不满意' },
        { value: '2', label: '一般' },
        { value: '3', label: '满意' },
        { value: '4', label: '非常满意' },
      ],
      features: '常用功能',
      featureOptions: [
        { value: 'search', label: '搜索' },
        { value: 'clipboard', label: '剪贴板' },
        { value: 'plugins', label: '插件' },
        { value: 'ai', label: '智能' },
      ],
      feedback: '建议',
      feedbackHelp: '选填，至少 10 个字',
      contact: '可以就这份反馈联系我',
      decrease: '减少',
      increase: '增加',
      submit: '提交问卷',
      roleRequired: '请选择你的角色',
      yearsRequired: '请填写使用年数',
      satisfactionRequired: '请选择满意度',
      featuresRequired: '至少选择一项常用功能',
      feedbackShort: '建议至少写 10 个字',
      thanks: '已收到，感谢反馈。',
    }
  }

  return {
    summary: 'A few answers need another look',
    role: 'Your role',
    roles: [
      { value: 'design', label: 'Design' },
      { value: 'engineering', label: 'Engineering' },
      { value: 'product', label: 'Product' },
      { value: 'other', label: 'Other' },
    ],
    choose: 'Choose one',
    years: 'Years of use',
    satisfaction: 'Overall satisfaction',
    levels: [
      { value: '1', label: 'Unhappy' },
      { value: '2', label: 'Neutral' },
      { value: '3', label: 'Happy' },
      { value: '4', label: 'Very happy' },
    ],
    features: 'Features you use',
    featureOptions: [
      { value: 'search', label: 'Search' },
      { value: 'clipboard', label: 'Clipboard' },
      { value: 'plugins', label: 'Plugins' },
      { value: 'ai', label: 'AI' },
    ],
    feedback: 'Suggestions',
    feedbackHelp: 'Optional, at least 10 characters',
    contact: 'You may contact me about this feedback',
    decrease: 'Decrease',
    increase: 'Increase',
    submit: 'Send answers',
    roleRequired: 'Choose your role',
    yearsRequired: 'Enter how many years',
    satisfactionRequired: 'Choose how satisfied you are',
    featuresRequired: 'Choose at least one feature',
    feedbackShort: 'Write at least 10 characters',
    thanks: 'Received. Thank you for the feedback.',
  }
})

const answers = reactive({
  role: '',
  years: null as number | null,
  satisfaction: '',
  features: [] as string[],
  feedback: '',
  contact: false,
})

const rules = computed<FormRules>(() => ({
  role: { required: true, message: labels.value.roleRequired },
  years: { required: true, message: labels.value.yearsRequired },
  satisfaction: { required: true, message: labels.value.satisfactionRequired },
  features: { required: true, message: labels.value.featuresRequired },
  feedback: { minLength: 10, message: labels.value.feedbackShort },
}))

// Stands in for the request.
async function submit() {
  await new Promise(resolve => setTimeout(resolve, 600))
  status.value = labels.value.thanks
}
</script>

<template>
  <div class="form-survey-demo not-prose">
    <TxForm v-slot="{ submitting }" :model="answers" :rules="rules" validate-on="submit" layout="stacked" @submit="submit">
      <TxFormErrorSummary :title="labels.summary" />
      <TxFormItem :label="labels.role" prop="role" width="md">
        <TxSelect v-model="answers.role" :options="labels.roles" :placeholder="labels.choose" />
      </TxFormItem>
      <TxFormItem :label="labels.years" prop="years" width="sm">
        <TxNumberInput v-model="answers.years" :min="0" :max="30" :decrease-label="labels.decrease" :increase-label="labels.increase" />
      </TxFormItem>
      <TxFormItem :label="labels.satisfaction" prop="satisfaction">
        <TxRadioGroup v-model="answers.satisfaction" type="standard" direction="row">
          <TxRadio v-for="option in labels.levels" :key="option.value" :value="option.value" :label="option.label" />
        </TxRadioGroup>
      </TxFormItem>
      <TxFormItem :label="labels.features" prop="features" width="lg">
        <TxSelect v-model="answers.features" :options="labels.featureOptions" multiple :placeholder="labels.choose" />
      </TxFormItem>
      <TxFormItem :label="labels.feedback" prop="feedback" :help="labels.feedbackHelp">
        <TxTextarea v-model="answers.feedback" :rows="3" resize="none" />
      </TxFormItem>
      <TxFormItem prop="contact">
        <TxCheckbox v-model="answers.contact" :label="labels.contact" />
      </TxFormItem>
      <TxFormItem>
        <div class="form-survey-demo__actions">
          <TxButton variant="primary" native-type="submit" :loading="submitting">
            {{ labels.submit }}
          </TxButton>
          <span class="form-survey-demo__status" role="status">{{ status }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-survey-demo {
  width: min(100%, 560px);
}

.form-survey-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.form-survey-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
