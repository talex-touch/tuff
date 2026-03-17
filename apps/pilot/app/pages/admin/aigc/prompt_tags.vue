<script lang="ts" setup>
import type { FormInstance, FormRules } from 'element-plus'
import UserAvatar from '~/components/personal/UserAvatar.vue'
import UserUploadAvatar from '~/components/personal/UserUploadAvatar.vue'
import StandardPrompt from './standard-prompt.txt?raw'
import RenderContentOld from '~/components/render/RenderContent.vue'
import type { PromptTagDto } from '~/composables/api/chat'
import { createPromptTag, getPromptDailyStatistics, getPromptTagList, updatePromptTag } from '~/composables/api/chat'
import IconSelector from '~/components/selector/IconSelector.vue'

definePageMeta({
  name: 'PromptTemplate 标签管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const formLoading = ref(false)
const promptTags = ref<{
  items: PromptTagDto[]
  meta: {
    currentPage: number
    perPage: number
    total: number
    totalPages: number
    itemsPerPage: number
    totalItems: number
  }
}>({
  items: [],
  meta: {
    currentPage: 0,
    perPage: 0,
    total: 0,
    totalPages: 0,
    itemsPerPage: 0,
    totalItems: 0,
  },
})

const formInline = reactive({
  name: '',
})

function handleReset() {
  formInline.name = ''
}

onMounted(fetchData)

async function fetchData() {
  formLoading.value = true

  const query: Record<string, any> = {
    page: promptTags.value.meta.currentPage,
    pageSize: promptTags.value.meta.itemsPerPage,
    name: formInline.name,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  const res: any = await getPromptTagList(query)
  if (!res)
    ElMessage.warning('参数错误，查询失败！')
  else
    if (res.code === 200)
      promptTags.value = res.data

  formLoading.value = false
}

const dialogOptions = reactive<{
  visible: boolean
  mode: 'edit' | 'read' | 'new'
  data: PromptTagDto | null
  loading: boolean
}>({
  visible: false,
  mode: 'edit',
  data: null,
  loading: false,
})

function handleDialog(data: PromptTagDto | null, mode: 'edit' | 'read' | 'new') {
  dialogOptions.mode = mode
  dialogOptions.visible = true
  dialogOptions.data = (mode === 'new'
    ? {
        id: '',
        color: '',
        description: '',
        name: '',
        icon: '',
        weight: '',
      }
    : { ...data }) as PromptTagDto
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<FormRules<PromptTagDto>>({
  name: [
    { required: true, message: '请输入标签标题', trigger: 'blur' },
    { min: 2, max: 255, message: '标签标题需要在 2-255 位之间', trigger: 'blur' },
  ],
  icon: [
    { required: true, message: '请选择图标', trigger: 'blur' },
  ],
  color: [
    { required: true, message: '请选择颜色', trigger: 'blur' },
  ],
  weight: [
    { required: true, message: '请输入权重', trigger: 'blur' },
  ],
  description: [
    { required: true, message: '请输入标签介绍', trigger: 'blur' },
    { min: 20, max: 255, message: '标签介绍需要在 20-255 位之间', trigger: 'blur' },
  ],
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  await formEl.validate(async (valid) => {
    if (!valid)
      return

    dialogOptions.loading = true

    if (dialogOptions.mode !== 'new') {
      const res: any = await updatePromptTag(
        dialogOptions.data!.id!,
        dialogOptions.data as PromptTagDto,
      )

      if (res.code === 200) {
        ElMessage.success('修改成功！')
        dialogOptions.visible = false
        fetchData()
      }
      else {
        ElMessage.error(res.message ?? '修改失败！')
      }
    }
    else {
      const res: any = await createPromptTag(
        dialogOptions.data as PromptTagDto,
      )

      if (res.code === 200) {
        ElMessage.success('修改成功！')
        dialogOptions.visible = false
        fetchData()
      }
      else {
        ElMessage.error(res.message ?? '修改失败！')
      }
    }

    dialogOptions.loading = false
  })
}

function resetForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  formEl.resetFields()
}
</script>

<template>
  <el-container class="CmsPromptTags">
    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="标题">
          <el-input v-model="formInline.name" minlength="4" placeholder="搜索模板标签名称" clearable />
        </el-form-item>

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button type="success" @click="handleDialog(null, 'new')">
            新建模板标签
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <el-table
          v-if="promptTags?.items" table-layout="auto" :data="promptTags.items" height="90%"
          style="width: 100%"
        >
          <el-table-column prop="id" label="编号" />
          <el-table-column label="图标">
            <template #default="{ row }">
              <div :class="row.icon" />
            </template>
          </el-table-column>
          <el-table-column label="颜色" width="200px">
            <template #default="{ row }">
              <div flex items-center>
                <div class="color-box" :style="`--c: ${row.color}`" />
                {{ row.color }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="标题">
            <template #default="{ row }">
              {{ row.name }}
            </template>
          </el-table-column>
          <el-table-column label="介绍">
            <template #default="{ row }">
              {{ row.description }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态">
            <template #default="{ row }">
              <template v-if="row.status === 0">
                <el-tag type="warning">
                  未启用
                </el-tag>
              </template>
              <el-tag v-else-if="row.status === 1" type="success">
                已启用
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最后更新">
            <template #default="{ row }">
              <PersonalNormalUser :data="row.updater" />
            </template>
          </el-table-column>
          <el-table-column label="创建者">
            <template #default="{ row }">
              <PersonalNormalUser :data="row.creator" />
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column fixed="right" label="操作" width="200">
            <template #default="{ row }">
              <el-button plain text size="small" @click="handleDialog(row, 'read')">
                详情
              </el-button>
              <el-button
                v-if="row.status !== 0" plain text size="small" type="warning"
                @click="handleDialog(row, 'edit')"
              >
                编辑
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="promptTags?.meta" v-model:current-page="promptTags.meta.currentPage"
          v-model:page-size="promptTags.meta.itemsPerPage" :disabled="formLoading"
          float-right my-4 :page-sizes="[15, 30, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
          :total="promptTags.meta.totalItems" @change="fetchData"
        />
      </ClientOnly>
    </el-main>

    <el-drawer v-model="dialogOptions.visible" size="50%" :close-on-click-modal="false" :close-on-press-escape="false">
      <template #header>
        <h4>
          <span v-if="dialogOptions.mode === 'new'">新建</span>
          <span v-else-if="dialogOptions.mode === 'edit'">编辑</span>
          <span v-else-if="dialogOptions.mode === 'read'">查看</span>模板标签信息<span v-if="dialogOptions.data" mx-4 op-50>#{{
            dialogOptions.data.id }}</span>
        </h4>
      </template>
      <template #default>
        <el-form
          v-if="dialogOptions.data" ref="ruleFormRef"
          :disabled="dialogOptions.loading || dialogOptions.mode === 'read'" style="max-width: 1280px"
          :model="dialogOptions.data" :rules="rules" label-width="auto" status-icon
        >
          <el-form-item label="标签标题" prop="name">
            <el-input v-model="dialogOptions.data.name" :maxlength="255" />
          </el-form-item>
          <el-form-item label="标签介绍" prop="description">
            <el-input
              v-model="dialogOptions.data.description" show-word-limit :maxlength="1024"
              :autosize="{ minRows: 5, maxRows: 30 }" type="textarea"
            />
          </el-form-item>
          <el-form-item label="标签颜色" prop="color">
            <el-color-picker v-model="dialogOptions.data.color!" show-alpha />
          </el-form-item>
          <el-form-item label="标签图标" prop="icon">
            <IconSelector v-model="dialogOptions.data.icon!" />
          </el-form-item>
          <el-form-item label="标签权重" prop="weight">
            <el-input v-model="dialogOptions.data.weight" />
          </el-form-item>
          <el-form-item label="父级标签" prop="parentTagId">
            <el-select v-model="dialogOptions.data.parentTagId!">
              <el-option v-for="item in promptTags.items" :key="item.id" :label="item.name" :value="item.id!" />
            </el-select>
          </el-form-item>
          <el-form-item label="标签状态">
            <el-radio-group v-model="dialogOptions.data.status!">
              <el-radio-button :value="0">
                禁用
              </el-radio-button>
              <el-radio-button :value="1">
                启用
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <div style="flex: auto">
          <template v-if="dialogOptions.mode === 'read'">
            <el-button @click="dialogOptions.visible = false">
              关闭
            </el-button>
          </template>
          <template v-else>
            <el-button @click="dialogOptions.visible = false">
              取消
            </el-button>
            <el-button @click="resetForm(ruleFormRef)">
              重置
            </el-button>
            <el-button :loading="dialogOptions.loading" type="primary" @click="submitForm(ruleFormRef)">
              {{ dialogOptions.mode === "new" ? "新增" : "修改" }}
            </el-button>
          </template>
        </div>
      </template>
    </el-drawer>
  </el-container>
</template>

<style lang="scss">
.CmsPromptTags {
  .color-box {
    position: relative;
    margin: 0 0.25rem;

    width: 12px;
    height: 12px;

    border-radius: 4px;
    background-color: var(--c);
  }
}
</style>
