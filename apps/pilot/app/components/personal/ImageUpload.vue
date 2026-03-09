<script setup lang="ts">
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { Plus } from '@element-plus/icons-vue'
import type { UploadProps } from 'element-plus'
import { globalOptions } from '~/constants'
import { $endApi } from '~/composables/api/base'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emits = defineEmits(['update:modelValue'])
// const cropper = new Cropper()
const file = ref()
const avatarForm = useVModel(props, 'modelValue', emits)

const avatarUrl = computed(() => {
  if (props.modelValue.startsWith('http'))
    return props.modelValue

  return `${globalOptions.getEndsUrl()}${avatarForm.value}`
})

// const handleAvatarSuccess: UploadProps['onSuccess'] = (
//   response,
//   _uploadFile,
// ) => {
//   avatarForm.value = response.data.filename
// }

// const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
//   if (props.disabled)
//     return false

//   // limit format
//   if (!/^image\/(png|jpe?g|gif)$/.test(rawFile.type)) {
//     ElMessage.error('上传头像图片只能是 JPG、JPEG、PNG、GIF 格式!')
//     return false
//   }

//   if (rawFile.size / 1024 / 1024 > 2) {
//     ElMessage.error('头像不得大于 2MB!')
//     return false
//   }

//   return true
// }

const cropImg = ref()
const previewBox = ref()
const previewBoxRound = ref()
const options = reactive({
  visible: false,
  loading: false,
})

const CROPPER = ref<any>()
async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input!.files
  if (files?.length !== 1) {
    return ElMessage({
      message: '无法选中多张图片来操作！',
      grouping: true,
      type: 'error',
      plain: true,
    })
  }

  options.loading = true

  await sleep(100)

  options.visible = true

  await sleep(800)

  const reader = new FileReader()
  reader.readAsDataURL(files[0])
  reader.onload = () => {
    const dataURL = reader.result

    cropImg.value.src = dataURL

    options.loading = false

    CROPPER.value = new Cropper(cropImg.value, {
      aspectRatio: 16 / 16,
      viewMode: 0,
      minContainerHeight: 64,
      minContainerWidth: 64,
      dragMode: 'move',
      preview: [previewBox.value, previewBoxRound.value],
    })
  }
}

watch(() => options.visible, (visible) => {
  if (!visible) {
    CROPPER.value?.destroy()

    file.value.value = ''
  }
})

function handleClick() {
  file.value?.click()
}

async function handleEditDone() {
  options.loading = true

  await sleep(500)

  CROPPER.value.getCroppedCanvas({
    maxWidth: 128,
    maxHeight: 128,
    fillColor: '#ffffff00',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toBlob(async (blob: any) => {
    const formData = new FormData()

    formData.append('file', blob, `${userStore.value.nickname}_avatar.png`)

    const res = await $endApi.v1.common.uploadCustom(formData)

    options.loading = false

    if (res.code === 200) {
      avatarForm.value = res.data.filename

      options.visible = false

      ElMessage({
        message: '上传成功！',
        grouping: true,
        type: 'success',
        plain: true,
      })
    }
    else {
      ElMessage({
        message: res.message || '上传失败！',
        grouping: true,
        type: 'error',
        plain: true,
      })
    }
  })
}
</script>

<template>
  <div :class="{ disabled }" class="ImageUpload" @click="handleClick">
    <input ref="file" :multiple="false" type="file" accept="image/*" hidden @change="handleUpload">

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
  </div>

  <DialogTouchDialog v-model="options.visible" header footer :loading="options.loading">
    <template #Title>
      <div i-carbon:web-services-task-definition-version />
      <span>裁剪图片</span>
    </template>
    <template #Footer>
      <el-button @click="options.visible = false">
        取消
      </el-button>
      <el-button type="success" @click="handleEditDone">
        完成编辑
      </el-button>
    </template>

    <div class="ImageUpload-Container">
      <div class="ImageUpload-Content">
        <div class="ImageUpload-ImgWrapper">
          <img ref="cropImg" class="cropImg">
        </div>

        <div class="ImageUpload-Toolbar">
          <span @click="CROPPER?.rotate(90)">
            <i i-carbon:rotate-clockwise-alt />
          </span>
          <span @click="CROPPER?.rotate(-90)">
            <i i-carbon:rotate-counterclockwise-alt />
          </span>
          <span @click="CROPPER?.reset()">
            <i i-carbon:reset />
          </span>
          <span @click="CROPPER?.zoom(0.1)">
            <i i-carbon:add />
          </span>
          <span @click="CROPPER?.zoom(-0.1)">
            <i i-carbon:subtract />
          </span>
        </div>
      </div>

      <div class="ImageUpload-Aside">
        <p>裁切预览</p>

        <div class="ImageUpload-AsideInner">
          <div ref="previewBox" class="previewBox" />
          <div ref="previewBoxRound" class="previewBoxRound" />
        </div>
      </div>
    </div>

    <div class="previewText" />
  </DialogTouchDialog>
</template>

<style lang="scss">
.ImageUpload-Container {
  .ImageUpload-Content {
    .ImageUpload-ImgWrapper {
      width: 420px;
      height: 420px;

      overflow: hidden;

      .mobile & {
        margin: 0 auto;

        width: 85vw;
        height: 85vw;
      }
    }
    position: relative;
    margin: 0 auto;
    padding: 1rem;
    flex: 1;

    .ImageUpload-Toolbar {
      span {
        i {
          display: block;
        }
        &:hover {
          color: var(--el-color-primary);
        }
        padding-right: 0.5rem;
        cursor: pointer;

        border-right: 1px solid var(--el-border-color);
        &:last-child {
          padding-right: 0;
          border-right: none;
        }
      }
      position: absolute;
      padding: 0 1rem;
      display: flex;

      align-items: center;
      justify-content: center;

      bottom: 0rem;

      gap: 0.5rem;
      left: 50%;
      width: max-content;

      height: 36px;
      border-radius: 16px;
      box-shadow: var(--el-box-shadow);
      background-color: var(--el-bg-color-page);

      transform: translate(-50%, 0);
    }
  }
  .ImageUpload-Aside {
    .ImageUpload-AsideInner {
      position: relative;

      width: 100%;

      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;

      .mobile & {
        flex-direction: row;
        justify-content: center;
      }
    }

    .previewBox,
    .previewBoxRound {
      box-shadow: 0 0 5px #adadad;
      width: 100px;
      height: 100px;
      margin-top: 30px;
      overflow: hidden;
      /*这个超出设置为隐藏很重要，否则就会整个显示出来了*/
    }

    .previewBoxRound {
      border-radius: 50%;
      /*设置为圆形*/
    }
    position: relative;
    padding: 1rem;
    width: 30%;

    border-left: 1px solid var(--el-border-color);
    .mobile & {
      margin: 0 auto;

      width: 100%;

      border-left: none;
    }
  }
  display: flex;

  gap: 1rem;
  width: 600px;
  height: 480px;

  .mobile & {
    width: 100%;
    max-height: 85vh;

    flex-wrap: wrap;
  }
}

.ImageUpload {
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

  cursor: pointer;
}
</style>
