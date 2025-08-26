<template>
  <div class="p-4">
    <h2 class="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Plugin Load Issues</h2>
    <div class="issues-list max-h-[calc(100vh-20rem)] overflow-y-auto">
      <div
        v-for="(issue, index) in plugin.issues"
        :key="index"
        class="issue-item flex items-start p-3 mb-3 last:mb-0 rounded-lg border"
        :class="{
          'bg-red-500/10 border-red-500/20': issue.type === 'error',
          'bg-yellow-500/10 border-yellow-500/20': issue.type === 'warning',
        }"
      >
        <i
          class="flex-shrink-0 mt-1 text-xl"
          :class="{
            'i-ri-close-circle-fill text-red-500': issue.type === 'error',
            'i-ri-alert-fill text-yellow-500': issue.type === 'warning',
          }"
        />
        <div class="ml-3">
          <p class="font-bold text-sm text-gray-900 dark:text-gray-100">
            Source: {{ issue.source }}
          </p>
          <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">{{ issue.message }}</p>
          <pre
            v-if="issue.meta"
            class="mt-2 p-2 bg-black/20 rounded text-xs whitespace-pre-wrap break-all"
            >{{ JSON.stringify(issue.meta, null, 2) }}</pre
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" name="PluginIssues" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

defineProps<{
  plugin: ITouchPlugin
}>()
</script>