<script setup lang="ts">
import type {
  ScreenshotEditorAction,
  ScreenshotEditorState
} from '@talex-touch/utils/transport/events/screenshot-session'
import { ScreenshotSessionEvents } from '@talex-touch/utils/transport/events/screenshot-session'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useI18n } from 'vue-i18n'

const transport = useTuffTransport()
const { t } = useI18n()
const state = ref<ScreenshotEditorState | null>(null)
const busyAction = ref<ScreenshotEditorAction | null>(null)
const errorCode = ref('')

async function runAction(action: ScreenshotEditorAction): Promise<void> {
  if (!state.value || busyAction.value) return
  busyAction.value = action
  errorCode.value = ''
  try {
    const result = await transport.send(ScreenshotSessionEvents.editor.action, {
      sessionId: state.value.sessionId,
      action
    })
    if (!result.accepted) {
      errorCode.value = result.reason ?? 'command-rejected'
      busyAction.value = null
      return
    }
    if (action === 'copy' || action === 'save') busyAction.value = null
  } catch {
    errorCode.value = 'transport-failed'
    busyAction.value = null
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    void runAction('cancel')
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void runAction('quick-save')
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  try {
    state.value = await transport.send(ScreenshotSessionEvents.editor.ready, undefined)
  } catch {
    errorCode.value = 'editor-unavailable'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main class="screenshot-editor-shell">
    <header class="editor-header">
      <span class="editor-title">{{ t('screenshot.editor.title') }}</span>
      <button
        type="button"
        class="icon-button"
        :title="t('screenshot.editor.cancel')"
        @click="runAction('cancel')"
      >
        <i class="i-ri-close-line" />
      </button>
    </header>

    <section class="preview-surface">
      <img v-if="state?.resource.tfileUrl" :src="state.resource.tfileUrl" alt="" />
      <span v-else class="preview-loading"><i class="i-ri-loader-4-line" /></span>
    </section>

    <nav class="editor-tools" :aria-label="t('screenshot.editor.tools')">
      <button type="button" disabled :title="t('screenshot.editor.annotation')">
        <i class="i-ri-mark-pen-line" />
      </button>
      <button type="button" disabled :title="t('screenshot.editor.longCapture')">
        <i class="i-ri-scroll-to-bottom-line" />
      </button>
      <button type="button" disabled :title="t('screenshot.editor.ocr')">
        <i class="i-ri-text-snippet" />
      </button>
      <button type="button" disabled :title="t('screenshot.editor.pin')">
        <i class="i-ri-pushpin-line" />
      </button>
    </nav>

    <footer class="editor-actions">
      <output v-if="errorCode" aria-live="polite">{{ t(`screenshot.errors.${errorCode}`) }}</output>
      <span class="action-spacer" />
      <button
        type="button"
        :disabled="!state || Boolean(busyAction)"
        :title="t('screenshot.editor.copy')"
        @click="runAction('copy')"
      >
        <i class="i-ri-file-copy-line" />
        <span>{{ t('screenshot.editor.copy') }}</span>
      </button>
      <button
        type="button"
        :disabled="!state || Boolean(busyAction)"
        :title="t('screenshot.editor.save')"
        @click="runAction('save')"
      >
        <i class="i-ri-save-line" />
        <span>{{ t('screenshot.editor.save') }}</span>
      </button>
      <button
        type="button"
        class="primary"
        :disabled="!state || Boolean(busyAction)"
        :title="t('screenshot.editor.done')"
        @click="runAction('complete')"
      >
        <i class="i-ri-check-line" />
        <span>{{ t('screenshot.editor.done') }}</span>
      </button>
    </footer>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111315 !important;
}

.screenshot-editor-shell {
  --screenshot-primary: var(--tx-color-primary, #409eff);
  --screenshot-primary-dark: var(--tx-color-primary-dark-2, #337ecc);
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr) 52px;
  width: 100%;
  height: 100%;
  background: #111315;
  color: #e2e8f0;
  letter-spacing: 0;
}

.editor-header,
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-color: rgba(148, 163, 184, 0.16);
  background: #171a1d;
}

.editor-header {
  border-bottom-width: 1px;
  border-bottom-style: solid;
  -webkit-app-region: drag;
}

.editor-title {
  font-size: 12px;
  font-weight: 650;
}

.editor-header button,
.editor-actions button {
  -webkit-app-region: no-drag;
}

.editor-header .icon-button {
  margin-left: auto;
}

.preview-surface {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  padding: 24px 68px;
  overflow: auto;
  background: #0c0e10;
}

.preview-surface img {
  max-width: 100%;
  max-height: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.36);
  object-fit: contain;
}

.preview-loading {
  color: #64748b;
  font-size: 24px;
}

.editor-tools {
  position: absolute;
  z-index: 4;
  top: 56px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: #171a1d;
}

.editor-tools button,
.icon-button {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #cbd5e1;
  font-size: 16px;
}

.editor-tools button:disabled {
  color: #475569;
  cursor: not-allowed;
}

.editor-actions {
  border-top-width: 1px;
  border-top-style: solid;
}

.editor-actions output {
  color: #fca5a5;
  font-size: 11px;
}

.action-spacer {
  flex: 1;
}

.editor-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 4px;
  background: #24292e;
  color: #e2e8f0;
  font-size: 12px;
  cursor: pointer;
}

.editor-actions button.primary {
  border-color: var(--screenshot-primary-dark);
  background: var(--screenshot-primary-dark);
  color: #fff;
}

.editor-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
</style>
