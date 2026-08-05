<script lang="ts" name="ShellWindowControls" setup>
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Windows / Linux window buttons, drawn by the shell and floated over the top-right corner.
 *
 * Replaces Electron's `titleBarOverlay`: that one is painted by the OS, so it cannot follow the
 * dark or high-contrast themes, and the layout has no way to learn how wide it is. Pages keep
 * clear of these buttons through `--shell-window-controls-inset` instead.
 */
const { t } = useI18n()
const transport = useTuffTransport()

const isMaximized = ref(false)
let disposeMaximizedListener: (() => void) | null = null

function minimize(): void {
  transport.send(AppEvents.window.minimize).catch(() => {})
}

function toggleMaximize(): void {
  transport
    .send(AppEvents.window.toggleMaximize)
    .then((next) => {
      if (typeof next === 'boolean') isMaximized.value = next
    })
    .catch(() => {})
}

function close(): void {
  transport.send(AppEvents.window.close).catch(() => {})
}

onMounted(async () => {
  // The broadcast also covers the state changes this component never triggers — double-clicking
  // the drag region, the OS shortcut, snapping the window to a screen edge.
  disposeMaximizedListener = transport.on(AppEvents.window.maximizedChanged, (maximized) => {
    isMaximized.value = maximized === true
  })

  try {
    isMaximized.value = (await transport.send(AppEvents.window.isMaximized)) === true
  } catch {
    isMaximized.value = false
  }
})

onBeforeUnmount(() => {
  disposeMaximizedListener?.()
  disposeMaximizedListener = null
})
</script>

<template>
  <div class="ShellWindowControls">
    <button
      class="ShellWindowControls-Button"
      type="button"
      :aria-label="t('shell.minimizeWindow')"
      :title="t('shell.minimizeWindow')"
      @click="minimize"
    >
      <span class="i-ri-subtract-line" />
    </button>
    <button
      class="ShellWindowControls-Button"
      type="button"
      :aria-label="isMaximized ? t('shell.restoreWindow') : t('shell.maximizeWindow')"
      :title="isMaximized ? t('shell.restoreWindow') : t('shell.maximizeWindow')"
      @click="toggleMaximize"
    >
      <span :class="isMaximized ? 'i-ri-file-copy-line' : 'i-ri-checkbox-blank-line'" />
    </button>
    <button
      class="ShellWindowControls-Button is-close"
      type="button"
      :aria-label="t('shell.closeWindow')"
      :title="t('shell.closeWindow')"
      @click="close"
    >
      <span class="i-ri-close-line" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.ShellWindowControls {
  // Above the routed view (`.AppShell-View` is z-index 1) and the sidebar (10), so a maximized
  // window with a wide page still exposes the buttons.
  z-index: 20;
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  -webkit-app-region: no-drag;
}

.ShellWindowControls-Button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-close:hover {
    background: #e81123;
    color: #ffffff;
  }
}
</style>
