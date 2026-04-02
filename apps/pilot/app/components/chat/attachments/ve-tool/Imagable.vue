<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { api as viewerApi } from 'v-viewer'

const props = defineProps<{
  data: any
  value: any
  isEnd: boolean
  timeCost: number
}>()

const start = Date.now()
const { now, pause } = useNow({ controls: true })

// 获得圆环进度
// 只要没到10秒 就会慢慢走到90% 直到90% 时间越长速度越慢
const progress = computed(() => {
  if (props.isEnd) {
    pause()

    return 100
  }

  const duration = (now.value.getTime() - start)

  if (duration <= 100)
    return 5

  if (duration <= 500)
    return 10

  if (duration <= 1200)
    return 30

  if (duration <= 2000)
    return 35

  if (duration <= 3000)
    return 40

  if (duration <= 4500)
    return 50

  if (duration <= 5800)
    return 60

  if (duration <= 6500)
    return 75

  if (duration <= 7000)
    return 80

  if (duration <= 8500)
    return 85

  if (duration <= 12000)
    return 90

  return 95/* Math.min(Math.max(Math.round(start / duration * 90), 10), 90) */
})

function handleViewImage(src: string) {
  if (!props.isEnd)
    return

  viewerApi({ images: [src] })
}

const imageSrc = ref('')
const fallbackMode = ref(false)
const loadProgress = ref(0)

const image = computed(() => {
  const value = props.value

  const src = value.output || value.output_clearly || value.output_default || value.output_prettier || value.output1 || value.output2 || value.output3 || value.output4 || value.output5

  return src
})

async function loadImage() {
  const src = image.value
  if (!src)
    return imageSrc.value = ''

  const req = new XMLHttpRequest()

  req.open('GET', src, true)
  req.responseType = 'blob'

  req.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      fallbackMode.value = false

      loadProgress.value = event.loaded / event.total * 100
    }
    else {
      // 总大小未知时不能计算进程信息
      fallbackMode.value = true
    }
  })

  req.addEventListener('load', () => {
    const blob = req.response

    const url = URL.createObjectURL(blob)

    imageSrc.value = url
  })

  req.send()
}

watchEffect(loadImage)
</script>

<template>
  <div :style="`--percentage: ${loadProgress}%`" :class="{ loaded: loadProgress >= 100 }" class="Imagable">
    <div class="Imagable-Inner">
      <div
        class="Imagable-Inner-Back bg-radial [animation-delay:.7s] h-14 w-14 animate-spin rounded-full bg-gradient-to-tr"
      >
        <div class="spinner">
          <div class="spinner1" />
        </div>
      </div>

      <div class="Imagable-Progress" />

      <div class="Imagable-Inner-Img" @click="handleViewImage(image)">
        <div v-if="!image" class="Imagable-Inner-Cover">
          图片生成失败
        </div>

        <div v-else-if="fallbackMode || loadProgress < 100" class="Imagable-Inner-Cover">
          图片下载中
          <IconCircleLoader class="Loader" />
        </div>

        <div v-if="!fallbackMode" class="Imagable-Inner-ImgWrapper">
          <img :src="imageSrc" @load="loadProgress = 100">

          <div class="Imagable-Inner-ImgWrapper-Mention">
            <span class="brand">Powered by QuotaGPT.</span>
            <span class="time">{{ (timeCost / 1000).toFixed(1) }} 秒生成</span>
          </div>
        </div>
      </div>

      <div class="Imagable-Gen transition-cubic">
        <div i-carbon:image />
        <p v-if="isEnd">
          {{ data.arguments?.text || '已生成图片' }}
        </p>
        <OtherTextShaving v-else :text="data.arguments?.text || '图片生成中'" />
        <!-- var(--theme-color) -->
        <el-progress
          color="var(--el-text-color-primary)" :show-text="false" :stroke-width="2" :width="16" type="circle"
          :percentage="progress"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes rotate {
  0% {
    opacity: 0.75;

    transform: rotate(0deg);
    filter: blur(100px) saturate(180%);
  }

  50% {
    opacity: 1;

    transform: rotate(180deg);
    filter: blur(50px) saturate(180%);
  }

  100% {
    opacity: 0.75;

    transform: rotate(360deg);
    filter: blur(100px) saturate(180%);
  }
}

@property --offset {
  syntax: '<length-percentage>';
  inherits: false;
  initial-value: 0;
}

