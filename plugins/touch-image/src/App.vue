<script setup lang="ts">
import { regService } from '@talex-touch/utils/plugin/sdk/service'
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk/storage'
import { ImageProtocolService } from '@talex-touch/utils/service/protocol'
import { onMounted, onUnmounted, ref } from 'vue'
import ImageView from './components/ImageView.vue'

const HISTORY_FILE = 'history-images.json'
const RETIRED_HISTORY_KEY = 'historyImgs'
const MAX_HISTORY_IMAGES = 50

const storage = usePluginStorage()
const historyImgs = ref<string[]>([])
const index = ref(-1)

function normalizeHistory(value: unknown): string[] {
  const source = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const item of source) {
    const path = String(item || '').trim()
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)
    normalized.push(path)
  }

  return normalized.slice(-MAX_HISTORY_IMAGES)
}

function parseHistory(raw: string): string[] {
  try {
    return normalizeHistory(JSON.parse(raw))
  }
  catch {
    return []
  }
}

async function persistHistory(): Promise<void> {
  await storage.setFile(HISTORY_FILE, JSON.stringify(historyImgs.value))
}

async function loadHistory(): Promise<void> {
  const saved = await storage.getFile(HISTORY_FILE)
  let history = saved ? parseHistory(saved) : []

  const retiredHistory = localStorage.getItem(RETIRED_HISTORY_KEY)
  if (retiredHistory) {
    history = normalizeHistory([...history, ...parseHistory(retiredHistory)])
    localStorage.removeItem(RETIRED_HISTORY_KEY)
    historyImgs.value = history
    index.value = history.length ? history.length - 1 : -1
    await persistHistory()
    return
  }

  historyImgs.value = history
  index.value = history.length ? history.length - 1 : -1
}

async function addImage(path: string): Promise<void> {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) {
    return
  }

  if (historyImgs.value.includes(normalizedPath)) {
    const i = historyImgs.value.indexOf(normalizedPath)

    return (index.value = i)
  }

  historyImgs.value = normalizeHistory([...historyImgs.value, normalizedPath])

  index.value = historyImgs.value.length - 1
  await persistHistory()
}

async function clearHistory(): Promise<void> {
  historyImgs.value = []
  index.value = -1
  await storage.deleteFile(HISTORY_FILE)
}

async function removeImage(path: string): Promise<void> {
  const nextHistory = historyImgs.value.filter(item => item !== path)
  if (nextHistory.length === historyImgs.value.length) {
    return
  }

  historyImgs.value = nextHistory
  index.value = nextHistory.length ? Math.min(index.value, nextHistory.length - 1) : -1
  if (nextHistory.length) {
    await persistHistory()
    return
  }
  await storage.deleteFile(HISTORY_FILE)
}

function handleDrop(e: DragEvent): void {
  e.preventDefault()

  const files = e.dataTransfer?.files
  if (!files) {
    return
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (file.type.startsWith('image')) {
      // @ts-expect-error Electron provides File.path at runtime
      void addImage(file.path)
    }
  }
}

function handleDragOver(e: Event): void {
  e.preventDefault()
}

onMounted(() => {
  void loadHistory()
  document.addEventListener('drop', handleDrop)
  document.addEventListener('dragover', handleDragOver)

  regService(new ImageProtocolService(), (e: any) => {
    void addImage(e.path)
  })
})

onUnmounted(() => {
  document.removeEventListener('drop', handleDrop)
  document.removeEventListener('dragover', handleDragOver)
})
</script>

<template>
  <div class="App-Container">
    <div class="App-Content">
      <ImageView v-if="index >= 0" :src="`atom:///${historyImgs[index]}`" />
    </div>
    <div class="App-Footer" :class="{ active: historyImgs.length }">
      <button
        v-if="historyImgs.length"
        class="App-Footer-Clear"
        type="button"
        aria-label="Clear history"
        title="Clear history"
        @click="clearHistory"
      >
        x
      </button>
      <div class="App-Footer-Content">
        <div
          v-for="(img, i) in historyImgs"
          :key="img"
          class="App-Footer-Content-Item"
          @mouseenter="index = i"
        >
          <img :src="`atom:///${img}`" @error="removeImage(img)">
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.App-Footer-Clear {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  z-index: 1;

  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 999px;

  color: #1f2937;
  background: #ffffffbf;
  cursor: pointer;
}

.App-Footer-Content {
  &-Item {
    img {
      position: relative;

      width: 100%;
      height: 100%;

      object-fit: cover;
    }
    &:active {
      filter: brightness(0.8)
    }
    width: 48px;
    height: 48px;

    cursor: pointer;
  }
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;

  gap: 0.5rem;
}

.App-Footer {
  &.active {
    opacity: 1;
    transform: translateY(0);
    background-color: #ffffff50;
    backdrop-filter: blur(16px) saturate(180%) contrast(80%) brightness(130%);
  }
  position: absolute;

  width: 100%;
  height: 4rem;

  bottom: 0;

  opacity: 0;
  box-sizing: border-box;
  transform: translateY(10%);
  transition: cubic-bezier(0.215, 0.61, 0.355, 1) 0.25s;
}
</style>
