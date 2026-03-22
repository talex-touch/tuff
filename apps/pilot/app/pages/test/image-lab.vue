<script setup lang="ts">
import { endHttp } from '~/composables/api/axios'

definePageMeta({
  layout: 'default',
})

type CapabilityId = 'image.generate' | 'image.edit' | 'audio.tts' | 'audio.stt' | 'audio.transcribe' | 'video.generate'

interface GeneratedImageItem {
  url: string
  previewUrl: string
  revisedPrompt?: string
  base64?: string
}

interface GeneratedAudioItem {
  url: string
  mimeType?: string
}

const capabilityOptions: Array<{ value: CapabilityId, label: string }> = [
  { value: 'image.generate', label: 'image.generate' },
  { value: 'image.edit', label: 'image.edit' },
  { value: 'audio.tts', label: 'audio.tts' },
  { value: 'audio.stt', label: 'audio.stt' },
  { value: 'audio.transcribe', label: 'audio.transcribe' },
  { value: 'video.generate', label: 'video.generate' },
]

const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const selectedCapability = ref<CapabilityId>('image.generate')

const resultRoute = ref<Record<string, unknown> | null>(null)
const resultAttempts = ref<Array<Record<string, unknown>>>([])
const resultImages = ref<GeneratedImageItem[]>([])
const resultAudio = ref<GeneratedAudioItem | null>(null)
const resultText = ref('')
const resultRaw = ref<Record<string, unknown> | null>(null)

