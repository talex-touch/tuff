<script lang="ts" setup>
import { reactive } from 'vue'
import type { FormRules } from 'element-plus'
import { $endApi } from '~/composables/api/base'
import type { IRoleModel, IRoleModelQuery } from '~/composables/api/base/index.type'
import TemplateStandardCms from '~/components/template/StandardCms.vue'

definePageMeta({
  name: '角色管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = IRoleModel
const $dataApi = $endApi.v1.cms.role

const menus = ref()
const treeRef = ref()
const templateData = genCmsTemplateData<TemplateType, IRoleModelQuery, null>({
  getDeleteBoxTitle(id) {
    return ` 角色#${id} `
  },
  getEmptyModel: () => ({
    id: 0,
    name: '',
    value: '',
    order: '',
    status: 0,
    remark: '',
    menuIds: [],
    createdAt: '',
  }),
  onFetchSuccess: async () => {
    const res = await $endApi.v1.cms.menu.list()

    menus.value = res.data
  },
  transformSubmitData(originData) {
    const data = originData

    data.menuIds = [...(treeRef.value.getCheckedNodes(false, !false) ?? [])].map(item => item.id)

    delete data.menu

    return data
  },
  handleCrudDialog(data) {
    data.menuIds = data.menus.map((item: any) => item.id)
  },
  getList: $dataApi.list,
  create: $dataApi.create,
  update: $dataApi.update,
  delete: $dataApi.delete,
  getDeleteBoxTitles(ids: Array<number>): string {
    return ` 角色#${ids.join(',')} `
  },
}, {
  name: '',
  value: '',
  status: 0,
  remark: '',
})
const { list, listForm, fetchData } = templateData

onMounted(fetchData)

const rules = reactive<FormRules<TemplateType>>({
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { min: 5, max: 24, message: '角色名称需要在 5-24 位之间', trigger: 'blur' },
  ],
  value: [
    { required: true, message: '请输入角色值', trigger: 'blur' },
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' },
  ],
})

const menuListTreeProps = {
  children: 'children',
  label: 'name', // 更改为 label 以匹配 el-tree 的 prop
  id: 'id',
}
</script>

<template>
  <TemplateStandardCms identifier="role" :rules="rules" :list="list" :template-data="templateData" name="角色">
    <template #QueryForm>
      <el-form-item label="角色名称">
        <el-input v-model="listForm.name" placeholder="角色名称" clearable />
      </el-form-item>
      <el-form-item label="角色值">
        <el-input v-model="listForm.value" placeholder="角色值" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="listForm.status">
          <el-radio-button :value="0">
            否
          </el-radio-button>
          <el-radio-button :value="1">
            是
          </el-radio-button>
        </el-radio-group>
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
    </template>
    <template #CrudForm="{ data }">
      <div class="formItemInline">
        <el-form-item label="角色名称" inline>
          <el-input v-model="data.name" placeholder="请输入角色名称..." clearable />
        </el-form-item>

        <el-form-item label="角色值" inline>
          <!-- <el-select v-model="crudDialogOptions.data.value" placeholder="请输入角色值" clearable>
                <el-option label="admin" value="admin" />
                <el-option label="user" value="user" />
              </el-select> -->
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
      <el-form-item label="菜单权限">
        <el-tree
          ref="treeRef" :default-checked-keys="data.menuIds" :data="menus" show-checkbox
          node-key="id" :props="menuListTreeProps" check-strictly
        />
      </el-form-item>
    </template>
  </TemplateStandardCms>
</template>
