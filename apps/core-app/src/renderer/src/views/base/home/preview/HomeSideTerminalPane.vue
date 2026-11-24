<script lang="ts" name="HomeSideTerminalPane" setup>
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import type { TerminalSessionHandle } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { TxTerminal } from '@talex-touch/tuffex/terminal'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTerminalSdk } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccessibilitySupport } from '~/modules/platform/accessibility-support'
import { createRendererLogger } from '~/utils/renderer-log'

const props = defineProps<{
  cwd?: string
  active: boolean
}>()

const { t } = useI18n()
const log = createRendererLogger('HomeSideTerminalPane')
const transport = isElectronRenderer() ? useTuffTransport() : null
const sdk = transport ? createTerminalSdk(transport) : null
const screenReaderMode = useAccessibilitySupport()

const terminalView = ref<TerminalInstance | null>(null)
const running = ref(false)
const starting = ref(false)
let session: TerminalSessionHandle | null = null
let controller: AbortController | null = null
let generation = 0

function writeOutput(data: string): Promise<void> {
  const view = terminalView.value
  if (!view) return Promise.resolve()
  return view.write(data).catch((error) => {
    log.error('Failed to write output to side terminal view', { error })
  })
}

async function startSession(): Promise<void> {
  if (!sdk || starting.value || running.value) return
  const current = ++generation
  controller = new AbortController()
  starting.value = true

  const view = terminalView.value
  const size = view?.getSize()
  const cols = size?.cols ?? 80
  const rows = size?.rows ?? 24

  try {
    const handle = await sdk.create(
      {
        cols,
        rows,
        ...(props.cwd ? { cwd: props.cwd } : {})
      },
      {
        signal: controller.signal,
        awaitDisplay: true,
        onData: (data) => {
          if (current === generation) {
            void writeOutput(data)
          }
        },
        onExit: (exit) => {
          if (current !== generation) return
          running.value = false
          session = null
          const code = exit.exitCode ?? exit.signal ?? 0
          void writeOutput(`\r\n\x1b[90m[${t('terminal.exit', { code })}]\x1b[0m\r\n`)
        }
      }
    )

    if (current !== generation) {
      await handle.close().catch(() => {})
      return
    }

    session = handle
    running.value = true
    await nextTick()
    terminalView.value?.fit()
    if (props.active) terminalView.value?.focus()
  } catch (error) {
    if (current === generation) {
      log.error('Failed to spawn side terminal process', { error })
      void writeOutput(`\r\n\x1b[31m${t('terminal.failed')}: ${String(error)}\x1b[0m\r\n`)
    }
  } finally {
    if (current === generation) {
      starting.value = false
    }
  }
}

async function stopSession(): Promise<void> {
  generation += 1
  controller?.abort()
  controller = null
  const current = session
  session = null
  starting.value = false
  running.value = false
  await current?.close().catch(() => {})
}

async function restartSession(): Promise<void> {
  await stopSession()
  terminalView.value?.reset()
  await startSession()
}

function clearTerminal(): void {
  terminalView.value?.clear()
  terminalView.value?.focus()
}

function handleTerminalInput(data: string): void {
  if (!session || !running.value) return
  void session.write(data).catch((error) => {
    log.error('Failed to send input to side terminal session', { error })
  })
}

function handleTerminalResize(size: TerminalSize): void {
  if (!session || !running.value) return
  void session.resize(size.cols, size.rows).catch(() => {})
}

function handleTerminalReady(instance: TerminalInstance): void {
  terminalView.value = instance
  if (!session && !starting.value) {
    void startSession()
  } else {
    instance.fit()
    if (props.active) instance.focus()
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      void nextTick(() => {
        terminalView.value?.fit()
        terminalView.value?.focus()
      })
    }
  }
)

onBeforeUnmount(() => {
  void stopSession()
})
</script>

<template>
  <div class="HomeSideTerminalPane">
    <header class="HomeSideTerminalPane-Header">
      <div class="HomeSideTerminalPane-Meta">
        <span
          class="HomeSideTerminalPane-Dot"
          :class="{ 'is-running': running, 'is-starting': starting }"
          aria-hidden="true"
        />
        <span class="HomeSideTerminalPane-Cwd" :title="cwd || t('terminal.title')">
          {{ cwd || t('terminal.title') }}
        </span>
      </div>
      <div class="HomeSideTerminalPane-Actions">
        <button
          type="button"
          class="HomeSideTerminalPane-Btn"
          :title="t('terminal.clear')"
          :aria-label="t('terminal.clear')"
          @click="clearTerminal"
        >
          <span class="i-ri-eraser-line" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="HomeSideTerminalPane-Btn"
          :title="t('terminal.restart')"
          :aria-label="t('terminal.restart')"
          @click="restartSession"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
        </button>
      </div>
    </header>
    <div class="HomeSideTerminalPane-Body">
      <TxTerminal
        ref="terminalView"
        class="HomeSideTerminalPane-Terminal"
        :read-only="false"
        :auto-focus="true"
        :auto-scroll="true"
        :screen-reader-mode="screenReaderMode"
        @ready="handleTerminalReady"
        @data="handleTerminalInput"
        @resize="handleTerminalResize"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeSideTerminalPane {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
}

.HomeSideTerminalPane-Header {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.HomeSideTerminalPane-Meta {
  display: flex;
  flex: 1 1 auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.HomeSideTerminalPane-Dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--shell-text-muted);

  &.is-running {
    background: var(--shell-success);
  }

  &.is-starting {
    background: var(--shell-warning);
  }
}

.HomeSideTerminalPane-Cwd {
  overflow: hidden;
  color: var(--shell-text-secondary);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideTerminalPane-Actions {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
}

.HomeSideTerminalPane-Btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.HomeSideTerminalPane-Body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.HomeSideTerminalPane-Terminal {
  width: 100%;
  height: 100%;

  :deep(.tx-terminal) {
    min-height: 0;
    height: 100%;
    padding: 8px 10px;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    background-color: transparent !important;
  }
}
</style>
