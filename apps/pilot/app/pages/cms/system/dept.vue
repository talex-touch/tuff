<script lang="ts" setup>
import type { FormRules } from 'element-plus'
import { reactive } from 'vue'

import { $endApi } from '~/composables/api/base'
import type { IDeptModel } from '~/composables/api/base/index.type'
import TemplateStandardCms from '~/components/template/StandardCms.vue'

definePageMeta({
  name: '部门管理',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = IDeptModel
const $dataApi = $endApi.v1.cms.dept

const templateData = genCmsTemplateSingleData<TemplateType, null>({
  getDeleteBoxTitle(id) {
    return ` 部门#${id} `
  },
  getEmptyModel: () => ({
    id: 0,
    name: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    creator: '',
    updater: '',
    orderNo: 0,
    children: [],
  }),
  onFetchSuccess: async () => {},
  transformSubmitData(originData) {
    return originData
  },
  getList: $dataApi.list,
  create: $dataApi.create,
  update: $dataApi.update,
  delete: $dataApi.delete,
}, {
  name: '',
})

const { list, listForm } = templateData

const rules = reactive<FormRules<TemplateType>>({
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { min: 5, max: 24, message: '角色名称需要在 5-24 位之间', trigger: 'blur' },
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' },
  ],
})
</script>

<template>
  <el-container class="CmsUser">
    <TemplateStandardCms identifier="dept" :rules="rules" :list="list!" :template-data="templateData" name="部门">
      <template #QueryForm>
        <el-form-item label="部门名称">
          <el-input v-model="listForm.name" placeholder="部门名称" clearable />
        </el-form-item>
      </template>
      <template #TableColumn>
        <el-table-column label="ID" prop="id" />
        <el-table-column label="名字" prop="name" />
        <el-table-column label="优先级" prop="orderNo" />
        <el-table-column label="更新者" prop="updater" />
        <el-table-column label="创建者" prop="creator" />
        <el-table-column label="创建日期" prop="createdAt" />
        <el-table-column label="修改日期" prop="updatedAt" />
      </template>
      <template #CrudForm="{ data }">
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="data.name" placeholder="请输入新建部门名称" />
        </el-form-item>

        <el-form-item label="上级部门" prop="parentId">
          <el-select v-model="data.parentId" placeholder="请选择上级部门">
            <el-option label="无上级部门" value="0" />
            <el-option v-for="item in list" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="排序" prop="orderNo">
          <el-input v-model="data.orderNo" placeholder="请输入排序" />
        </el-form-item>
      </template>
    </TemplateStandardCms>
  </el-container>
</template>

<style lang="scss"></style>
