<script setup lang="ts">
import type { FormReconcile, TxFormInstance } from '@talex-touch/tuffex/form'
import { computed, onMounted, reactive, ref } from 'vue'

const { locale } = useI18n()
const formRef = ref<TxFormInstance | null>(null)
const serverWins = ref(false)
const status = ref('')
let version = 0

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      serverWins: '以服务器为准',
      name: '姓名',
      role: '职位',
      bio: '简介',
      fetch: '从服务器刷新',
      save: '保存',
      restore: '还原',
      dirty: '有未保存的修改',
      clean: '与服务器一致',
      saved: '已保存',
      person: '林晓',
      roles: ['设计师', '高级设计师', '设计负责人'],
      fetched: (n: number) => `第 ${n} 次从服务器取回。`,
    }
  }

  return {
    serverWins: 'Server wins',
    name: 'Name',
    role: 'Role',
    bio: 'Bio',
    fetch: 'Refresh from server',
    save: 'Save',
    restore: 'Restore',
    dirty: 'Unsaved changes',
    clean: 'Matches the server',
    saved: 'Saved',
    person: 'Lin Xiao',
    roles: ['Designer', 'Senior designer', 'Design lead'],
    fetched: (n: number) => `Fetched from the server, time ${n}.`,
  }
})

const profile = reactive({ name: '', role: '', bio: '' })

// Someone else keeps editing the record, so every fetch brings a new role and bio.
function fetchProfile() {
  version++
  const { person, roles, fetched } = labels.value
  return { name: person, role: roles[(version - 1) % roles.length], bio: fetched(version) }
}

// Without `reconcile`, fields the user changed keep the user's value.
const reconcile = computed<FormReconcile | undefined>(() => (serverWins.value ? ({ incoming }) => incoming : undefined))

function refresh() {
  status.value = ''
  formRef.value?.setBaseline(fetchProfile())
}

function save() {
  status.value = labels.value.saved
}

onMounted(refresh)
</script>

<template>
  <div class="form-baseline-demo not-prose">
    <TuffSwitch v-model="serverWins" size="small" :label="labels.serverWins" />
    <TxForm ref="formRef" v-slot="{ dirty }" :model="profile" :reconcile="reconcile" @submit="save">
      <TxFormItem :label="labels.name" prop="name">
        <TuffInput v-model="profile.name" />
      </TxFormItem>
      <TxFormItem :label="labels.role" prop="role">
        <TuffInput v-model="profile.role" />
      </TxFormItem>
      <TxFormItem :label="labels.bio" prop="bio">
        <TxTextarea v-model="profile.bio" :rows="2" resize="none" />
      </TxFormItem>
      <TxFormItem>
        <div class="form-baseline-demo__actions">
          <TxButton @click="refresh">
            {{ labels.fetch }}
          </TxButton>
          <TxButton variant="primary" native-type="submit" :disabled="!dirty">
            {{ labels.save }}
          </TxButton>
          <TxButton native-type="reset" :disabled="!dirty" @click="status = ''">
            {{ labels.restore }}
          </TxButton>
          <span class="form-baseline-demo__status" role="status">{{ dirty ? labels.dirty : status || labels.clean }}</span>
        </div>
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-baseline-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 560px);
}

.form-baseline-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.form-baseline-demo__status {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
