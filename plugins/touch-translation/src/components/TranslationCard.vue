<template>
  <div class="relative p-4 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 h-full flex flex-col">
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-semibold text-md text-blue-500 dark:text-blue-400">
        {{ translator.name }}
      </h3>
      <button class="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" @click="copyResult">
        <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
        </svg>
      </button>
    </div>
    <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap flex-grow">
      {{ translator.result || '翻译中...' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  translator: {
    type: Object,
    required: true,
    default: () => ({ name: '', result: '' }),
  },
})

async function copyResult() {
  if (props.translator.result) {
    try {
      await navigator.clipboard.writeText(props.translator.result)
      // You can add a notification for success here
      console.log('Copied to clipboard!')
    }
    catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }
}
</script>