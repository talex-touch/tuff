<!--
  TouchCaptcha Component

  A captcha component that requires users to rotate an image to match a target.
-->
<template>
  <!-- Main container with dynamic success class -->
  <div
    :class="{ success: options.success }"
    class="TouchCaptcha-Container fake-background"
    role="dialog"
    aria-modal="true"
    aria-labelledby="captcha-title"
  >
    <!-- Progress bar showing loading, success, or error states -->
    <ProgressBar
      :message="options.message"
      :success="options.success"
      :error="options.error"
      :loading="options.loading"
    />

    <!-- Captcha title -->
    <h2 id="captcha-title" class="TouchCaptcha-Title">
      {{ $t('base.touchCaptcha') }}
    </h2>

    <!-- Instructions for the user -->
    <span>旋转滑块以匹配图像</span>

    <!-- Captcha content area with image -->
    <div
      ref="content"
      :class="{
        loading: options.loading,
        error: options.error,
        success: options.success
      }"
      class="TouchCaptcha-Content"
    >
      <!-- Captcha image container -->
      <div class="TouchCaptcha-Image">
        <img alt="Captcha image to match" :src="options.img.image" />
      </div>
    </div>

    <!-- Slider control for rotating the image -->
    <div
      :class="{ loading: options.loading || options.error || options.success }"
      class="TouchCaptcha-Slider"
      role="region"
      aria-label="Image rotation control"
    >
      <el-slider
        v-model="options.img.style.transform.rotate"
        :min="90"
        :max="270"
        :show-tooltip="false"
        aria-label="Rotate image to match target"
        role="slider"
        @change="validateCaptcha"
      >
      </el-slider>
    </div>
  </div>
</template>

<!--
  TouchCaptcha Component Script

  Handles the logic for the touch captcha including image generation, validation, and UI states.
-->
<script lang="ts" name="TouchCaptcha" setup>
import { get, post } from '~/base/axios'
// import { $t } from "@modules/lang";
import ProgressBar from '@comp/base/ProgressBar.vue'
import { nextTick, reactive, ref, watch } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'

/**
 * Component props interface
 */
interface Props {
  /** Function to call when captcha is successfully validated */
  func: (data: any) => void
}

/**
 * Component props with default values
 */
const props = withDefaults(defineProps<Props>(), {
  func: () => {}
})

/**
 * Interface for image style
 */
interface ImageStyle {
  transform: {
    rotate: number
    scale: number
    x: string
    y: string
  }
  opacity?: string
}

/**
 * Interface for captcha data
 */
interface CaptchaData {
  id: string
  image: {
    data: ArrayBuffer
  }
}

/**
 * Component state options
 */
const options = reactive({
  loading: false,
  img: {
    image: '',
    style: {
      transform: {
        rotate: 90,
        scale: 0,
        x: '0',
        y: '0'
      },
      opacity: '1'
    } as ImageStyle
  },
  captcha: {} as CaptchaData,
  error: false,
  success: false,
  message: ''
})

/**
 * Reference to the content element
 */
const content = ref<HTMLElement | null>(null)

/**
 * Watcher for options changes to update image styles
 */
watch(options, () => {
  const el = content.value
  if (!el) return

  const img = el.children[0].children[0] as HTMLElement

  Object.assign(img.style, options.img.style)

  const { x, y } = options.img.style.transform

  img.style.transform = `scale(${options.img.style.transform.scale}) translate(${x}, ${y}) rotate(${options.img.style.transform.rotate}deg)`
})

/**
 * Validate the captcha by sending the rotation angle to the server
 * @async
 * @returns {Promise<void>}
 */
async function validateCaptcha(): Promise<void> {
  options.loading = true

  const id = options.captcha.id
  const angle = options.img.style.transform.rotate

  const res: any = await post(
    '/file/captcha/valid',
    {
      captcha: 360 - angle
    },
    {
      headers: {
        captcha: id
      }
    }
  )

  await sleep(800)

  options.loading = false

  if (res.code !== 200) {
    options.error = true
    options.message = res.error

    await sleep(1800)

    while (options.img.style.transform.rotate > 90) {
      options.img.style.transform.rotate -= 1
      // await sleep(1)
    }

    options.img.style.transform.rotate = 90
    options.message = ''
    // await forDialogMention('验证失败', res.error, 'error-warning')

    await gen()
  } else {
    options.success = true

    await sleep(2800)

    props.func(res.data)
  }
}

/**
 * Generate a new captcha image
 * @async
 * @returns {Promise<any>}
 */
