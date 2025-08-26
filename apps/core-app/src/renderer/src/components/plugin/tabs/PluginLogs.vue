<template>
  <div class="plugin-logs-root w-full h-full flex flex-col">
    <div class="flex-1 rounded-lg overflow-hidden">
      <LogTerminal :logs="terminalLogs" />
    </div>
    <TDrawer v-model:visible="showHistory" title="历史记录">
      <div v-if="logSessions.length" class="p-4">
        <ul>
          <li
            v-for="session in logSessions"
            :key="session"
            class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md cursor-pointer transition-colors duration-200"
            @click="openLogFile(session)"
          >
            <span class="font-mono text-sm">{{ session }}</span>
          </li>
        </ul>
      </div>
      <div v-else class="flex items-center justify-center h-full text-gray-500">
        <p>暂无历史日志</p>
      </div>
    </TDrawer>
  </div>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, watch } from 'vue'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { formatLogForTerminal } from '@renderer/utils/log-formatter'
import LogTerminal from '@comp/terminal/LogTerminal.vue'
import TDrawer from '@comp/base/dialog/TDrawer.vue'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const touchSdk = useTouchSDK()
const terminalLogs = ref<string[]>([])
const logSessions = ref<string[]>([])
const showHistory = ref(false)
let unsubscribeLogStream: (() => void) | null = null

const openHistoryDrawer = (): void => {
  showHistory.value = true
}

const openLogFile = (session: string): void => {
  console.log(`[PluginLogs] Requesting to open log session: ${session} for ${props.plugin.name}`)
  touchSdk.rawChannel.send('plugin-log:open-session-file', {
    pluginName: props.plugin.name,
    session: session
  })
  showHistory.value = false // Close drawer after selection
}

const handleLogStream = (log: LogItem, currentPluginName: string): void => {
  if (log.plugin !== currentPluginName) return
  terminalLogs.value = [...terminalLogs.value, formatLogForTerminal(log)]
}

const cleanup = (): void => {
  const pluginName = props.plugin.name
  if (!pluginName) return
  console.log(`[PluginLogs] Cleaning up for plugin: ${pluginName}`)
  if (unsubscribeLogStream) {
    unsubscribeLogStream()
    unsubscribeLogStream = null
  }
  touchSdk.rawChannel.send('plugin-log:unsubscribe', { pluginName })
}

const initialize = async (pluginName: string): Promise<void> => {
  if (!pluginName) return

  console.log(`[PluginLogs] Initializing for plugin: ${pluginName}`)
  cleanup() // Clean up previous subscriptions before initializing

  terminalLogs.value = []
  logSessions.value = []

  // Get current session buffer
  console.log(`[PluginLogs] Getting log buffer for ${pluginName}...`)
  const buffer: LogItem[] = await touchSdk.rawChannel.send('plugin-log:get-buffer', { pluginName })
  terminalLogs.value = buffer.map(formatLogForTerminal)
  console.log(`[PluginLogs] Received ${buffer.length} logs from buffer.`)

  // Get historical sessions
  console.log(`[PluginLogs] Getting historical sessions for ${pluginName}...`)
  const sessions: string[] = await touchSdk.rawChannel.send('plugin-log:get-sessions', {
    pluginName
  })
  logSessions.value = sessions
  console.log(`[PluginLogs] Received ${sessions.length} historical sessions.`, sessions)

  // Subscribe to live logs
  console.log(`[PluginLogs] Subscribing to live log stream for ${pluginName}...`)
  touchSdk.rawChannel.send('plugin-log:subscribe', { pluginName })
  unsubscribeLogStream = touchSdk.onChannelEvent('plugin-log-stream', (log: LogItem) => {
    // Pass the current pluginName to the handler to avoid closure issues
    handleLogStream(log, pluginName)
  })
}

watch(
  () => props.plugin,
  (newPlugin) => {
    initialize(newPlugin.name)
  },
  { immediate: true } // immediate: true will run the handler on component mount
)

onUnmounted(() => {
  cleanup()
})

defineExpose({
  openHistoryDrawer
})
</script>
