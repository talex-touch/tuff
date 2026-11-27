<script setup lang="ts">
import type { FormRules, FormValues } from '@talex-touch/tuffex/form'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      create: '新建项目',
      title: '新建项目',
      name: '名称',
      key: '标识',
      keyHelp: '2 到 10 位大写字母或数字，以字母开头',
      description: '描述',
      visibility: '可见范围',
      visibilities: [
        { value: 'private', label: '仅自己' },
        { value: 'team', label: '团队' },
        { value: 'public', label: '公开' },
      ],
      save: '创建',
      cancel: '取消',
      close: '关闭抽屉',
      nameRequired: '请输入项目名称',
      keyInvalid: '标识需要 2 到 10 位大写字母或数字，以字母开头',
      leave: '有未保存的更改，仍要关闭吗？',
      empty: '还没有项目',
    }
  }

  return {
    create: 'New project',
    title: 'New project',
    name: 'Name',
    key: 'Key',
    keyHelp: '2 to 10 capital letters or digits, starting with a letter',
    description: 'Description',
    visibility: 'Visibility',
    visibilities: [
      { value: 'private', label: 'Only me' },
      { value: 'team', label: 'Team' },
      { value: 'public', label: 'Public' },
    ],
    save: 'Create',
    cancel: 'Cancel',
    close: 'Close drawer',
    nameRequired: 'Enter a project name',
    keyInvalid: 'Use 2 to 10 capital letters or digits, starting with a letter',
    leave: 'You have unsaved changes. Close anyway?',
    empty: 'No projects yet',
  }
})

// Every open starts from these; the drawer edits a copy.
const blank = { name: '', key: '', description: '', visibility: 'team' }
const projects = ref<FormValues[]>([])

const rules = computed<FormRules>(() => ({
  name: { required: true, message: labels.value.nameRequired },
  key: { pattern: /^[A-Z][A-Z0-9]{1,9}$/, message: labels.value.keyInvalid },
}))

function visibilityLabel(value: string) {
  return labels.value.visibilities.find(option => option.value === value)?.label
}

// Stands in for the request: the drawer stays open, its button spinning, until it resolves.
async function create(values: FormValues) {
  await new Promise(resolve => setTimeout(resolve, 800))
  projects.value = [values, ...projects.value]
}
</script>

<template>
  <div class="drawer-form-demo not-prose">
    <TxButton variant="primary" @click="open = true">
      {{ labels.create }}
    </TxButton>
    <ul v-if="projects.length" class="drawer-form-demo__list">
      <li v-for="(project, index) in projects" :key="index">
        <span class="drawer-form-demo__name">{{ project.name }}</span>
        <span class="drawer-form-demo__meta">{{ [project.key, visibilityLabel(project.visibility)].filter(Boolean).join(' · ') }}</span>
      </li>
    </ul>
    <p v-else class="drawer-form-demo__empty">
      {{ labels.empty }}
    </p>
    <TxDrawerForm
      v-model:visible="open"
      :title="labels.title"
      :initial-values="blank"
      :rules="rules"
      :messages="{ leaveConfirm: labels.leave }"
      :submit-text="labels.save"
      :cancel-text="labels.cancel"
      :drawer-props="{ size: 'min(92vw, 440px)', closeLabel: labels.close }"
      layout="stacked"
      @submit="create"
    >
      <template #default="{ model }">
        <TxFormItem :label="labels.name" prop="name">
          <TuffInput v-model="model.name" autocomplete="off" />
        </TxFormItem>
        <TxFormItem :label="labels.key" prop="key" :help="labels.keyHelp" width="sm">
          <TuffInput v-model="model.key" autocomplete="off" />
        </TxFormItem>
        <TxFormItem :label="labels.description" prop="description">
          <TxTextarea v-model="model.description" :rows="3" resize="none" />
        </TxFormItem>
        <TxFormItem :label="labels.visibility" prop="visibility">
          <TxRadioGroup v-model="model.visibility" type="standard" direction="row">
            <TxRadio v-for="option in labels.visibilities" :key="option.value" :value="option.value" :label="option.label" />
          </TxRadioGroup>
        </TxFormItem>
      </template>
    </TxDrawerForm>
  </div>
</template>

<style scoped>
.drawer-form-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  width: min(100%, 480px);
}

.drawer-form-demo__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 0;
  margin: 0;
  list-style: none;
}

.drawer-form-demo__list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 10px;
}

.drawer-form-demo__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.drawer-form-demo__meta,
.drawer-form-demo__empty {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
