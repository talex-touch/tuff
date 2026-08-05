<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxMarkdownView } from '@talex-touch/tuffex/markdown-view'
import type {
  LocalAiCliAccess,
  LocalAiCliApprovalRequest,
  LocalAiCliContextItem,
  LocalAiCliProviderId,
  LocalAiCliStatus,
  LocalAiCliTaskChunk
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { createLocalAiCliSdk } from '@talex-touch/utils/transport/sdk/domains/local-ai-cli'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { FitAddon } from 'xterm-addon-fit'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { OmniPanelDesktopContextCapsule } from '../../../../../shared/events/omni-panel'
import { createRendererLogger } from '../../../utils/renderer-log'

interface OpenDraft {
  prompt: string
  capsule?: OmniPanelDesktopContextCapsule
}

interface ContextChip extends LocalAiCliContextItem {
  label: string
}

const emit = defineEmits<{
  close: []
  'settings-opened': []
  'paste-back-started': []
}>()

const { t } = useI18n()
const sdk = createLocalAiCliSdk(useTuffTransport())
const log = createRendererLogger('LocalAiCliPanel')

const visible = ref(false)
const status = ref<LocalAiCliStatus | null>(null)
const prompt = ref('')
const provider = ref<LocalAiCliProviderId | ''>('')
const access = ref<LocalAiCliAccess>('answer-only')
const contexts = ref<ContextChip[]>([])
const draftCapsule = ref<OmniPanelDesktopContextCapsule | undefined>(undefined)
const phase = ref<'idle' | 'running' | 'done' | 'failed' | 'cancelled'>('idle')
const output = ref('')
const errorCode = ref('')
const nativeSessionId = ref<string | undefined>(undefined)
const approval = ref<LocalAiCliApprovalRequest | null>(null)
const terminalHost = ref<HTMLElement | null>(null)
const terminalSessionId = ref<string | null>(null)
let streamController: { cancel: () => void } | null = null
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let terminalInputDispose: { dispose: () => void } | null = null

const runnableProviders = computed(() =>
  (status.value?.providers ?? []).filter(
    (item) => item.installed && item.enabled && item.capabilities.taskRead
  )
)
const selectedProviderStatus = computed(() =>
  status.value?.providers.find((item) => item.id === provider.value)
)
const canRun = computed(
  () =>
    status.value?.enabled === true &&
    Boolean(provider.value) &&
    prompt.value.trim().length > 0 &&
    phase.value !== 'running'
)
const canPasteBack = computed(
  () =>
    phase.value === 'done' && Boolean(output.value.trim() && draftCapsule.value?.appName?.trim())
)
const canOpenTerminal = computed(
  () =>
    phase.value === 'done' &&
    selectedProviderStatus.value?.capabilities.terminalRead === true &&
    !terminalSessionId.value
)
watch(provider, () => {
  if (
    access.value === 'workspace-write' &&
    !selectedProviderStatus.value?.capabilities.taskWriteApproval
  ) {
    access.value = 'workspace-read'
  }
})

const templates = computed(() => [
  {
    label: t('localAiCliPanel.templates.summarize'),
    value: t('localAiCliPanel.prompts.summarize')
  },
  { label: t('localAiCliPanel.templates.explain'), value: t('localAiCliPanel.prompts.explain') },
  { label: t('localAiCliPanel.templates.rewrite'), value: t('localAiCliPanel.prompts.rewrite') },
  { label: t('localAiCliPanel.templates.nextSteps'), value: t('localAiCliPanel.prompts.nextSteps') }
])

function buildContexts(capsule?: OmniPanelDesktopContextCapsule): ContextChip[] {
  if (!capsule) return []
  const items: ContextChip[] = []
  if (capsule.selectionText?.trim()) {
    items.push({
      kind: 'selection',
      text: capsule.selectionText.trim(),
      label: t('localAiCliPanel.context.selection')
    })
  }
  if (capsule.clipboardText?.trim()) {
    items.push({
      kind: 'clipboard',
      text: capsule.clipboardText.trim(),
      label: t('localAiCliPanel.context.clipboard')
    })
  }
  if (capsule.appName?.trim()) {
    items.push({
      kind: 'active-app',
      text: capsule.appName.trim(),
      label: t('localAiCliPanel.context.activeApp')
    })
  }
  if (capsule.windowTitle?.trim()) {
    items.push({
      kind: 'active-window',
      text: capsule.windowTitle.trim(),
      label: t('localAiCliPanel.context.activeWindow')
    })
  }
  return items
}

async function refreshStatus(): Promise<void> {
  status.value = await sdk.getStatus()
  const configured = status.value.defaultProvider
  const next =
    runnableProviders.value.find((item) => item.id === configured) ?? runnableProviders.value[0]
  if (!runnableProviders.value.some((item) => item.id === provider.value)) {
    provider.value = next?.id ?? ''
  }
}

function handleWindowFocus(): void {
  if (!visible.value) return
  void refreshStatus().catch((error) => {
    log.error('Failed to refresh local AI CLI status after focus', error)
  })
}

async function open(draft: OpenDraft): Promise<void> {
  visible.value = true
  if (!prompt.value.trim()) prompt.value = draft.prompt
  if (!draftCapsule.value) draftCapsule.value = draft.capsule
  if (contexts.value.length === 0) contexts.value = buildContexts(draft.capsule)
  try {
    await refreshStatus()
    if (!status.value?.enabled || runnableProviders.value.length === 0) {
      emit('settings-opened')
      await sdk.openSettings()
    }
  } catch (error) {
    log.error('Failed to prepare local AI CLI panel', error)
    phase.value = 'failed'
    errorCode.value = 'LOCAL_AI_CLI_STATUS_FAILED'
  }
}

function applyTemplate(prefix: string): void {
  const body = prompt.value.trim()
  prompt.value = body ? `${prefix}\n\n${body}` : prefix
}

function handleChunk(chunk: LocalAiCliTaskChunk): void {
  switch (chunk.type) {
    case 'session':
      nativeSessionId.value = chunk.nativeSessionId
      return
    case 'status':
      return
    case 'text-delta':
      output.value += chunk.text
      return
    case 'approval':
      approval.value = chunk.approval
      return
    case 'complete':
      output.value = chunk.text || output.value
      phase.value = 'done'
      return
    case 'failed':
      errorCode.value = chunk.code
      phase.value = 'failed'
      return
    case 'cancelled':
      phase.value = 'cancelled'
  }
}

async function run(): Promise<void> {
  if (!canRun.value || !provider.value) return
  cleanupTask()
  phase.value = 'running'
  output.value = ''
  errorCode.value = ''
  nativeSessionId.value = undefined
  approval.value = null
  try {
    streamController = await sdk.streamTask(
      {
        provider: provider.value,
        prompt: prompt.value,
        access: access.value,
        context: contexts.value.map(({ kind, text }) => ({ kind, text }))
      },
      {
        onData: handleChunk,
        onError: (error) => {
          log.error('Local AI CLI task stream failed', error)
          if (phase.value === 'running') phase.value = 'failed'
        },
        onEnd: () => {
          streamController = null
          if (phase.value === 'running') phase.value = output.value ? 'done' : 'failed'
        }
      }
    )
  } catch (error) {
    log.error('Failed to start local AI CLI task', error)
    phase.value = 'failed'
  }
}

function cleanupTask(): void {
  streamController?.cancel()
  streamController = null
}

function stop(): void {
  cleanupTask()
  if (phase.value === 'running') phase.value = 'cancelled'
}

async function resolveApproval(decision: 'allow-once' | 'deny'): Promise<void> {
  const current = approval.value
  if (!current) return
  try {
    await sdk.resolveApproval({ approvalId: current.approvalId, decision })
  } finally {
    approval.value = null
  }
}

async function copyResult(): Promise<void> {
  const text = output.value.trim()
  if (!text) return
  await navigator.clipboard.writeText(text)
  toast.success(t('localAiCliPanel.copied'))
}

async function pasteBack(): Promise<void> {
  const capsule = draftCapsule.value
  const text = output.value.trim()
  if (!capsule?.appName?.trim() || !text) return
  emit('paste-back-started')
  const result = await sdk.pasteBack({
    text,
    appName: capsule.appName.trim(),
    windowTitle: capsule.windowTitle?.trim() || undefined,
    capturedAt: capsule.capturedAt
  })
  if (result.success) {
    toast.success(t('localAiCliPanel.pastedBack'))
    await reset()
    return
  }
  toast.error(t(`localAiCliPanel.pasteBackReasons.${result.reason ?? 'target-unavailable'}`))
}

async function openSettings(): Promise<void> {
  emit('settings-opened')
  await sdk.openSettings()
}

async function openTerminal(): Promise<void> {
  if (!provider.value || !canOpenTerminal.value) return
  try {
    const result = await sdk.terminal.create({
      provider: provider.value,
      access: access.value,
      nativeSessionId: nativeSessionId.value,
      cols: 92,
      rows: 24
    })
    terminalSessionId.value = result.sessionId
    await nextTick()
    terminal = new Terminal({
      cols: 92,
      rows: 24,
      convertEol: true,
      fontSize: 12,
      theme: { background: '#111318' }
    })
    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    if (terminalHost.value) terminal.open(terminalHost.value)
    fitAddon.fit()
    terminalInputDispose = terminal.onData((data) => {
      if (!terminalSessionId.value) return
      void sdk.terminal.write({ sessionId: terminalSessionId.value, data }).catch((error) => {
        log.error('Failed to write local AI CLI terminal input', error)
      })
    })
    if (terminalSessionId.value) {
      await sdk.terminal.resize({
        sessionId: terminalSessionId.value,
        cols: terminal.cols,
        rows: terminal.rows
      })
    }
  } catch (error) {
    log.error('Failed to open local AI CLI terminal', error)
    toast.error(t('localAiCliPanel.terminalFailed'))
  }
}

async function closeTerminal(): Promise<void> {
  const sessionId = terminalSessionId.value
  terminalSessionId.value = null
  terminalInputDispose?.dispose()
  terminalInputDispose = null
  terminal?.dispose()
  terminal = null
  fitAddon = null
  if (sessionId) await sdk.terminal.kill({ sessionId }).catch(() => undefined)
}

async function reset(): Promise<void> {
  visible.value = false
  cleanupTask()
  await closeTerminal()
  prompt.value = ''
  contexts.value = []
  draftCapsule.value = undefined
  output.value = ''
  approval.value = null
  phase.value = 'idle'
}

async function close(): Promise<void> {
  await reset()
  emit('close')
}

const disposeTerminalData = sdk.terminal.onData((payload) => {
  if (payload.sessionId === terminalSessionId.value) terminal?.write(payload.data)
})
const disposeTerminalExit = sdk.terminal.onExit((payload) => {
  if (payload.sessionId !== terminalSessionId.value) return
  terminal?.writeln(`\r\n[exit ${payload.exitCode ?? payload.signal ?? ''}]`)
  terminalSessionId.value = null
})

onMounted(() => {
  window.addEventListener('focus', handleWindowFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowFocus)
  cleanupTask()
  void closeTerminal()
  disposeTerminalData()
  disposeTerminalExit()
})

defineExpose({ open, reset })
</script>

<template>
  <section v-if="visible" class="LocalAiCliPanel">
    <header class="LocalAiCliPanel__header">
      <div>
        <h2>{{ t('localAiCliPanel.title') }}</h2>
        <p>{{ t('localAiCliPanel.subtitle') }}</p>
      </div>
      <button type="button" :aria-label="t('localAiCliPanel.close')" @click="close">
        <span class="i-carbon-close" />
      </button>
    </header>

    <div v-if="!status?.enabled || runnableProviders.length === 0" class="LocalAiCliPanel__empty">
      <p>{{ t('localAiCliPanel.disabled') }}</p>
      <TxButton size="sm" @click="openSettings">{{ t('localAiCliPanel.openSettings') }}</TxButton>
    </div>

    <template v-else>
      <div class="LocalAiCliPanel__controls">
        <select v-model="provider" :aria-label="t('localAiCliPanel.provider')">
          <option v-for="item in runnableProviders" :key="item.id" :value="item.id">
            {{ item.label }} · {{ item.version }}
          </option>
        </select>
        <select v-model="access" :aria-label="t('localAiCliPanel.access')">
          <option value="answer-only">{{ t('localAiCliPanel.answerOnly') }}</option>
          <option value="workspace-read">{{ t('localAiCliPanel.workspaceRead') }}</option>
          <option
            v-if="selectedProviderStatus?.capabilities.taskWriteApproval"
            value="workspace-write"
          >
            {{ t('localAiCliPanel.workspaceWriteApproval') }}
          </option>
        </select>
      </div>

      <div class="LocalAiCliPanel__templates">
        <button
          v-for="item in templates"
          :key="item.label"
          type="button"
          @click="applyTemplate(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <textarea
        v-model="prompt"
        :placeholder="t('localAiCliPanel.placeholder')"
        :disabled="phase === 'running'"
        maxlength="12000"
      />

      <div v-if="contexts.length" class="LocalAiCliPanel__contexts">
        <button
          v-for="(item, index) in contexts"
          :key="`${item.kind}:${index}`"
          type="button"
          :title="item.text"
          @click="contexts.splice(index, 1)"
        >
          {{ item.label }} <span class="i-carbon-close" />
        </button>
      </div>

      <div class="LocalAiCliPanel__actions">
        <TxButton v-if="phase !== 'running'" size="sm" :disabled="!canRun" @click="run">
          {{ t('localAiCliPanel.run') }}
        </TxButton>
        <TxButton v-else size="sm" variant="ghost" @click="stop">
          {{ t('localAiCliPanel.stop') }}
        </TxButton>
        <TxButton size="sm" variant="ghost" :disabled="!output" @click="copyResult">
          {{ t('localAiCliPanel.copy') }}
        </TxButton>
        <TxButton size="sm" variant="ghost" :disabled="!canPasteBack" @click="pasteBack">
          {{ t('localAiCliPanel.pasteBack') }}
        </TxButton>
        <TxButton v-if="canOpenTerminal" size="sm" variant="ghost" @click="openTerminal">
          {{ t('localAiCliPanel.continueInTerminal') }}
        </TxButton>
      </div>

      <div v-if="approval" class="LocalAiCliPanel__approval">
        <strong>{{ approval.toolName }}</strong>
        <span>{{ approval.summary }}</span>
        <div>
          <TxButton size="sm" variant="ghost" @click="resolveApproval('deny')">
            {{ t('localAiCliPanel.deny') }}
          </TxButton>
          <TxButton size="sm" @click="resolveApproval('allow-once')">
            {{ t('localAiCliPanel.allowOnce') }}
          </TxButton>
        </div>
      </div>

      <div v-if="phase !== 'idle'" class="LocalAiCliPanel__result" :class="`is-${phase}`">
        <p v-if="phase === 'running' && !output">{{ t('localAiCliPanel.running') }}</p>
        <p v-else-if="phase === 'failed'">{{ t('localAiCliPanel.failed', { code: errorCode }) }}</p>
        <p v-else-if="phase === 'cancelled'">{{ t('localAiCliPanel.cancelled') }}</p>
        <TxMarkdownView v-if="output" :content="output" theme="auto" />
      </div>

      <div v-show="terminalSessionId" ref="terminalHost" class="LocalAiCliPanel__terminal" />
    </template>
  </section>
</template>

<style scoped lang="scss">
.LocalAiCliPanel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 24%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 92%, transparent);

  &__header,
  &__controls,
  &__actions,
  &__approval > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__header {
    justify-content: space-between;

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 14px;
    }

    p {
      color: var(--tx-text-color-secondary);
      font-size: 12px;
    }

    > button {
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
  }

  &__controls select,
  textarea {
    border: 1px solid color-mix(in srgb, var(--tx-border-color) 75%, transparent);
    border-radius: 9px;
    color: inherit;
    background: color-mix(in srgb, var(--tx-bg-color) 88%, transparent);
  }

  &__controls select {
    min-width: 0;
    padding: 6px 8px;
  }

  textarea {
    min-height: 84px;
    padding: 9px 10px;
    resize: vertical;
    font: inherit;
  }

  &__templates,
  &__contexts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    button {
      padding: 4px 8px;
      border: 0;
      border-radius: 999px;
      color: var(--tx-text-color-secondary);
      background: color-mix(in srgb, var(--tx-color-primary) 9%, transparent);
      cursor: pointer;
    }
  }

  &__result,
  &__approval,
  &__empty {
    padding: 9px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tx-fill-color) 56%, transparent);
  }

  &__approval {
    display: grid;
    gap: 6px;

    > div {
      justify-content: flex-end;
    }
  }

  &__terminal {
    height: 260px;
    overflow: hidden;
    border-radius: 10px;
    background: #111318;
  }
}
</style>
