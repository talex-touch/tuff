<script setup lang="ts">
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import type { TerminalSessionHandle } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTerminal } from '@talex-touch/tuffex/terminal'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTerminalSdk } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '~/utils/renderer-log'

defineOptions({ name: 'TerminalTemplate' })
const props = defineProps<{ title?: string; command: string; args?: string[] }>()
const { t } = useI18n()
const sdk = createTerminalSdk(useTuffTransport())
const log = createRendererLogger('TerminalTemplate')
const terminal = ref<TerminalInstance | null>(null)
const launching = ref(false)
const running = ref(false)
const failed = ref(false)
let session: TerminalSessionHandle | null = null
let controller: AbortController | null = null
let generation = 0

function writeOutput(data: string): void {
  const view = terminal.value
  if (!view) return
  void view.write(data).catch(() => {
    if (terminal.value === view) log.error('Failed to display command output')
  })
}

function resize(size: TerminalSize): void {
  void session?.resize(size.cols, size.rows).catch(() => {
    log.error('Failed to resize command terminal')
  })
}

function input(data: string): void {
  void session?.write(data).catch(() => {
    log.error('Failed to write command terminal input')
  })
}

async function start(): Promise<void> {
  if (launching.value || running.value) return
  const current = ++generation
  controller = new AbortController()
  launching.value = true
  failed.value = false
  terminal.value?.reset()
  let exited = false
  const size = terminal.value?.getSize()
  try {
    const created = await sdk.create(
      { command: props.command, args: props.args, cols: size?.cols ?? 80, rows: size?.rows ?? 24 },
      {
        signal: controller.signal,
        onData: (data) => {
          if (current === generation) writeOutput(data)
        },
        onExit: (exit) => {
          if (current !== generation) return
          exited = true
          running.value = false
          session = null
          writeOutput(
            `\r\n${t('terminal.exit', { code: exit.exitCode ?? exit.signal ?? t('terminal.closed') })}\r\n`
          )
        }
      }
    )
    if (current !== generation) {
      await created.close()
      return
    }
    if (!exited) {
      session = created
      running.value = true
      await nextTick()
      if (current !== generation) return
      const fitted = terminal.value?.getSize()
      if (fitted) resize(fitted)
      terminal.value?.focus()
    }
  } catch {
    if (current === generation) {
      failed.value = true
      log.error('Failed to start command terminal')
    }
  } finally {
    if (current === generation) launching.value = false
  }
}

async function stop(): Promise<void> {
  generation += 1
  controller?.abort()
  controller = null
  const current = session
  session = null
  launching.value = false
  running.value = false
  await current?.close().catch(() => {
    log.error('Failed to close command terminal')
  })
}

onBeforeUnmount(() => {
  void stop()
})
</script>

<template>
  <section class="TerminalTemplate-Container">
    <header class="TerminalTemplate-Header">
      <h3>{{ title ?? t('terminal.title') }}</h3>
      <TxButton size="sm" :loading="launching" :disabled="running" @click="start">
        {{ t('terminal.start') }}
      </TxButton>
      <TxButton v-if="running || launching" size="sm" variant="ghost" @click="stop">
        {{ t('terminal.stop') }}
      </TxButton>
    </header>
    <p v-if="failed" role="alert">{{ t('terminal.failed') }}</p>
    <TxTerminal
      ref="terminal"
      class="TerminalTemplate-Content"
      :read-only="!running"
      @data="input"
      @resize="resize"
    />
  </section>
</template>

<style scoped lang="scss">
.TerminalTemplate-Container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 320px;
  color: var(--tx-text-color-primary);
}
.TerminalTemplate-Header {
  display: flex;
  align-items: center;
  gap: 8px;
  h3 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
}
.TerminalTemplate-Content {
  width: 100%;
  height: 260px;
  border-radius: 8px;
}
</style>
