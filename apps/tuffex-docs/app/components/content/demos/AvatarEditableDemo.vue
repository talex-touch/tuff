<script setup lang="ts">
import type { AvatarEditResult, AvatarEditorLabels, AvatarShape } from '@talex-touch/tuffex/avatar'
import { avatarMediaEngine } from '@talex-touch/tuffex/avatar'
import { computed, ref } from 'vue'

const { encodeGif, formatByteSize } = avatarMediaEngine

const { locale } = useI18n()

const avatarSrc = ref('')
const avatarShape = ref<AvatarShape>('circle')
const lastResult = ref<AvatarEditResult | null>(null)
const standaloneOpen = ref(false)
const standaloneSource = ref<File | null>(null)

const copy = computed(() => (locale.value === 'zh'
  ? {
      clickTip: '点击或拖入图片 / 动图 / 视频到头像即可编辑',
      trySvg: '示例 SVG',
      tryGif: '示例动图',
      shapeLabel: '形状',
      circle: '圆形',
      rounded: '圆角',
      square: '方形',
      emptyOutput: '编辑应用后将显示导出文件信息',
      animatedTag: '动图',
      editLabel: '编辑头像',
      editorLabels: {
        title: '编辑头像',
        close: '关闭',
        uploadDropText: '拖入或点击上传',
        uploadHintText: '',
        uploadButtonText: '选择文件',
        uploadFormatsHint: '',
        replaceFile: '更换文件',
        rotateLeft: '左转 90°',
        rotateRight: '右转 90°',
        flipHorizontal: '水平翻转',
        flipVertical: '垂直翻转',
        fitContain: '完整适应',
        fitCover: '填满裁切框',
        reset: '重置',
        zoom: '缩放',
        rotation: '角度',
        shape: '遮罩',
        shapeCircle: '圆形',
        shapeRounded: '圆角',
        shapeSquare: '方形',
        maskClip: '透明通道裁切',
        adjustments: '调色',
        brightness: '亮度',
        contrast: '对比度',
        saturation: '饱和度',
        background: '背景',
        transparent: '透明',
        outputSection: '导出',
        format: '格式',
        outputSize: '尺寸',
        quality: '质量',
        preview: '预览',
        timeline: '时间轴',
        play: '播放',
        pause: '暂停',
        prevFrame: '上一帧',
        nextFrame: '下一帧',
        captureFrame: '单帧',
        captureGifClip: '动图',
        clipStart: '起点',
        clipEnd: '终点',
        clipFps: '帧率',
        clipSummary: '片段',
        download: '下载',
        cancel: '取消',
        apply: '应用',
        exporting: '编码中',
        loading: '解析中...',
        unsupportedFormat: '当前浏览器不支持该编码格式',
        corsTaintedError: '远程图片未开启跨域许可，请改为上传本地文件。',
        loadFailedError: '当前浏览器无法解码该文件。',
        videoUnsupportedError: '当前浏览器不支持该视频编码。',
        remoteSourceBlockedError: '默认仅支持本地文件、Blob 或 data/blob 链接；如需载入远程链接请显式开启 allowRemoteSource。',
        gifTruncatedNotice: '该 GIF 帧数超出上限，仅载入了前序帧。',
        pasteHint: '',
      } satisfies Partial<AvatarEditorLabels>,
    }
  : {
      clickTip: 'Click or drop an image, GIF, or video onto the avatar',
      trySvg: 'Sample SVG',
      tryGif: 'Sample GIF',
      shapeLabel: 'Shape',
      circle: 'Circle',
      rounded: 'Rounded',
      square: 'Square',
      emptyOutput: 'Export metadata appears here after applying',
      animatedTag: 'GIF',
      editLabel: 'Edit avatar',
      editorLabels: undefined,
    }))

function onEdit(result: AvatarEditResult) {
  lastResult.value = result
  avatarSrc.value = result.url
  avatarShape.value = result.shape
}

function openSampleSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect width="256" height="256" rx="48" fill="url(#g)"/><circle cx="128" cy="102" r="42" fill="#ffffff" fill-opacity="0.92"/><path d="M56 218c10-44 40-66 72-66s62 22 72 66" fill="#ffffff" fill-opacity="0.92"/></svg>`
  standaloneSource.value = new File([svg], 'sample-badge.svg', { type: 'image/svg+xml' })
  standaloneOpen.value = true
}

function openSampleGif() {
  const size = 96
  const palette: [number, number, number][] = [
    [59, 130, 246],
    [139, 92, 246],
    [16, 185, 129],
    [245, 158, 11],
  ]
  const frames = palette.map(([r, g, b], idx) => {
    const rgba = new Uint8ClampedArray(size * size * 4)
    const cx = 32 + idx * 10
    const cy = 48
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const dist = Math.hypot(x - cx, y - cy)
        if (dist < 22) {
          rgba[i] = 255
          rgba[i + 1] = 255
          rgba[i + 2] = 255
          rgba[i + 3] = 255
        }
        else {
          rgba[i] = r
          rgba[i + 1] = g
          rgba[i + 2] = b
          rgba[i + 3] = 255
        }
      }
    }
    return { rgba, width: size, height: size, delayMs: 180 }
  })
  const bytes = encodeGif(frames, { width: size, height: size, loop: 0 })
  standaloneSource.value = new File([bytes], 'sample-motion.gif', { type: 'image/gif' })
  standaloneOpen.value = true
}
</script>

<template>
  <div class="avatar-editable-demo not-prose">
    <div class="avatar-editable-demo__top">
      <TxAvatar
        v-model:src="avatarSrc"
        name="Talex DreamSoul"
        size="xlarge"
        :shape="avatarShape"
        editable
        :edit-label="copy.editLabel"
        :editor-labels="copy.editorLabels"
        @edit="onEdit"
      />

      <div class="avatar-editable-demo__controls">
        <p class="avatar-editable-demo__tip">
          {{ copy.clickTip }}
        </p>

        <div class="avatar-editable-demo__actions">
          <button type="button" class="avatar-editable-demo__btn" @click="openSampleSvg">
            {{ copy.trySvg }}
          </button>
          <button type="button" class="avatar-editable-demo__btn" @click="openSampleGif">
            {{ copy.tryGif }}
          </button>

          <div class="avatar-editable-demo__shapes" role="group" :aria-label="copy.shapeLabel">
            <button
              v-for="item in (['circle', 'rounded', 'square'] as const)"
              :key="item"
              type="button"
              class="avatar-editable-demo__shape-btn"
              :class="{ 'is-active': avatarShape === item }"
              :title="item === 'circle' ? copy.circle : item === 'rounded' ? copy.rounded : copy.square"
              :aria-label="item === 'circle' ? copy.circle : item === 'rounded' ? copy.rounded : copy.square"
              @click="avatarShape = item"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle v-if="item === 'circle'" cx="12" cy="12" r="8" />
                <rect v-else-if="item === 'rounded'" x="4" y="4" width="16" height="16" rx="4.5" />
                <rect v-else x="4.5" y="4.5" width="15" height="15" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="lastResult" class="avatar-editable-demo__meta">
      <code>{{ lastResult.file.name }}</code>
      <span>{{ lastResult.mimeType }}</span>
      <span>{{ lastResult.width }}×{{ lastResult.height }}</span>
      <span>{{ formatByteSize(lastResult.size) }}</span>
      <span v-if="lastResult.animated" class="avatar-editable-demo__badge">
        {{ copy.animatedTag }} · {{ lastResult.frameCount }}f
      </span>
    </div>

    <TxAvatarEditor
      v-model:open="standaloneOpen"
      :source="standaloneSource"
      :shape="avatarShape"
      :labels="copy.editorLabels"
      @confirm="onEdit"
    />
  </div>
</template>

<style scoped>
.avatar-editable-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}

.avatar-editable-demo__top {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.avatar-editable-demo__controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 220px;
}

.avatar-editable-demo__tip {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.avatar-editable-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.avatar-editable-demo__btn,
.avatar-editable-demo__shape-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
}

.avatar-editable-demo__shape-btn {
  width: 28px;
  padding: 0;
}

.avatar-editable-demo__btn:hover,
.avatar-editable-demo__shape-btn:hover {
  background: var(--tx-fill-color, #ebedf0);
}

.avatar-editable-demo__shapes {
  display: inline-flex;
  gap: 4px;
}

.avatar-editable-demo__shape-btn.is-active {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.avatar-editable-demo__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
}

.avatar-editable-demo__badge {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--tx-color-primary, #409eff);
  background: var(--tx-color-primary-light-9, #ecf5ff);
}
</style>
