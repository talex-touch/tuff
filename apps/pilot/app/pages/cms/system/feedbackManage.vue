<script lang="ts" setup>
import { $endApi } from '~/composables/api/base'
import type { IFeedbackModel, IFeedbackModelQuery, IRoleModel, IRoleModelQuery } from '~/composables/api/base/index.type'
import TemplateStandardCms from '~/components/template/StandardCms.vue'

definePageMeta({
  name: '反馈管理界面',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = IFeedbackModel
const $dataApi = $endApi.v1.cms.feedback

const templateData = genCmsTemplateData<TemplateType, IFeedbackModelQuery, null>(
  {
    getDeleteBoxTitle(id) {
      return ` 反馈管理#${id} `
    },
    getEmptyModel: () => ({
      user: {},
      feedID: '',
      rating: 1,
      type: '',
      lack: '',
      Suggestion: '',
      id: 0,
      createdAt: '',
      updatedAt: '',
    }),
    onFetchSuccess: async () => {},

    handleCrudDialog() {
      // data.menuIds = data.menus.map((item: any) => item.id)
    },
    create: $dataApi.create,
    getList: $dataApi.list,
    update: $dataApi.update,
    delete: $dataApi.delete,
    getDeleteBoxTitles(ids: Array<number>): string {
      return ` 反馈管理#${ids.join(',')} `
    },
  },
  {}
)
const { list, listForm, fetchData } = templateData

onMounted(fetchData)

// const rules = reactive<FormRules<TemplateType>>({
//   name: [
//     { required: true, message: '请输入角色名称', trigger: 'blur' },
//     { min: 5, max: 24, message: '角色名称需要在 5-24 位之间', trigger: 'blur' },
//   ],
//   value: [
//     { required: true, message: '请输入角色值', trigger: 'blur' },
//   ],
//   status: [
//     { required: true, message: '请选择状态', trigger: 'blur' },
//   ],
// })
</script>

<template>
  <TemplateStandardCms identifier="role" :list="list" :template-data="templateData" name="反馈">
    <template #QueryForm>
      <!-- <el-form-item label="角色名称">
        <el-input v-model="listForm." placeholder="角色名称" clearable />
      </el-form-item> -->
    </template>
    <template #TableColumn>
      <el-table-column width="100px" type="index" label="序号" />
      <el-table-column prop="user" label="反馈人">
        <template #default="{ row }">
          {{ row.user?.nickname || '未知' }}
        </template>
      </el-table-column>

      <el-table-column prop="user" label="邮箱">
        <template #default="{ row }">
          {{ row.user?.email || '未知' }}
        </template>
      </el-table-column>

      <el-table-column prop="feedId" label="反馈单号" />

      <el-table-column prop="rating" label="整体评价" />
      <el-table-column prop="type" label="比较满意类型" />
      <el-table-column prop="lack" label="仍不满足" />
      <el-table-column prop="suggestion" label="我的建议" />

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
      <div class="formItemInline">
        <el-form-item label="反馈人" inline>
          <el-input v-model="data.user.nickname" placeholder="请输入整体评价..." clearable disabled />
        </el-form-item>
        <el-form-item label="整体评价" inline>
          <el-input v-model="data.rating" placeholder="请输入整体评价..." clearable disabled />
        </el-form-item>

        <el-form-item label="比较满意类型" inline>
          <el-input v-model="data.type" placeholder="请输入满意类型..." clearable />
        </el-form-item>

        <el-form-item label="仍然不足" inline>
          <el-input v-model="data.lack" placeholder="请输入仍然不足..." clearable disabled />
        </el-form-item>

        <el-form-item label="我的建议" inline>
          <el-input v-model="data.suggestion" placeholder="请输入反馈建议..." clearable disabled />
        </el-form-item>
      </div>
    </template>
  </TemplateStandardCms>
</template>
