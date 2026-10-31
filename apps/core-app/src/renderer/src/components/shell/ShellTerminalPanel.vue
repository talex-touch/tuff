<script lang="ts" setup name="ShellTerminalPanel">
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import type { TerminalSessionHandle } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxTerminal } from '@talex-touch/tuffex/terminal'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTerminalSdk } from '@talex-touch/utils/transport/sdk/domains/terminal'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShellTerminal } from '~/modules/layout/useShellTerminal'
import { useAccessibilitySupport } from '~/modules/platform/accessibility-support'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { mainWindowCommandChordLabel } from '~/modules/shortcuts/main-window-command-catalog'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const log = createRendererLogger('ShellTerminalPanel')
const { isMac } = useRendererPlatform()
const transport = useTuffTransport()
const sdk = createTerminalSdk(transport)
const screenReaderMode = useAccessibilitySupport()
const {
  terminalOpen,
  terminalHeight,
  isResizingTerminal,
  startResize,
  closeTerminal
} = useShellTerminal()

const terminalView = ref<TerminalInstance | null>(null)
const running = ref(false)
const starting = ref(false)
let session: TerminalSessionHandle | null = null
let controller: AbortController | null = null
let generation = 0

const shortcutLabel = computed(() => mainWindowCommandChordLabel('toggle-terminal', isMac.value))

function writeOutput(data: string): Promise<void> {
  const view = terminalView.value
  if (!view) return Promise.resolve()
  return view.write(data).catch((error) => {
    log.error('Failed to write output to terminal view', { error })
  })
}

async function startSession(): Promise<void> {
  if (starting.value || running.value) return
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
        rows
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
    terminalView.value?.focus()
  } catch (error) {
    if (current === generation) {
      log.error('Failed to spawn terminal process', { error })
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
    log.error('Failed to send input to terminal session', { error })
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
    instance.focus()
  }
}

watch(terminalOpen, (open) => {
  if (open) {
    nextTick(() => {
      terminalView.value?.fit()
      terminalView.value?.focus()
    })
  }
})

onBeforeUnmount(() => {
  void stopSession()
})
</script>

<template>
  <section
    class="ShellTerminalPanel"
    :class="{ 'is-resizing': isResizingTerminal }"
    :style="{ height: `${terminalHeight}px` }"
    role="region"
    :aria-label="t('terminal.title')"
  >
    <!-- Top resize handle -->
    <div
      class="ShellTerminalPanel-Resizer"
      :class="{ 'is-resizing': isResizingTerminal }"
      role="separator"
      aria-orientation="horizontal"
      tabindex="-1"
      @pointerdown="startResize"
    />

    <!-- Header bar -->
    <header class="ShellTerminalPanel-Header">
      <div class="ShellTerminalPanel-TitleGroup">
        <span class="i-ri-terminal-box-line ShellTerminalPanel-Icon" aria-hidden="true" />
        <span class="ShellTerminalPanel-Title">{{ t('terminal.title') }}</span>
        <span
          class="ShellTerminalPanel-StatusDot"
          :class="{
            'is-running': running,
            'is-starting': starting,
            'is-stopped': !running && !starting
          }"
          :title="starting ? t('terminal.start') : running ? t('terminal.running') : t('terminal.closed')"
          aria-hidden="true"
        />
        <TxKbd v-if="shortcutLabel" class="ShellTerminalPanel-ShortcutBadge">
          {{ shortcutLabel }}
        </TxKbd>
      </div>

      <div class="ShellTerminalPanel-Actions">
        <button
          class="ShellTerminalPanel-ActionBtn"
          type="button"
          :title="t('terminal.clear')"
          :aria-label="t('terminal.clear')"
          @click="clearTerminal"
        >
          <span class="i-ri-eraser-line" aria-hidden="true" />
        </button>

        <button
          class="ShellTerminalPanel-ActionBtn"
          type="button"
          :title="t('terminal.restart')"
          :aria-label="t('terminal.restart')"
          @click="restartSession"
        >
          <span class="i-ri-refresh-line" :class="{ 'is-spin': starting }" aria-hidden="true" />
        </button>

        <button
          class="ShellTerminalPanel-ActionBtn ShellTerminalPanel-CloseBtn"
          type="button"
          :title="t('shortcuts.commands.toggleTerminal')"
          :aria-label="t('shortcuts.commands.toggleTerminal')"
          @click="closeTerminal"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- Terminal view -->
    <div class="ShellTerminalPanel-Body">
      <TxTerminal
        ref="terminalView"
        class="ShellTerminalPanel-Terminal"
        :read-only="false"
        :auto-focus="true"
        :auto-scroll="true"
        :screen-reader-mode="screenReaderMode"
        @ready="handleTerminalReady"
        @data="handleTerminalInput"
        @resize="handleTerminalResize"
      />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ShellTerminalPanel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--shell-bg);
  border-top: 1px solid var(--shell-border);
  z-index: 10;
  -webkit-app-region: no-drag;

  &.is-resizing {
    user-select: none;
  }
}

.ShellTerminalPanel-Resizer {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 20;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--shell-primary, #2b7fd9);
    opacity: 0;
    transition: opacity 150ms ease;
  }

  &:hover::after,
  &.is-resizing::after {
    opacity: 0.8;
  }
}

.ShellTerminalPanel-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 12px;
  box-sizing: border-box;
  background: var(--shell-surface);
  border-bottom: 1px solid var(--shell-border);
  flex-shrink: 0;
}

.ShellTerminalPanel-TitleGroup {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--shell-text-regular);
}

.ShellTerminalPanel-Icon {
  font-size: 14px;
  color: var(--shell-text-secondary);
}

.ShellTerminalPanel-Title {
  user-select: none;
}

.ShellTerminalPanel-StatusDot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--shell-text-muted);
  transition: background-color 200ms ease;

  &.is-running {
    background: var(--shell-success, #26794e);
  }

  &.is-starting {
    background: var(--shell-warning, #946210);
  }

  &.is-stopped {
    background: var(--shell-text-muted);
  }
}

.ShellTerminalPanel-ShortcutBadge {
  font-size: 10px;
  opacity: 0.75;
}

.ShellTerminalPanel-Actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ShellTerminalPanel-ActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm, 6px);
  background: transparent;
  color: var(--shell-text-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;

  &:hover {
    background: var(--shell-surface-2, rgba(0, 0, 0, 0.05));
    color: var(--shell-text-primary);
  }

  &:active {
    transform: scale(0.95);
  }

  .is-spin {
    animation: terminal-spin 1s linear infinite;
  }
}

@keyframes terminal-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ShellTerminalPanel-Body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-bg);
}

.ShellTerminalPanel-Terminal {
  width: 100%;
  height: 100%;

  :deep(.tx-terminal) {
    min-height: 0;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
    padding: 6px 12px;
  }

  :deep(.xterm) {
    height: 100%;
  }

  :deep(.xterm-viewport) {
    background-color: transparent !important;
  }
}
</style>
