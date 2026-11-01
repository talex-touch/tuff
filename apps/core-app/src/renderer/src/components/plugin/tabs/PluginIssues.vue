<script lang="ts" name="PluginIssues" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describePluginIssue } from '~/modules/plugin/plugin-issue-display'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const { t, locale } = useI18n()

const describedIssues = computed(() =>
  (props.plugin.issues ?? []).map((issue) => ({
    issue,
    display: describePluginIssue(issue, t, locale.value)
  }))
)
</script>

<template>
  <div class="plugin-issues p-4 w-full">
    <h2 class="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
      {{ t('plugin.issues.title') }}
    </h2>
    <div class="issues-list">
      <div
        v-for="({ issue, display }, index) in describedIssues"
        :key="index"
        class="issue-item flex items-start p-3 mb-3 last:mb-0 rounded-lg border"
        :class="{
          'bg-red-500/10 border-red-500/20': issue.type === 'error',
          'bg-yellow-500/10 border-yellow-500/20': issue.type === 'warning'
        }"
      >
        <i
          class="flex-shrink-0 mt-1 text-xl"
          :class="{
            'i-ri-close-circle-fill text-red-500': issue.type === 'error',
            'i-ri-alert-fill text-yellow-500': issue.type === 'warning'
          }"
        />
        <div class="ml-3 min-w-0 flex-1">
          <p class="font-bold text-sm text-gray-900 dark:text-gray-100">
            {{ display.title }}
          </p>
          <p v-if="display.advice" class="mt-1 text-sm text-gray-700 dark:text-gray-300">
            {{ display.advice }}
          </p>
          <p v-if="issue.source" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ t('plugin.issues.source', { source: issue.source }) }}
          </p>
          <p
            v-if="display.detail"
            class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 break-words"
          >
            {{ display.detail }}
          </p>
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
