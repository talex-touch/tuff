<script lang="ts" setup>
import type { FormRules } from 'element-plus'

import { $endApi } from '~/composables/api/base'
import type { IParamConfigModel, IParamConfigModelQuery } from '~/composables/api/base/index.type'

definePageMeta({
  name: '参数配置',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = IParamConfigModel
const $dataApi = $endApi.v1.cms.paramConfig

const templateData = genCmsTemplateData<TemplateType, IParamConfigModelQuery, null>({
  getDeleteBoxTitle(id) {
    return ` 参数配置#${id} `
  },
  getEmptyModel: () => ({

    key: '',
    value: '',
    name: '',
    remark: '',
    id: 0,
    createdAt: '',
    updatedAt: '',
  }),
  onFetchSuccess: async () => {

  },
  transformSubmitData(originData) {
    const data = originData

    // data.menuIds = treeRef.value.getCheckedNodes() ?? []

    return data
  },
  getList: $dataApi.list,
  create: $dataApi.create,
  update: $dataApi.update,
  delete: $dataApi.delete,
}, {
  name: '',
  order: '',
  updatedAt: '',
  createdAt: '',
})

const { list, listForm, fetchData, handleCrudDialog, handleDeleteData } = templateData

onMounted(fetchData)

const rules = reactive<FormRules<TemplateType>>({
  id: [
    { required: true, message: '请输入参数名称', trigger: 'blur' },
  ],
})
</script>

<template>
  <TemplateStandardCms :rules="rules" :list="list" :template-data="templateData" name="参数配置项">
    <template #QueryForm>
      <el-form-item label="参数名称">
        <el-input v-model="listForm.name" placeholder="参数名称" clearable />
      </el-form-item>
    </template>
    <template #TableColumn>
      <el-table-column width="100px" prop="id" label="序号" />
      <el-table-column prop="name" label="参数名称">
        <template #default="{ row }">
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column prop="key" label="key" />
      <el-table-column prop="key" label="value" />
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
    </template>
    <template #CrudForm="{ data }">
      <el-form-item prop="name" label="参数名称">
        <el-input v-model="data.name" />
      </el-form-item>

      <el-form-item prop="key" label="Key">
        <el-input v-model="data.key" />
      </el-form-item>

      <el-form-item prop="value" label="Value">
        <el-input v-model="data.value" />
      </el-form-item>

      <el-form-item prop="remark" label="备注">
        <el-input v-model="data.remark" />
      </el-form-item>
    </template>
  </TemplateStandardCms>
</template>

<style lang="scss"></style>
