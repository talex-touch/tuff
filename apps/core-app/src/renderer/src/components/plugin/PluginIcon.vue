<script lang="ts" name="PluginIcon" setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { forTouchTip } from '~/modules/mention/dialog-mention'

const props = defineProps<{
  icon:
    | {
        type: string
        value: string | Buffer
        _value: string
      }
    | string
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
  console.log("parse", props)

  imageLoading.value = false
  imageError.value = false

  if (typeof props.icon === 'object' && props.icon !== null) {
    if (props.icon.type === 'dataurl' && props.icon.value) {
      imageLoading.value = true
      return (iconOptions.value = {
        type: 'url',
        value: props.icon.value as string
      })
    }

    if (props.icon.type === 'file' && props.icon.value) {
      try {
        const uint8Array = new Uint8Array(props.icon.value as Buffer)
        const base64 = btoa(String.fromCharCode(...uint8Array))
        const dataUrl = `data:image/png;base64,${base64}`
        imageLoading.value = true
        return (iconOptions.value = {
          type: 'url',
          value: dataUrl
        })
      } catch (error) {
        console.error(`[PluginIcon] Failed to convert buffer to data URL:`, error)
        return (iconOptions.value = {
          type: 'html',
          value: props.icon._value?.charAt(0) || '?'
        })
      }
    }
  }

  if (typeof props.icon === 'string') {
    const iconPath = props.icon

    if (iconPath.startsWith('image://')) {
      const filePath = iconPath.replace('image://', 'atom:///')
      imageLoading.value = true
      return (iconOptions.value = {
        type: 'url',
        value: filePath
      })
    }

    imageLoading.value = true
    return (iconOptions.value = {
      type: 'url',
      value: iconPath
    })
  }

  const { type, value, _value } = props.icon

  if (_value === 'error') {
    forTouchTip('Error', 'Plugin icon parse error.', [
      { content: 'Sure', type: 'error', onClick: async () => true }
    ])
    return (iconOptions.value = {
      type: 'html',
      value: `<svg xmlns="http://www.w3.org/2000/svg" style="color: red" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/></svg>`
    })
  }

  if (type === 'remix') {
    return (iconOptions.value = {
      type: 'remix',
      value: value as string
    })
  }

  if (type === 'class') {
    return (iconOptions.value = {
      type: 'class',
      value: value as string
    })
  }

  if (type !== 'file') {
    return console.error('PluginIcon not matched --- type not exist.', props)
  }

  if (!_value) {
    return console.error('PluginIcon not matched --- _value not exist.', props)
  }

  const extName = _value.split('.').pop()
  if (extName === 'svg') {
    const htmlData = transformUint8ArrayToString(new Uint8Array(value as Buffer))
    return (iconOptions.value = {
      type: 'html',
      value: htmlData
    })
  }

  const dataStr = transformArrayBufferToBase64(value as Buffer)
  imageLoading.value = true
  return (iconOptions.value = {
    type: 'base64',
    value: `data:image/${extName};base64,${dataStr}`
  })
}

function transformUint8ArrayToString(fileData: Uint8Array) {
  var dataString = ''
  for (var i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i])
  }

  return dataString
}

function transformArrayBufferToBase64(buffer: Buffer) {
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
  <span v-if="iconOptions" role="img" class="PluginIcon-Container">
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
