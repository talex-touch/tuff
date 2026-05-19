<script setup lang="ts">
import { computed } from 'vue'
import { useClipboard } from '@talex-touch/utils/plugin/sdk'

interface ImageTranslationPayload {
  mode?: string
  status?: 'complete' | 'error'
  sourceImageDataUrl?: string
  translatedImageDataUrl?: string
  sourceText?: string
  targetText?: string
  provider?: string
  model?: string
  traceId?: string
  error?: string
}

const props = defineProps<{
  payload?: Record<string, unknown>
}>()

let clipboard: ReturnType<typeof useClipboard> | null = null
try {
  clipboard = useClipboard()
} catch {
  clipboard = null
}

function readText(key: keyof ImageTranslationPayload): string {
  const value = props.payload?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

const sourceImage = computed(() => readText('sourceImageDataUrl'))
const translatedImage = computed(() => readText('translatedImageDataUrl'))
const sourceText = computed(() => readText('sourceText'))
const targetText = computed(() => readText('targetText'))
const providerLabel = computed(() => {
  const provider = readText('provider')
  const model = readText('model')
  return [provider, model].filter(Boolean).join(' / ')
})
const traceId = computed(() => readText('traceId'))
const error = computed(() => readText('error'))
const isError = computed(() => props.payload?.status === 'error')

function copyTargetText(): void {
  if (!targetText.value || !clipboard) {
    return
  }
  clipboard.writeText(targetText.value)
}
</script>

<template>
  <section class="ImageTranslateResult" :class="{ 'is-error': isError }">
    <div class="ImageTranslateResult-Media">
      <figure class="ImageTranslateResult-Panel">
        <figcaption>原图</figcaption>
        <img v-if="sourceImage" :src="sourceImage" alt="原图">
      </figure>
      <figure class="ImageTranslateResult-Panel ImageTranslateResult-Panel--primary">
        <figcaption>译图</figcaption>
        <img v-if="translatedImage" :src="translatedImage" alt="译图">
        <div v-else class="ImageTranslateResult-Empty">
          {{ error || '图片翻译失败' }}
        </div>
      </figure>
    </div>

    <div class="ImageTranslateResult-Text">
      <div v-if="sourceText || targetText" class="ImageTranslateResult-TextGrid">
        <div>
          <div class="ImageTranslateResult-Label">
            识别文本
          </div>
          <p>{{ sourceText || '无' }}</p>
        </div>
        <div>
          <div class="ImageTranslateResult-Label">
            译文
          </div>
          <p>{{ targetText || '无' }}</p>
        </div>
      </div>

      <div class="ImageTranslateResult-Footer">
        <span v-if="providerLabel">{{ providerLabel }}</span>
        <span v-if="traceId">Trace {{ traceId }}</span>
        <button v-if="targetText" type="button" @click.stop="copyTargetText">
          复制译文
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ImageTranslateResult {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--tx-text-color-primary, #1f2933);
  background: var(--tx-bg-color, #fff);
}

.ImageTranslateResult-Media {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
  padding: 12px;
}

.ImageTranslateResult-Panel {
  min-width: 0;
  min-height: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color-lighter, #f7f8fa) 72%, transparent);
}

.ImageTranslateResult-Panel figcaption {
  height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-secondary, #667085);
  border-bottom: 1px solid var(--tx-border-color-lighter, #e5e7eb);
}

.ImageTranslateResult-Panel img {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ImageTranslateResult-Panel--primary {
  background: var(--tx-bg-color, #fff);
}

.ImageTranslateResult-Empty {
  flex: 1;
  min-height: 160px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tx-color-danger, #d92d20);
}

.ImageTranslateResult-Text {
  flex: 0 0 auto;
  padding: 0 12px 12px;
}

.ImageTranslateResult-TextGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.ImageTranslateResult-Label {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-secondary, #667085);
}

.ImageTranslateResult-TextGrid p {
  max-height: 88px;
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--tx-fill-color-lighter, #f7f8fa);
}

.ImageTranslateResult-Footer {
  min-height: 32px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #667085);
}

.ImageTranslateResult-Footer span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ImageTranslateResult-Footer button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--tx-border-color, #d0d5dd);
  border-radius: 6px;
  color: var(--tx-text-color-primary, #1f2933);
  background: var(--tx-bg-color, #fff);
  cursor: pointer;
}

.ImageTranslateResult-Footer button:hover {
  background: var(--tx-fill-color-light, #eef2f6);
}

@media (max-width: 720px) {
  .ImageTranslateResult-Media,
  .ImageTranslateResult-TextGrid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
