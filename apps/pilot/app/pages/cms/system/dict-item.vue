<script lang="ts" setup>
import { reactive } from 'vue'
import type { FormRules } from 'element-plus'
import { $endApi } from '~/composables/api/base'
import type { IDictItemModel, IDictItemModelQuery } from '~/composables/api/base/index.type'
import TemplateStandardCms from '~/components/template/StandardCms.vue'

definePageMeta({
  name: `字典项管理`,
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = IDictItemModel
const $dataApi = $endApi.v1.cms.dictItem

const templateData = genCmsTemplateData<TemplateType, IDictItemModelQuery, null>({
  getDeleteBoxTitle(id) {
    return ` 字典项#${id} `
  },
  getEmptyModel: () => ({
    id: 0,
    label: '',
    value: '',
    order: '',
    typeId: 0,
    remark: '',
    menuIds: [],
    createdAt: '',
    type: {
      id: 0,
      name: '',
      code: '',
      remark: '',
      status: 0,
      order: '',
      createdAt: '',
      updatedAt: '',
      creator: '',
      updater: '',
    },
  }),
  onFetchSuccess: async () => {

  },
  transformSubmitData(originData) {
    return originData
  },
  getList: $dataApi.list,
  create: $dataApi.create,
  update: $dataApi.update,
  delete: $dataApi.delete,
}, {
  label: '',
  value: '',
  typeid: 1,
})
const { list, listForm, fetchData, handleCrudDialog, handleDeleteData } = templateData

onMounted(fetchData)

const rules = reactive<FormRules<TemplateType>>({
  name: [
    { required: true, message: '请输入字典项名称', trigger: 'blur' },
    { min: 5, max: 24, message: '角色名称需要在 5-24 位之间', trigger: 'blur' },
  ],
  value: [
    { required: true, message: '请输入角色值', trigger: 'blur' },
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' },
  ],
})
</script>

<template>
  <TemplateStandardCms :rules="rules" :list="list" :template-data="templateData" name="字典项">
    <template #QueryForm>
      <el-form-item label="字典项名称">
        <el-input v-model="listForm.label" placeholder="字典项名称" clearable />
      </el-form-item>
      <el-form-item label="字典项值">
        <el-input v-model="listForm.value" placeholder="字典项值" clearable />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="listForm.remark" placeholder="搜索备注" clearable />
      </el-form-item>
    </template>
    <template #TableColumn>
      <el-table-column width="100px" prop="id" label="序号" />
      <el-table-column prop="username" label="角色名称">
        <template #default="{ row }">
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column prop="value" label="角色值" />
      <el-table-column prop="status" label="状态">
        <template #default="scope">
          <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
            {{ scope.row.status === 1 ? "启用" : "禁用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" />
      <el-table-column prop="createdAt" label="创建时间">
        <template #default="scope">
          {{ formatDate(scope.row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间">
        <template #default="scope">
          {{ formatDate(scope.row.updatedAt) }}
        </template>
      </el-table-column>
      <el-table-column fixed="right" label="操作" width="200">
        <template #default="{ row }">
          <el-button plain text size="small" @click="handleCrudDialog(row, 'READ')">
            详情
          </el-button>
          <el-button plain text size="small" type="warning" @click="handleCrudDialog(row, 'EDIT')">
            编辑
          </el-button>
          <el-button plain text size="small" type="danger" @click="handleDeleteData(row.id)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </template>
    <template #CrudForm="{ data }">
      <div class="formItemInline">
        <el-form-item label="字典名称" inline>
          <el-input v-model="data.label" placeholder="请输入字典名称..." clearable />
        </el-form-item>

        <el-form-item label="字典值" inline>
          <el-input v-model="data.value" placeholder="请输入角色值..." clearable />
        </el-form-item>
      </div>

      <el-form-item label="状态">
        <el-radio-group v-model="data.status">
          <el-radio-button :value="0">
            已禁用
          </el-radio-button>
          <el-radio-button :value="1">
            未禁用
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="data.remark" :rows="2" type="textarea" placeholder="请输入备注..." />
      </el-form-item>
    </template>
  </TemplateStandardCms>
</template>
