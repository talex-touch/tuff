<script lang="ts" setup>

import type { FormRules } from 'element-plus'

import { $endApi } from '~/composables/api/base';

import type { IStorageModel, IStorageModelQuery } from '~/composables/api/base/v1/tools.type';

definePageMeta({
  name: '存储管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})
type TemplateType = IStorageModel
const $dataApi = $endApi.v1.tools.storage

const templateData = genCmsTemplateData<TemplateType, IStorageModelQuery, null>({
  getDeleteBoxTitles(ids) {
    return ` 存储设置#${ids} `;
  },
  getEmptyModel: () => ({
    id: 0,
    name: '',
    extName: '',
    path: '',
    type: '',
    size: '',
    createdAt: '',
    username: '',
    time: [],
  }),
  onFetchSuccess: async () => {
  },

  transformSubmitData(originData) {
    const data = originData;
    return data;
  },
  getList: $dataApi.list,
  deletes: $dataApi.del,
  getDeleteBoxTitle: function (id: string | number): string {
   return ` 存储设置#${id} `;
  }
}, {

  /**
   * 文件后缀
   */
  extName: "",
  /**
   * 文件名
   */
  name: "",
  /**
   * 大小
   */
  size: "",
  /**
   * 上传时间
   */
  time: [],
  /**
   * 文件类型
   */
  type: "",
  /**
   * 上传者
   */
  username: "",
  field: ""
})


const { list, listForm, fetchData, handleCrudDialog, handleDeleteData, handleDeleteDatas } = templateData

onMounted(fetchData)

const rules = reactive<FormRules<TemplateType>>({
  id: [
    { required: true, message: '请输入参数名称', trigger: 'blur' },
  ]
})

const storageTimeText = computed({
  get: () => Array.isArray(listForm.time) ? listForm.time.join(',') : '',
  set: (value: string) => {
    listForm.time = value
      ? value.split(',').map(item => item.trim()).filter(Boolean)
      : []
  },
})




function sizeToNum(s: string) {
  s.replace(/[^0-9.]/g, '')

  return parseFloat(s)

}

import { globalOptions } from '~/constants'
function ImgPath(url: string) {


  console.log(globalOptions.getEndsUrl() + url)
  return globalOptions.getEndsUrl() + url
}


const tableData = computed(() => Array.isArray(list.value) ? list.value : list.value.items)


const multipleSelection = ref<IStorageModel[]>([])


let ids: number[] = []
const handleSelectionChange = (val: IStorageModel[]) => {
  multipleSelection.value = val
  ids = multipleSelection.value.map((item) => {
    return item.id
  })
 


}

</script>

<template>

  <TemplateStandardCms :crud-controller="CurdController.REVIEW" :rules="rules" :list="list"
    :template-data="templateData" name="存储配置项">

    <template #QueryFormDel>
      <el-button type="danger" @click="handleDeleteDatas(ids)">
        删除
      </el-button>
    </template>
    <template #QueryForm>

      <el-form-item label="文件名">
        <el-input v-model="listForm.name" placeholder="文件名" clearable />
      </el-form-item>
      <el-form-item label="文件后缀">
        <el-input v-model="listForm.extName" placeholder="文件后缀" clearable />
      </el-form-item>
      <el-form-item label="文件类型">
        <el-input v-model="listForm.type" placeholder="文件类型" clearable />
      </el-form-item>
      <el-form-item label="大小">
        <el-input v-model="listForm.size" placeholder="大小" clearable />
      </el-form-item>
      <el-form-item label="上传时间">
        <el-input v-model="storageTimeText" placeholder="上传时间" clearable />
      </el-form-item>
      <el-form-item label="上传者">
        <el-input v-model="listForm.username" placeholder="上传者" clearable />
      </el-form-item>

    </template>
    <template #Table>

      <el-table v-if="tableData" table-layout="auto" :data="tableData" style="width: 100%;"
        @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="name" label="文件名">
          <template #default="{ row }">
            {{ row.name }}
          </template>
        </el-table-column>
        <el-table-column prop="name" width="500px" label="预览图">
          <template #default="{ row }">
            <el-image :src="ImgPath(row.path)" fit="contain">
              <template #placeholder>
                <div class="image-slot">Loading<span class="dot">...</span></div>
              </template>
            </el-image>
          </template>
        </el-table-column>
        <el-table-column prop="extName" label="文件后缀" />
        <el-table-column prop="type" label="类别" />
        <el-table-column prop="size" label="大小">
          <template #default="scope">
            <el-tag :type="sizeToNum(scope.row.size) <= 1024 ? 'success' : 'danger'">
              {{ scope.row.size }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="上传者" />
        <el-table-column prop="createdAt" label="创建时间">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>

      </el-table>



    </template>
    <!-- <template #CrudForm="{ data }">


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

    </template> -->
  </TemplateStandardCms>




</template>

<style lang="scss"></style>