const form = reactive({
  channelId: '',
  modelId: '',
  routeComboId: '',
  includeBase64: false,
  prompt: '一只在霓虹雨夜奔跑的柴犬，电影感，35mm，细节丰富',
  size: '1024x1024',
  count: 1,
  text: '你好，这是 Pilot 多模态 TTS 测试。',
  voice: 'alloy',
  format: 'mp3' as 'mp3' | 'wav' | 'opus' | 'flac' | 'aac' | 'pcm',
  imageBase64: '',
  imageMimeType: 'image/png',
  maskBase64: '',
  audioBase64: '',
  audioMimeType: 'audio/wav',
  language: '',
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  return normalizeText(error) || fallback
}

function resolveImagePreviewUrl(item: Record<string, unknown>): string {
  const url = normalizeText(item.url)
  if (url) {
    return url
  }
  const base64 = normalizeText(item.base64)
  if (!base64) {
    return ''
  }
  if (/^data:image\//i.test(base64)) {
    return base64
  }
  return `data:image/png;base64,${base64}`
}

function resetResult() {
  resultRoute.value = null
  resultAttempts.value = []
  resultImages.value = []
  resultAudio.value = null
  resultText.value = ''
  resultRaw.value = null
}

function buildPayload() {
  const payload: Record<string, unknown> = {
    capability: selectedCapability.value,
    channelId: normalizeText(form.channelId) || undefined,
    modelId: normalizeText(form.modelId) || undefined,
    routeComboId: normalizeText(form.routeComboId) || undefined,
    includeBase64: form.includeBase64,
  }

  if (selectedCapability.value === 'image.generate') {
    payload.prompt = normalizeText(form.prompt)
    payload.size = normalizeText(form.size)
    payload.count = Number(form.count)
  }

  if (selectedCapability.value === 'image.edit') {
    payload.prompt = normalizeText(form.prompt)
    payload.size = normalizeText(form.size)
    payload.count = Number(form.count)
    payload.image = {
      base64: normalizeText(form.imageBase64),
      mimeType: normalizeText(form.imageMimeType) || 'image/png',
      filename: 'image.png',
    }
    if (normalizeText(form.maskBase64)) {
      payload.mask = {
        base64: normalizeText(form.maskBase64),
        mimeType: normalizeText(form.imageMimeType) || 'image/png',
        filename: 'mask.png',
      }
    }
  }

  if (selectedCapability.value === 'audio.tts') {
    payload.text = normalizeText(form.text)
    payload.voice = normalizeText(form.voice) || 'alloy'
    payload.format = form.format
  }

  if (selectedCapability.value === 'audio.stt' || selectedCapability.value === 'audio.transcribe') {
    payload.audio = {
      base64: normalizeText(form.audioBase64),
      mimeType: normalizeText(form.audioMimeType) || 'audio/wav',
      filename: 'audio.wav',
    }
    payload.language = normalizeText(form.language) || undefined
    payload.prompt = normalizeText(form.prompt) || undefined
  }

  return payload
}

function validatePayload(payload: Record<string, unknown>): boolean {
  if (selectedCapability.value === 'video.generate') {
    successMessage.value = '配置已生效，video.generate 运行时暂未实现。'
    errorMessage.value = ''
    resetResult()
    return false
  }

  if (selectedCapability.value === 'image.generate' && !normalizeText(payload.prompt)) {
    ElMessage.warning('image.generate 需要 prompt')
    return false
  }

  if (selectedCapability.value === 'image.edit') {
    if (!normalizeText(payload.prompt)) {
      ElMessage.warning('image.edit 需要 prompt')
      return false
    }
    const imageRow = payload.image && typeof payload.image === 'object' && !Array.isArray(payload.image)
      ? payload.image as Record<string, unknown>
      : {}
    if (!normalizeText(imageRow.base64)) {
      ElMessage.warning('image.edit 需要 image.base64')
      return false
    }
  }

  if (selectedCapability.value === 'audio.tts' && !normalizeText(payload.text)) {
    ElMessage.warning('audio.tts 需要 text')
    return false
  }

  if (selectedCapability.value === 'audio.stt' || selectedCapability.value === 'audio.transcribe') {
    const audioRow = payload.audio && typeof payload.audio === 'object' && !Array.isArray(payload.audio)
      ? payload.audio as Record<string, unknown>
      : {}
    if (!normalizeText(audioRow.base64)) {
      ElMessage.warning(`${selectedCapability.value} 需要 audio.base64`)
      return false
    }
  }

  return true
}

async function invokeCapability() {
  const payload = buildPayload()
  if (!validatePayload(payload)) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  resetResult()

  try {
    const res: any = await endHttp.post('runtime/capability-test/invoke', payload)
    if (res?.code !== 200) {
      throw new Error(res?.message || '能力测试失败')
    }

    const data = res?.data || {}
    resultRoute.value = data.selectedRoute || null
    resultAttempts.value = Array.isArray(data.attempts) ? data.attempts : []
    resultRaw.value = data.result && typeof data.result === 'object' ? data.result : null

    const result = data.result || {}

    const images = Array.isArray(result.images)
      ? result.images
          .map((item: any) => {
            const row = item && typeof item === 'object' && !Array.isArray(item)
              ? item as Record<string, unknown>
              : {}
            const url = normalizeText(row.url)
            const base64 = normalizeText(row.base64)
            return {
              url,
              previewUrl: resolveImagePreviewUrl(row),
              revisedPrompt: normalizeText(row.revisedPrompt || row.revised_prompt) || undefined,
              base64: base64 || undefined,
            }
          })
          .filter((item: GeneratedImageItem) => Boolean(item.previewUrl))
      : []
    resultImages.value = images

    if (result.audio && typeof result.audio === 'object' && !Array.isArray(result.audio)) {
      const audioUrl = normalizeText(result.audio.url)
      resultAudio.value = audioUrl
        ? {
            url: audioUrl,
            mimeType: normalizeText(result.audio.mimeType) || undefined,
          }
        : null
    }
    else {
      resultAudio.value = null
    }

    resultText.value = normalizeText(result.text)
    successMessage.value = `调用成功：${selectedCapability.value}`
    ElMessage.success(successMessage.value)
  }
  catch (error) {
    errorMessage.value = normalizeErrorMessage(error, '能力测试失败')
    ElMessage.error(errorMessage.value)
  }
  finally {
    loading.value = false
  }
}

const imagePreviewList = computed(() => resultImages.value.map(item => item.previewUrl))
</script>

<template>
  <div class="CapabilityLabPage">
    <div class="CapabilityLabPanel">
      <header class="CapabilityLabHeader">
        <h1>Pilot Capability Lab</h1>
        <p>走管理配置路由，测试 image/audio 多模态能力与自动回退。</p>
      </header>

      <el-form label-width="130px" class="CapabilityLabForm">
        <el-form-item label="Capability">
          <el-select v-model="selectedCapability" style="width: 100%">
            <el-option
              v-for="item in capabilityOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="channelId(可选)">
              <el-input v-model="form.channelId" placeholder="default" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="modelId(可选)">
              <el-input v-model="form.modelId" placeholder="quota-auto" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="routeCombo(可选)">
              <el-input v-model="form.routeComboId" placeholder="default-auto" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="输出选项">
          <el-checkbox v-model="form.includeBase64">
            includeBase64
          </el-checkbox>
        </el-form-item>

        <template v-if="selectedCapability === 'image.generate' || selectedCapability === 'image.edit' || selectedCapability === 'audio.transcribe' || selectedCapability === 'audio.stt'">
          <el-form-item label="Prompt">
            <el-input v-model="form.prompt" type="textarea" :rows="3" placeholder="输入提示词" />
          </el-form-item>
        </template>

        <template v-if="selectedCapability === 'image.generate' || selectedCapability === 'image.edit'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="Size">
                <el-input v-model="form.size" placeholder="1024x1024" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Count">
                <el-input-number v-model="form.count" :min="1" :max="4" controls-position="right" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <template v-if="selectedCapability === 'image.edit'">
          <el-form-item label="image.base64">
            <el-input v-model="form.imageBase64" type="textarea" :rows="5" placeholder="可粘贴 data:image/...;base64,... 或纯 base64" />
          </el-form-item>
          <el-form-item label="mask.base64(可选)">
            <el-input v-model="form.maskBase64" type="textarea" :rows="3" placeholder="可选 mask" />
          </el-form-item>
        </template>

        <template v-if="selectedCapability === 'audio.tts'">
          <el-form-item label="Text">
            <el-input v-model="form.text" type="textarea" :rows="3" placeholder="输入 TTS 文本" />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="Voice">
                <el-input v-model="form.voice" placeholder="alloy" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Format">
                <el-select v-model="form.format" style="width: 100%">
                  <el-option value="mp3" label="mp3" />
                  <el-option value="wav" label="wav" />
                  <el-option value="opus" label="opus" />
                  <el-option value="flac" label="flac" />
                  <el-option value="aac" label="aac" />
                  <el-option value="pcm" label="pcm" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <template v-if="selectedCapability === 'audio.stt' || selectedCapability === 'audio.transcribe'">
          <el-form-item label="audio.base64">
            <el-input v-model="form.audioBase64" type="textarea" :rows="5" placeholder="可粘贴 data:audio/...;base64,... 或纯 base64" />
          </el-form-item>
          <el-form-item label="language(可选)">
            <el-input v-model="form.language" placeholder="zh / en" />
          </el-form-item>
        </template>

        <el-form-item>
          <div class="CapabilityLabActions">
            <el-button type="primary" :loading="loading" @click="invokeCapability">
              {{ loading ? '调用中...' : '调用能力' }}
            </el-button>
            <el-button @click="resetResult">
              清空结果
            </el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <div class="CapabilityLabPanel">
      <div class="CapabilityLabResultHeader">
        <h2>调用结果</h2>
      </div>

      <el-alert
        v-if="successMessage"
        type="success"
        :closable="false"
        :title="successMessage"
        class="CapabilityLabAlert"
      />

      <el-alert
        v-if="errorMessage"
        type="error"
        :closable="false"
        :title="errorMessage"
        class="CapabilityLabAlert"
      />

      <template v-if="resultRoute">
        <h3 class="CapabilityLabTitle">最终路由</h3>
        <pre class="CapabilityLabPre">{{ resultRoute }}</pre>
      </template>

      <template v-if="resultAttempts.length > 0">
        <h3 class="CapabilityLabTitle">尝试链路</h3>
        <pre class="CapabilityLabPre">{{ resultAttempts }}</pre>
      </template>

      <template v-if="resultImages.length > 0">
        <h3 class="CapabilityLabTitle">图片结果</h3>
        <div class="CapabilityLabGrid">
          <div v-for="(item, index) in resultImages" :key="`${item.url}-${index}`" class="CapabilityLabCard">
            <el-image
              :src="item.previewUrl"
              fit="cover"
              :preview-src-list="imagePreviewList"
              :initial-index="index"
            />
            <p v-if="item.revisedPrompt" class="CapabilityLabPrompt">{{ item.revisedPrompt }}</p>
          </div>
        </div>
      </template>

      <template v-if="resultAudio">
        <h3 class="CapabilityLabTitle">音频结果</h3>
        <audio :src="resultAudio.url" controls class="CapabilityLabAudio" />
        <pre class="CapabilityLabPre">{{ resultAudio }}</pre>
      </template>

      <template v-if="resultText">
        <h3 class="CapabilityLabTitle">文本结果</h3>
        <pre class="CapabilityLabPre">{{ resultText }}</pre>
      </template>

      <template v-if="resultRaw && resultImages.length <= 0 && !resultAudio && !resultText">
        <h3 class="CapabilityLabTitle">Raw Result</h3>
        <pre class="CapabilityLabPre">{{ resultRaw }}</pre>
      </template>

      <el-empty v-if="!resultRoute && !errorMessage && !successMessage" description="暂无调用结果" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.CapabilityLabPage {
  height: 100%;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.CapabilityLabPanel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 16px;
}

.CapabilityLabHeader {
  margin-bottom: 12px;

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 8px 0 0;
    color: var(--el-text-color-secondary);
  }
}

.CapabilityLabForm {
  margin-top: 12px;
}

.CapabilityLabActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.CapabilityLabResultHeader {
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.CapabilityLabAlert {
  margin-bottom: 12px;
}

.CapabilityLabTitle {
  margin: 12px 0 8px;
  font-size: 14px;
}

.CapabilityLabPre {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  white-space: pre-wrap;
  word-break: break-word;
}

.CapabilityLabGrid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.CapabilityLabCard {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-blank);

  :deep(.el-image) {
    width: 100%;
    height: 220px;
    display: block;
  }
}

.CapabilityLabPrompt {
  margin: 0;
  padding: 10px 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.CapabilityLabAudio {
  width: 100%;
  margin-bottom: 8px;
}
</style>
