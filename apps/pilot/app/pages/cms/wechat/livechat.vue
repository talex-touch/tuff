<script lang="ts" setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { UploadProps } from 'element-plus'
import type { ILivechat, ILivechatQuery } from '~/composables/api/base/v1/wechat.type'
import { $endApi } from '~/composables/api/base'
import { globalOptions } from '~/constants'

definePageMeta({
  name: '客服管理',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})
type TemplateType = ILivechat
const $dataApi = $endApi.v1.wechat.Livechat

const templateData = genCmsTemplateData<TemplateType, ILivechatQuery, null>(
  {
    getDeleteBoxTitle(id) {
      return ` 客服管理#${id} `
    },
    getEmptyModel: () => ({
      id: 0,
      name: '',
      phone: 1,
      qrcode: '',
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
      return ` 客服管理#${ids.join(',')} `
    },
  },
  {}
)
const { list, listForm, fetchData } = templateData
onMounted(fetchData)
const listform1 = toRefs(listForm);

//上传图片
function getUploadUrl(data:any) {
  data.qrcode =url.value
  return `${globalOptions.getEndsUrl()}api/tools/upload`
}

const imageUrl = ref('')

//中转回传图片url
const url = ref('')

const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
  imageUrl.value = URL.createObjectURL(uploadFile.raw!)
  console.log('uploadFile', uploadFile)
  ElMessage.success('上传成功')
  //上传图片的url赋值给上传表单
  url.value = response.data.filename

}

const headers = {
  Authorization: `Bearer ${userStore.value.token?.accessToken}`,
}

const handleBeforeUpload: UploadProps['beforeUpload'] = (file) => {
  if (file.size / 1024 / 1024 > 2) {
    ElMessage.error('Avatar picture size can not exceed 2MB!')
    return false
  }
  return true
}
</script>

<template>
  <TemplateStandardCms identifier="role" :list="list" :template-data="templateData" name="客服">
    <template #QueryForm>
      <el-form-item label="客服名称">
        <el-input v-model="listForm.name" placeholder="客服名称" clearable />
      </el-form-item>

      <el-form-item label="客服电话">
        <el-input v-model="listForm.phone" placeholder="客服名称" clearable />
      </el-form-item>
    </template>
    <template #TableColumn>
      <el-table-column width="100px" type="index" label="序号" />
      <el-table-column prop="name" label="客服名称">
        <template #default="{ row }">
          {{ row.name }}
        </template>
      </el-table-column>

      <el-table-column prop="phone" label="反馈单号" />

      <el-table-column prop="qrcode" label="二维码">
        <template #default="{ row }">
 
          <img :src="`${globalOptions.getEndsUrl()}` + row.qrcode" alt="二维码" width="50px" height="50px" />
        </template>
      </el-table-column>

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
        <el-form-item label="客服名称" inline>
          <el-input v-model="data.name" placeholder="请输入客服名称..." clearable />
        </el-form-item>

        <el-form-item label="电话" inline>
          <el-input v-model="data.phone" placeholder="请输入电话..." clearable />
        </el-form-item>

        <el-form-item label="二维码" inline>
          <el-upload class="avatar-uploader" :headers="headers"      :action="getUploadUrl(data)" :show-file-list="false" :on-success="handleAvatarSuccess" :before-upload="handleBeforeUpload">
            <img v-if="imageUrl" :src="imageUrl" class="avatar"  />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
        </el-form-item>
      </div>
    </template>
  </TemplateStandardCms>
</template>

<style>
.avatar-uploader .el-upload {
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: var(--el-transition-duration-fast);
}

.avatar-uploader .el-upload:hover {
  border-color: var(--el-color-primary);
}

.el-icon.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 178px;
  height: 178px;
  text-align: center;
}
</style>
