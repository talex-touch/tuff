<script lang="ts" setup>

import type { FormRules } from 'element-plus'

import { $endApi } from '~/composables/api/base';
import type { ITasksModel, ITasksModelQuery } from '~/composables/api/base/v1/cms.type';




definePageMeta({
  name: '任务调度',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})
type TemplateType = ITasksModel
const $dataApi = $endApi.v1.cms.Tasks

const templateData = genCmsTemplateData<TemplateType, ITasksModelQuery, null>({
  getDeleteBoxTitle(id) {
    return ` 任务调度#${id} `
  },
  getEmptyModel: () => ({
    name: "",
    service: "",
    type: 0,
    status: 0,
    startTime: "",
    endTime: "",
    limit: 0,
    cron: "",
    every: 0,
    data: "",
    jobOpts: "",
    remark: "",
    id: 0,
    createdAt: "",
    updatedAt: ""
  }),
  onFetchSuccess: async () => {

  },
  transformSubmitData(originData) {
    const data = originData



    return data
  },
  getList: $dataApi.list,
  create: $dataApi.create,
  update: $dataApi.update,
  delete: $dataApi.delete,
}, {
  name: '',
  service: "",
  type: 0,
  status: 0,
  startTime: "",
  endTime: "",
  limit: 0,
  cron: "",
  every: 0,
  data: "",
  remark: ""
})
const { list, listForm, fetchData, handleCrudDialog, handleDeleteData } = templateData



onMounted(fetchData)

const rules = reactive<FormRules<TemplateType>>({
  name: [
    { required: true, message: '请输入任务名称', trigger: 'blur' },

  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' },
  ],
})


const typeOptions = [
  { label: 'cron', value: 0 },
  { label: 'interval', value: 1 },
]

</script>

<template>

  <TemplateStandardCms :rules="rules" :list="list" :template-data="templateData" name="任务调度">
    <template #QueryForm>
      <el-form-item label="任务名称">
        <el-input v-model="listForm.name" placeholder="任务名称" clearable />
      </el-form-item>
      <el-form-item label="调用的服务">
        <el-input v-model="listForm.service" placeholder="调用的服务服务" clearable />
      </el-form-item>
      <el-form-item label="任务类别">
        <el-select v-model="listForm.type" placeholder="任务类别" size="large" style="width: 100px" clearable>
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="任务状态">
        <el-radio-group v-model="listForm.status">
          <el-radio-button :value="0">
            否
          </el-radio-button>
          <el-radio-button :value="1">
            是
          </el-radio-button>
        </el-radio-group>
      </el-form-item>


      <el-form-item label="cron表达式">
        <el-input v-model="listForm.cron" placeholder="限制执行次数，负数则无限制" clearable />
      </el-form-item>
      <el-form-item label="限制执行次数">
        <el-input v-model="listForm.limit" placeholder="限制执行次数，负数则无限制" clearable />
      </el-form-item>

      <el-form-item label="执行间隔">
        <el-input v-model="listForm.every" placeholder="限制执行次数，负数则无限制" clearable />
      </el-form-item>
      <el-form-item label="执行参数">
        <el-input v-model="listForm.data" placeholder="限制执行次数，负数则无限制" clearable />
      </el-form-item>
      <el-form-item label="任务备注">
        <el-input v-model="listForm.remark" placeholder="任务备注" clearable />
      </el-form-item>
      <el-form-item label="开始时间">
        <el-input v-model="listForm.startTime" placeholder="开始时间" clearable />
      </el-form-item>
      <el-form-item label="结束时间">
        <el-input v-model="listForm.endTime" placeholder="结束时间" clearable />
      </el-form-item>



    </template>
    <template #TableColumn>
      <el-table-column prop="id" label="ID" />
      <el-table-column prop="name" label="任务名称" />
      <el-table-column prop="service" label="服务路径" />

      <el-table-column prop="type" label="种类" />

      <el-table-column prop="status" label="状态">
        <template #default="scope">
          <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
            {{ scope.row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="limit" label="执行次数" />
      <el-table-column prop="cron" label="定时" />
      <el-table-column prop="every" label="every" />
      <el-table-column prop="data" label="数据" />
      <el-table-column prop="jobOpts" label="jobOpts" />

      <el-table-column prop="remark" label="备注" />

      <el-table-column prop="startTime" label="开始时间">
        <template #default="scope">
          {{ formatDate(scope.row.startTime) }}
        </template>
      </el-table-column>
      <el-table-column prop="endTime" label="结束时间">
        <template #default="scope">
          {{ formatDate(scope.row.endTime) }}
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间">
        <template #default="scope">
          {{ formatDate(scope.row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更改时间">
        <template #default="scope">
          {{ formatDate(scope.row.updatedAt) }}
        </template>
      </el-table-column>
    </template>
    <template #CrudForm="{ data }">

      <el-form-item prop="name" label="任务名称">
        <el-input v-model="data.name" placeholder="任务名称" clearable />
      </el-form-item>
      <el-form-item prop="service" label="服务路径">
        <el-input v-model="data.service" placeholder="服务路径" clearable />
      </el-form-item>

      <el-form-item prop="type" label="种类">
        <el-select v-model="data.type" placeholder="种类">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>


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


      <el-form-item prop="limit" label="执行次数">
        <el-input v-model="data.limit" placeholder="执行次数" clearable />
      </el-form-item>
      <el-form-item prop="cron" label="定时">
        <el-input v-model="data.cron" placeholder="请输入Cron表达式" clearable />
      </el-form-item>
      <el-form-item prop="every" label="every">
        <el-input v-model="data.every" placeholder="every" clearable />
      </el-form-item>
      <el-form-item prop="data" label="data">
        <el-input v-model="data.data" placeholder="data" clearable />
      </el-form-item>

      <el-form-item prop="remark" label="备注">
        <el-input v-model="data.remark" placeholder="备注" clearable />
      </el-form-item>


    </template>
  </TemplateStandardCms>



</template>

<style lang="scss"></style>
