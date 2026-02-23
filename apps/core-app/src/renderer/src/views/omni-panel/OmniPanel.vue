<script setup lang="ts">
import type { OmniPanelContextPayload } from '../../../../shared/events/omni-panel'
import { CoreBoxOmniPanelKeys } from '@talex-touch/utils/i18n'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { omniPanelContextEvent, omniPanelHideEvent } from '../../../../shared/events/omni-panel'

interface QuickAction {
  id: string
  icon: string
  title: string
  subtitle: string
  shortcut: string
  run: (text: string) => Promise<void>
}

const { t } = useI18n()
const transport = useTuffTransport()
const appSdk = useAppSdk()

const selectedText = ref('')
const hasSelection = ref(false)
const source = ref('manual')
const capturedAt = ref<number | null>(null)
const executingAction = ref<string | null>(null)

const displayText = computed(() => {
  if (hasSelection.value) return selectedText.value
  return t(
    CoreBoxOmniPanelKeys.EMPTY_SELECTION,
    '当前没有捕获到选中文本。先在任意应用中选中文本，再触发全景面板。'
  )
})

async function closePanel(): Promise<void> {
  await transport.send(omniPanelHideEvent)
}

async function openTranslate(text: string): Promise<void> {
  const url = `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(text)}&op=translate`
  await appSdk.openExternal(url)
}

async function openWebSearch(text: string): Promise<void> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`
  await appSdk.openExternal(url)
}

async function copySelection(text: string): Promise<void> {
  await transport.send(ClipboardEvents.write, { type: 'text', value: text })
}

async function searchInCoreBox(text: string): Promise<void> {
  await transport.send(CoreBoxEvents.ui.show)
  await transport.send(CoreBoxEvents.input.setQuery, { value: text })
}

const quickActions = computed<QuickAction[]>(() => [
  {
    id: 'translate',
    icon: 'i-ri-translate-2',
    title: t(CoreBoxOmniPanelKeys.TRANSLATE, '快速翻译'),
    subtitle: t(CoreBoxOmniPanelKeys.TRANSLATE_DESC, '将选中文本发送到翻译页面'),
    shortcut: '⌘↵',
    run: openTranslate
  },
  {
    id: 'search',
    icon: 'i-ri-search-line',
    title: t(CoreBoxOmniPanelKeys.SEARCH, '网页搜索'),
    subtitle: t(CoreBoxOmniPanelKeys.SEARCH_DESC, '用浏览器搜索选中文本'),
    shortcut: '⌘S',
    run: openWebSearch
  },
  {
    id: 'corebox-search',
    icon: 'i-ri-command-line',
    title: t(CoreBoxOmniPanelKeys.COREBOX_SEARCH, '在 CoreBox 中搜索'),
    subtitle: t(CoreBoxOmniPanelKeys.COREBOX_SEARCH_DESC, '回到启动器继续执行动作'),
    shortcut: '⌘K',
    run: searchInCoreBox
  },
  {
    id: 'copy',
    icon: 'i-ri-file-copy-line',
    title: t(CoreBoxOmniPanelKeys.COPY, '复制文本'),
    subtitle: t(CoreBoxOmniPanelKeys.COPY_DESC, '把当前文本写回剪贴板'),
    shortcut: '⌘C',
    run: copySelection
  }
])

async function executeAction(action: QuickAction): Promise<void> {
  if (!hasSelection.value || !selectedText.value.trim()) return
  if (executingAction.value) return

  executingAction.value = action.id
  try {
    await action.run(selectedText.value)
  } finally {
    executingAction.value = null
  }
}

function handleContext(payload: OmniPanelContextPayload): void {
  selectedText.value = payload.text || ''
  hasSelection.value = payload.hasSelection
  source.value = payload.source || 'manual'
  capturedAt.value = payload.capturedAt
}

async function handleKeydown(event: KeyboardEvent): Promise<void> {
  if (event.key === 'Escape') {
    event.preventDefault()
    await closePanel()
  }
}

const disposeContext = transport.on(omniPanelContextEvent, (payload) => {
  handleContext(payload as OmniPanelContextPayload)
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  disposeContext()
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="OmniPanel">
    <div class="OmniPanel__header">
      <div class="OmniPanel__titleBlock">
        <p class="OmniPanel__eyebrow">OmniPanel</p>
        <h1 class="OmniPanel__title">{{ t(CoreBoxOmniPanelKeys.TITLE, '全景面板') }}</h1>
      </div>
      <button class="OmniPanel__close" @click="closePanel">
        <TuffIcon :icon="{ type: 'class', value: 'i-ri-close-line' }" :size="18" />
      </button>
    </div>

    <div class="OmniPanel__context">
      <div class="OmniPanel__contextMeta">
        <span>{{ t(CoreBoxOmniPanelKeys.SOURCE, '来源') }}: {{ source }}</span>
        <span v-if="capturedAt">{{ new Date(capturedAt).toLocaleTimeString() }}</span>
      </div>
      <p class="OmniPanel__contextText">{{ displayText }}</p>
    </div>

    <div class="OmniPanel__actions">
      <button
        v-for="action in quickActions"
        :key="action.id"
        class="OmniPanel__action"
        :disabled="!hasSelection || !!executingAction"
        @click="executeAction(action)"
      >
        <span class="OmniPanel__actionIcon">
          <TuffIcon :icon="{ type: 'class', value: action.icon }" :size="18" />
        </span>
        <span class="OmniPanel__actionContent">
          <span class="OmniPanel__actionTitle">{{ action.title }}</span>
          <span class="OmniPanel__actionSubtitle">{{ action.subtitle }}</span>
        </span>
        <span class="OmniPanel__shortcut">{{ action.shortcut }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.OmniPanel {
  width: 100%;
  min-height: 100vh;
  padding: 24px;
  color: #eef2ff;
  background:
    radial-gradient(circle at 100% -20%, rgba(76, 139, 245, 0.3), transparent 45%),
    radial-gradient(circle at -10% 120%, rgba(45, 212, 191, 0.16), transparent 36%),
    linear-gradient(160deg, #111827 0%, #0b1220 100%);
  font-family: 'SF Pro Display', 'PingFang SC', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.OmniPanel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.OmniPanel__eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(199, 210, 254, 0.75);
}

.OmniPanel__title {
  margin: 6px 0 0;
  font-size: 26px;
  line-height: 1.2;
  font-weight: 650;
}

.OmniPanel__close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.5);
  color: #cbd5e1;
  cursor: pointer;
}

.OmniPanel__context {
  border: 1px solid rgba(129, 140, 248, 0.35);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
  padding: 14px 16px;
}

.OmniPanel__contextMeta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(165, 180, 252, 0.85);
}

.OmniPanel__contextText {
  margin: 10px 0 0;
  color: #e2e8f0;
  line-height: 1.6;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

.OmniPanel__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.OmniPanel__action {
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.52);
  color: inherit;
  text-align: left;
  padding: 12px;
  cursor: pointer;
}

.OmniPanel__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.OmniPanel__actionIcon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  background: rgba(30, 41, 59, 0.85);
  color: #a5b4fc;
}

.OmniPanel__actionContent {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.OmniPanel__actionTitle {
  font-size: 14px;
  font-weight: 600;
}

.OmniPanel__actionSubtitle {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.92);
}

.OmniPanel__shortcut {
  font-size: 12px;
  color: rgba(191, 219, 254, 0.92);
}
</style>