.Imagable {
  &-Progress {
    &::before {
      position: absolute;
      content: '';

      top: 2px;
      left: 2px;

      width: calc(100% - 4px);
      height: calc(100% - 4px);

      border-radius: 16px;
      background-color: var(--el-bg-color-page);
    }
    .done & {
      opacity: 1;
    }
    .loaded & {
      opacity: 0;
    }
    position: absolute;

    top: -2px;
    left: -2px;

    width: calc(100% + 4px);
    height: calc(100% + 4px);

    background-image: conic-gradient(
      var(--theme-color) 0%,
      var(--theme-color) var(--percentage),
      transparent var(--percentage) 100%
    );

    opacity: 0;
    border-radius: 16px;
    transition: cubic-bezier(0.25, 0.46, 0.45, 0.94) 1s 0.5s;
  }

  &-Inner {
    &-Cover {
      :deep(.Loader) {
        transform: scale(0.85);
      }

      position: absolute;
      display: flex;

      top: 50%;
      left: 50%;

      transform: translate(-50%, -50%);

      color: var(--el-text-color-secondary);
      font-size: 0.875rem;
      font-weight: 600;
      text-align: center;

      gap: 0.5rem;
      align-items: center;
      text-shadow: 0 0 1rem var(--el-text-color-placeholder);
    }

    &-Img {
      .done & {
        opacity: 1;
      }

      &:hover {
        .time,
        .brand {
          opacity: 0.75;
        }
      }
      z-index: 1;
      position: relative;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0;
      overflow: hidden;
      border-radius: 16px;

      &Wrapper {
        &-Mention {
          .brand {
            padding: 0.25rem 0.5rem;

            opacity: 0;
            transition: 0.25s;
            border-radius: 12px;
            background-color: var(--el-overlay-color);
          }
          .time {
            padding: 0.25rem 0.5rem;

            opacity: 0;
            transition: 0.25s;
            border-radius: 12px;
            background-color: var(--el-overlay-color);
          }

          z-index: 1;
          position: absolute;
          display: flex;

          align-items: center;
          justify-content: space-between;
          flex-direction: row-reverse;

          width: calc(100% - 1rem);
          // height: calc(100% - 1rem);

          right: 0.5rem;
          bottom: 0.5rem;

          font-size: 10px;
          color: var(--el-text-color-placeholder);
        }

        .loaded & {
          opacity: 1;

          filter: blur(0px);
          transform: scale(1);

          transition: 0.5s 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        z-index: 1;
        position: relative;

        opacity: 0;
        filter: blur(50px);
        transform: scale(1.25);
      }

      img {
        position: relative;

        top: 0;
        left: 0;

        min-width: 20rem;
        height: 20rem;

        object-fit: contain;
      }
    }

    .done & {
      background-color: var(--el-bg-color-page);
    }

    position: relative;

    top: 0;
    left: 0;

    width: max-content;
    min-width: 10rem;
    max-width: 85vw;
    height: 20rem;
    max-height: 80vw;

    cursor: pointer;

    border-radius: 16px;

    &-Back {
      .done & {
        opacity: 0 !important;
      }

      position: absolute;
      display: flex;

      align-items: center;
      justify-content: center;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      animation: rotate 2s linear infinite;

      background-color: var(--el-bg-color);
      background-image: conic-gradient(
        from 0deg,
        violet,
        indigo 30%,
        blue 50%,
        green 60%,
        yellow 70%,
        orange 80%,
        red 100%
      );
    }
  }

  &-Gen {
    .done & {
      opacity: 0;
      pointer-events: none;
    }

    z-index: 2;
    position: absolute;
    padding: 0 0.25rem;
    display: flex;

    top: 50%;
    left: 50%;

    font-size: 0.875rem;
    font-weight: 600;
    text-align: center;

    text-shadow: 0 0 1rem var(--el-text-color-placeholder);
    transform: translate(-50%, -50%);

    height: 32px;

    gap: 0.5rem;
    align-items: center;
  }

  position: relative;
}

.spinner {
  background-image: linear-gradient(rgb(186, 66, 255) 35%, rgb(0, 225, 255));
  width: 100px;
  height: 100px;
  animation: spinning82341 1.7s linear infinite;
  text-align: center;
  border-radius: 50px;
  filter: blur(10px);
  box-shadow:
    0px -5px 20px 0px rgb(186, 66, 255),
    0px 5px 20px 0px rgb(0, 225, 255);
}

.spinner1 {
  background-color: var(--el-bg-color-page);
  width: 100px;
  height: 100px;
  border-radius: 50px;
  filter: blur(10px);
}

@keyframes spinning82341 {
  to {
    transform: rotate(360deg);
  }
}
</style>
