<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import TranslationCard from '../components/TranslationCard.vue'

interface HistoryItem {
  id: number
  text: string
}

const query = ref('')
const showSettings = ref(false)
const history = ref<HistoryItem[]>([])

const translators = reactive([
  { name: 'Google', enabled: true, result: '' },
  { name: 'DeepL', enabled: true, result: '' },
  { name: 'Bing', enabled: false, result: '' },
  { name: '自定义', enabled: true, result: '' },
])

const enabledTranslators = computed(() => translators.filter(t => t.enabled))
const hasResults = computed(() => enabledTranslators.value.some(t => t.result))

// History Management
const HISTORY_KEY = 'translation_history'
const MAX_HISTORY = 10

onMounted(() => {
  const savedHistory = localStorage.getItem(HISTORY_KEY)
  if (savedHistory) {
    history.value = JSON.parse(savedHistory)
  }
})

watch(history, (newHistory) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
}, { deep: true })

function addToHistory(text: string) {
  if (!text) {
    return
  }
  const existingIndex = history.value.findIndex(item => item.text === text)
  if (existingIndex > -1) {
    // Move to top
    const item = history.value.splice(existingIndex, 1)[0]
    history.value.unshift(item)
  }
  else {
    history.value.unshift({ id: Date.now(), text })
    if (history.value.length > MAX_HISTORY) {
      history.value.pop()
    }
  }
}

function removeFromHistory(id: number) {
  history.value = history.value.filter(item => item.id !== id)
}

function useHistoryItem(text: string) {
  query.value = text
  translate()
}

function toggleSettings() {
  showSettings.value = !showSettings.value
}

async function translate() {
  const textToTranslate = query.value.trim()
  if (!textToTranslate) {
    return
  }
  showSettings.value = false
  addToHistory(textToTranslate)

  translators.forEach(t => (t.result = ''))

  enabledTranslators.value.forEach((translator) => {
    setTimeout(() => {
      translator.result = `[${translator.name}] 翻译: ${textToTranslate}`
    }, Math.random() * 1000)
  })
}
</script>

<template>
  <div class="p-4 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex justify-center">
    <div class="w-full max-w-2xl flex flex-col gap-3">
      <h1 class="text-2xl font-bold text-center mb-2">
        多源翻译
      </h1>

      <div class="relative">
        <textarea
          v-model="query"
          rows="5"
          placeholder="输入要翻译的文本..."
          class="w-full p-3 pr-10 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button class="absolute top-2 right-2 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" @click="toggleSettings">
          <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>

        <div v-if="showSettings" class="absolute top-12 right-0 z-10 w-48 p-3 bg-white dark:bg-gray-800 border rounded-md shadow-lg border-gray-300 dark:border-gray-600">
          <h3 class="text-md font-semibold mb-2">
            翻译源
          </h3>
          <div v-for="translator in translators" :key="translator.name" class="flex items-center gap-2 mb-1">
            <input :id="translator.name" v-model="translator.enabled" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
            <label :for="translator.name" class="text-sm">{{ translator.name }}</label>
          </div>
        </div>
      </div>

      <button class="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" @click="translate">
        翻译
      </button>

      <div v-if="history.length > 0" class="pt-2">
        <h3 class="text-md font-semibold mb-2">
          历史记录
        </h3>
        <div class="flex flex-wrap gap-2">
          <div v-for="item in history" :key="item.id" class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-sm">
            <span class="cursor-pointer hover:text-blue-500" @click="useHistoryItem(item.text)">{{ item.text }}</span>
            <button class="ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" @click="removeFromHistory(item.id)">
              &times;
            </button>
          </div>
        </div>
      </div>

      <div class="pt-2">
        <div v-if="!hasResults" class="text-center text-gray-500 mt-6">
          翻译结果将显示在这里
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TranslationCard v-for="translator in enabledTranslators" :key="translator.name" :translator="translator" />
        </div>
      </div>
    </div>
  </div>
</template>