async function gen(): Promise<any> {
  const el = content.value
  if (!el) return
  options.error = false
  options.loading = true

  await sleep(200)

  options.img.style.transform.scale = 0.8

  await sleep(300)
  ;(options.img.style as any).opacity = '0'
  options.img.style.transform.x = '-150%'

  const res: any = await get('/file/captcha/gen')

  if (res.code !== 200) {
    options.loading = false
    options.error = true
    options.message = res.error

    setTimeout(gen, 5000)
    return
  }

  options.captcha = res.data

  const img = buffer2Img(res.data.image.data)

  await sleep(200)

  options.img.style.transform.x = '150%'
  options.img.image = img

  await sleep(300)
  ;(options.img.style as any).opacity = '1'
  options.img.style.transform.x = '0'

  await sleep(200)

  options.img.style.transform.scale = 1
  options.loading = false

  return res
}

/**
 * Convert buffer to base64 image
 * @param {ArrayBuffer} buffer - Image buffer
 * @returns {string} Base64 image string
 */
function buffer2Img(buffer: ArrayBuffer): string {
  // to base64
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  return `data:image/png;base64,${base64}`
}

/**
 * Initialize the component by generating the first captcha
 */
nextTick(() => {
  gen()
})
</script>

<!--
  TouchCaptcha Component Styles

  SCSS styles for the touch captcha including animations, layout, and visual design.
-->
<style lang="scss" scoped>
/** Slider control styles */
.TouchCaptcha-Slider {
  /** Loading state styles */
  &.loading {
    pointer-events: none;
    opacity: 0.75;
  }

  /** Deep selector for Element Plus slider customization */
  :deep(.el-slider) {
    /** Slider height */
    --el-slider-height: 20px;
    /** Slider border radius */
    --el-slider-border-radius: 5px;

    /** Slider main background color */
    --el-slider-main-bg-color: var(--el-color-primary);
    /** Slider runway background color */
    --el-slider-runway-bg-color: var(--el-border-color-light);
    /** Slider stop background color */
    --el-slider-stop-bg-color: var(--el-color-white);
    /** Slider disabled color */
    --el-slider-disabled-color: var(--el-text-color-placeholder);

    /** Slider button wrapper offset */
    --el-slider-button-wrapper-offset: -8px;
  }

  position: relative;

  left: 0;
  bottom: 0;

  width: 70%;
  height: 100px;

  display: flex;
  justify-content: center;
  align-items: center;
}

/** Breathing animation keyframes for loading state */
@keyframes breathing {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

/** Captcha content area styles */
.TouchCaptcha-Content {
  /** Success state styles */
  &.success {
    box-shadow: 0 0 8px 4px var(--el-color-success);
  }

  /** Error state styles */
  &.error {
    box-shadow: 0 0 8px 4px var(--el-color-danger);
  }

  /** Loading state styles */
  &.loading {
    pointer-events: none;

    box-shadow: 0 0 4px 2px var(--el-color-primary);

    animation: breathing 0.75s infinite;
  }

  /** Captcha image styles */
  img {
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 50%;

    transition: all 0.25s;
  }

  position: relative;
  margin-top: 50px;

  //width: 160px;
  height: 180px;

  aspect-ratio: 1 / 1;

  display: flex;
  justify-content: center;
  align-items: center;

  border-radius: 50%;
  overflow: hidden;
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.2));
  border: 2px solid var(--el-border-color);
}

/** Main container styles */
.TouchCaptcha-Container {
  /** Success animation styles */
  &.success {
    transition: 1.25s;

    opacity: 0;
    transform: translate(-50%, 50%) perspective(100px) rotate3d(0.2, 0, 0, 10deg);
  }

  /** Deep selector for progress bar positioning */
  :deep(.ProgressBar-Wrapper) {
    position: absolute;

    left: 0;
    top: 0;
  }

  z-index: 1000;
  position: absolute;
  display: flex;
  padding: 20px 10px;

  flex-direction: column;
  //justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  width: 320px;
  height: 450px;

  opacity: 1;
  transform: translate(-50%, -50%) perspective(100px) rotate3d(0, 0, 0, 10deg);

  transition: 0.25s;
  border-radius: 8px;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
  backdrop-filter: blur(18px) saturate(1.8) brightness(1.8);
  animation: pageLoad 0.5s ease-in;
  //background-color: var(--el-fill-color);
}

/** Page load animation keyframes */
@keyframes pageLoad {
  from {
    opacity: 0;
    transform: translate(-50%, 50%) perspective(100px) rotate3d(0.2, 0, 0, 10deg);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) perspective(100px) rotate3d(0, 0, 0, 10deg);
  }
}
</style>
