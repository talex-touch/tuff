<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'
import type { UploadProps } from 'element-plus'
import { globalOptions } from '~/constants'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emits = defineEmits(['update:modelValue'])

const avatarForm = useVModel(props, 'modelValue', emits)

const avatarUrl = computed(() => {
  if (props.modelValue.startsWith('http'))
    return props.modelValue

  return `${globalOptions.getEndsUrl()}${avatarForm.value}`
})

const handleAvatarSuccess: UploadProps['onSuccess'] = (
  response,
  _uploadFile,
) => {
  avatarForm.value = response.data.filename
}

const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (props.disabled)
    return false

  // limit format
  if (!/^image\/(png|jpe?g|gif)$/.test(rawFile.type)) {
    ElMessage({
      message: '上传头像图片只能是 JPG、JPEG、PNG、GIF 格式！',
      grouping: true,
      type: 'error',
      plain: true,
    })
    return false
  }

  if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage({
      message: '头像不得大于 2MB！',
      grouping: true,
      type: 'error',
      plain: true,
    })
    return false
  }

  return true
}

const headers = {
  Authorization: `Bearer ${userStore.value.token?.accessToken}`,
}
</script>

<template>
  <el-upload
    :class="{ disabled }"
    class="UserUploadAvatar" :action="`${globalOptions.getEndsUrl()}api/tools/upload`" :show-file-list="false"
    :on-success="handleAvatarSuccess" :before-upload="beforeAvatarUpload" :headers="headers"
  >
    <template v-if="avatarForm">
      <img :src="avatarUrl" class="avatar">
      <div class="edit-mask">
        <div i-carbon-edit />
      </div>

      <div v-if="!disabled" class="delete-float" @click.stop="avatarForm = ''">
        <div i-carbon-trash-can />
      </div>
    </template>
    <template v-else>
      <div class="upload-empty">
        <div i-carbon-add />
      </div>
    </template>
  </el-upload>
</template>

<style lang="scss">
.UserUploadAvatar {
  &.disabled {
    opacity: 0.75;
    cursor: not-allowed;
    pointer-events: none;
  }

  .upload-empty {
    &:hover {
      color: #fff;

      background-color: var(--el-text-color-disabled);
    }

    display: flex;

    width: 64px;
    height: 64px;

    font-size: 24px;

    align-items: center;
    justify-content: center;

    border-radius: 50%;
    border: 1px dashed var(--el-border-color);
  }

  .delete-float {
    position: absolute;
    display: flex;

    right: 0;
    bottom: 0;

    width: 24px;
    height: 24px;

    color: var(--el-color-danger);
    font-weight: 600;
    font-size: 14px;
    align-items: center;
    justify-content: center;

    border-radius: 50%;
    box-shadow: var(--el-box-shadow);
    background-color: var(--el-bg-color);
  }

  .edit-mask {
    position: absolute;
    display: flex;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    color: #fff;
    font-weight: 600;
    font-size: 18px;
    align-items: center;
    justify-content: center;

    opacity: 0;
    transition: 0.25s;
    pointer-events: none;
    border-radius: 50%;
    background-color: var(--el-overlay-color-lighter);
  }

  &:hover {
    .edit-mask {
      opacity: 1;

      pointer-events: unset;
    }
  }

  img,
  .el-upload {
    width: 100%;
    height: 100%;

    border-radius: 50%;
  }

  width: 64px;
  height: 64px;

  position: relative;
}
</style>
