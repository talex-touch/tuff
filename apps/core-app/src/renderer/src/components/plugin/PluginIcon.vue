<script lang="ts" name="PluginIcon" setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { IPluginIcon } from '@talex-touch/utils'
import { forTouchTip } from '~/modules/mention/dialog-mention'

const props = defineProps<{
  icon: IPluginIcon | string
  alt: string
}>()

interface IIconOption {
  type: 'remix' | 'class' | 'dataurl' | 'base64' | 'html' | 'url'
  value: string
}

const iconOptions = ref<IIconOption>()
const imageLoading = ref(false)
const imageError = ref(false)

function handleImageLoad() {
  imageLoading.value = false
  imageError.value = false
}

function handleImageError() {
  imageLoading.value = false
  imageError.value = true
}

function handleParse() {
  if (!props.icon) {
    handleImageError()
    return
  }

  imageLoading.value = false
  imageError.value = false

  // String handler
  if (typeof props.icon === 'string') {
    const iconPath = props.icon
    let value = iconPath.startsWith('image://')
      ? iconPath.replace('image://', 'atom:///')
      : iconPath

    imageLoading.value = true
    iconOptions.value = {
      type: 'url',
      value
    }
    return
  }

  // Object handler
  const { type, value, _value } = props.icon

  if (_value === 'error') {
    forTouchTip('Error', 'Plugin icon parse error.', [
      { content: 'Sure', type: 'error', onClick: async () => true }
    ])
    iconOptions.value = {
      type: 'html',
      value: `<svg xmlns="http://www.w3.org/2000/svg" style="color: red" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/></svg>`
    }
    return
  }

  switch (type) {
    case 'remix':
    case 'class':
      iconOptions.value = { type, value: value as string }
      break
    case 'dataurl':
      imageLoading.value = true
      iconOptions.value = { type: 'url', value: value as string }
      break
    case 'file':
      handleFileIcon(props.icon)
      break
    default:
      console.error('PluginIcon not matched --- type not exist.', props)
  }
}

function handleFileIcon(icon: IPluginIcon): void {
  const { value, _value } = icon
  if (!_value) {
    console.error('PluginIcon not matched --- _value not exist.', icon)
    return
  }

  const extName = _value.split('.').pop()
  if (extName === 'svg') {
    const htmlData = transformUint8ArrayToString(new Uint8Array(value as Buffer))
    iconOptions.value = {
      type: 'html',
      value: htmlData
    }
  } else {
    const dataStr = transformArrayBufferToBase64(value as Buffer)
    imageLoading.value = true
    iconOptions.value = {
      type: 'base64',
      value: `data:image/${extName};base64,${dataStr}`
    }
  }
}

function transformUint8ArrayToString(fileData: Uint8Array): string {
  var dataString = ''
  for (var i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i])
  }

  return dataString
}

function transformArrayBufferToBase64(buffer: Buffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let len = bytes.byteLength, i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

watchEffect(handleParse)
</script>

<template>
  <span v-if="iconOptions" :title="alt" role="img" class="PluginIcon-Container">
    <remix-icon v-if="iconOptions.type === 'remix'" :name="iconOptions.value" />
    <div v-else-if="iconOptions.type === 'class'" :class="iconOptions.value" />
    <span v-else-if="iconOptions.type === 'html'" class="html" v-html="iconOptions.value" />
    <template v-else-if="iconOptions.type === 'base64' || iconOptions.type === 'url'">
      <div v-if="imageLoading" class="PluginIcon-Skeleton">
        <div class="skeleton-shimmer"></div>
      </div>
      <div v-else-if="imageError" class="PluginIcon-Error">
        <i class="i-ri-image-line" />
      </div>
      <img
        :alt="alt"
        :src="iconOptions.value"
        :style="{ display: imageLoading ? 'none' : 'block' }"
        @load="handleImageLoad"
        @error="handleImageError"
      />
    </template>
  </span>
</template>

<style lang="scss" scoped>
.PluginIcon-Container {
  position: relative;

  width: 100%;
  height: 100%;

  .html {
    display: flex;

    align-items: center;
    justify-content: center;

    color: currentColor;
  }

  img {
    width: 100%;
    height: 100%;
    border-radius: 4px;
  }

  .PluginIcon-Skeleton {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: var(--el-fill-color-lighter);
    position: relative;
    overflow: hidden;

    .skeleton-shimmer {
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
      animation: shimmer 1.5s infinite;
    }
  }

  .PluginIcon-Error {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    background: var(--el-fill-color-lighter);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);

    i {
      font-size: 1.2rem;
    }
  }

  :deep(.remix) {
    width: 1em;
    height: 1em;
  }
}

@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}
</style>
