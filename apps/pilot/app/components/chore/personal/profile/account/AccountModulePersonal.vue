<script setup lang="ts">
import type { ComponentSize, FormInstance, FormRules, UploadProps } from 'element-plus'
import dayjs from 'dayjs'
import { getAccountDetail } from '~/composables/api/account'
import ImageUpload from '~/components/personal/ImageUpload.vue'

interface RuleForm {
  nickname: string
  avatar: string
  qq: string
  phone: string
  email: string
  remark: string
}

const props = defineProps<{
  data: any
}>()

const loading = ref(false)
const formSize = ref<ComponentSize>('default')
const ruleFormRef = ref<FormInstance>()
const ruleForm = reactive<RuleForm>({
  nickname: '',
  avatar: '',
  qq: '',
  phone: '',
  email: '',
  remark: '',
})

onMounted(() => {
  Object.assign(ruleForm, userStore.value)
})

const rules = reactive<FormRules<RuleForm>>({
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 2, max: 24, message: '长度应该在 4-24 之间', trigger: 'blur' },
  ],
  avatar: [
    { required: true, message: '请上传头像', trigger: 'blur' },
  ],
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return

  loading.value = true

  await formEl.validate(async (valid, fields) => {
    if (valid) {
      const res: any = await updateAccountDetail({ avatar: ruleForm.avatar, nickname: ruleForm.nickname })
      if (res.code === 200) {
        ElMessage({
          message: `更新成功！`,
          grouping: true,
          type: 'success',
          plain: true,
        })
        await getAccountDetail()
      }
    }
    else {
      ElMessage({
        message: `请填写正确的信息`,
        grouping: true,
        type: 'error',
        plain: true,
      })

      console.error('error submit!', fields)
    }

    loading.value = false
  })
}

function resetForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  formEl.resetFields()

  Object.assign(ruleForm, userStore.value)
}

const lastEditTime = computed(() => dayjs(userStore.value.updatedAt).format('DD MMMM YYYY'))
</script>

<template>
  <div flex-col style="align-items: flex-start" class="TouchDialog-Title">
    <div flex items-center gap-2>
      <div i-carbon:user />个人信息
    </div>
    <p style="font-size: 16px" op-50>
      最后编辑：{{ lastEditTime }}
    </p>
  </div>

  <div style="padding: 1rem" class="ModulePersonal TouchDialog-Content">
    <div class="ModulePersonal-Main">
      <el-form
        ref="ruleFormRef" style="max-width: 400px" :model="ruleForm" :rules="rules" label-width="auto"
        :size="formSize" status-icon
      >
        <el-form-item label="头像" prop="avatar">
          <ImageUpload v-model="ruleForm.avatar" />
          <!-- <UserUploadAvatar v-model="ruleForm.avatar" /> -->
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="ruleForm.nickname" />
        </el-form-item>

        <el-form-item label="手机号" prop="phone">
          <el-input v-model="ruleForm.phone" disabled />
        </el-form-item>

        <el-form-item label="QQ" prop="qq">
          <el-input v-model="ruleForm.qq" disabled />
        </el-form-item>
      </el-form>

      <ChorePersonalFortuneCard v-if="false" />
      <ChorePersonalInvitationCard v-if="false" />
    </div>

    <div flex class="ProfileWrapper-Footer">
      <el-button type="primary" @click="submitForm(ruleFormRef)">
        更新
      </el-button>
      <el-button @click="resetForm(ruleFormRef)">
        重置
      </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ModulePersonal {
  &-Main {
    margin: 1rem 0;
  }
  width: 480px;
  max-width: 85vw;

  height: 330px;
}
</style>
