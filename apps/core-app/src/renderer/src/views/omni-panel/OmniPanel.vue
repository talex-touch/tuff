<script setup lang="ts">
import type {
  OmniPanelContextPayload,
  OmniPanelFeatureExecuteResponse,
  OmniPanelFeatureItemPayload,
  OmniPanelFeatureListResponse
} from '../../../../shared/events/omni-panel'
import { CoreBoxOmniPanelKeys } from '@talex-touch/utils/i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import TuffIcon from '~/components/base/TuffIcon.vue'
import {
  omniPanelContextEvent,
  omniPanelFeatureExecuteEvent,
  omniPanelFeatureListEvent,
  omniPanelFeatureRefreshEvent,
  omniPanelFeatureReorderEvent,
  omniPanelFeatureToggleEvent,
  omniPanelHideEvent
} from '../../../../shared/events/omni-panel'

const { t } = useI18n()
const transport = useTuffTransport()

const selectedText = ref('')
const hasSelection = ref(false)
const source = ref('manual')
const capturedAt = ref<number | null>(null)
const loading = ref(false)
const executingId = ref<string | null>(null)
const searchKeyword = ref('')
const features = ref<OmniPanelFeatureItemPayload[]>([])

const displayText = computed(() => {
  if (hasSelection.value) return selectedText.value
  return t(
    CoreBoxOmniPanelKeys.EMPTY_SELECTION,
    '当前没有捕获到选中文本。先在任意应用中选中文本，再触发全景面板。'
  )
})

const filteredFeatures = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return features.value
  return features.value.filter((item) => {
    const title = item.title.toLowerCase()
    const subtitle = item.subtitle.toLowerCase()
    const pluginName = (item.pluginName || '').toLowerCase()
    return title.includes(keyword) || subtitle.includes(keyword) || pluginName.includes(keyword)
  })
})

function resolveFeatureIcon(item: OmniPanelFeatureItemPayload): { type: any; value: string } {
  if (!item.icon) {
    return { type: 'class', value: 'i-ri-apps-2-line' }
  }
  return {
    type: item.icon.type as any,
    value: item.icon.value
  }
}

async function closePanel(): Promise<void> {
  await transport.send(omniPanelHideEvent)
}

async function loadFeatures(): Promise<void> {
  loading.value = true
  try {
    const response = await transport.send(omniPanelFeatureListEvent)
    const payload = response as OmniPanelFeatureListResponse
    features.value = Array.isArray(payload?.features) ? payload.features : []
  } catch (error) {
    console.error('[OmniPanel] Failed to load features:', error)
    toast.error(t('corebox.omniPanel.loadFailed', '加载 OmniPanel Feature 失败，请稍后重试。'))
  } finally {
    loading.value = false
  }
}

async function executeFeature(item: OmniPanelFeatureItemPayload): Promise<void> {
  if (executingId.value) return
  if (item.unavailable) {
    toast.error(
      t('corebox.omniPanel.featureUnavailable', '该 Feature 当前不可用，请检查插件状态。')
    )
    return
  }

  executingId.value = item.id
  try {
    const response = (await transport.send(omniPanelFeatureExecuteEvent, {
      id: item.id,
      contextText: selectedText.value,
      source: source.value
    })) as OmniPanelFeatureExecuteResponse

    if (!response?.success) {
      const fallback = t('corebox.omniPanel.executeFailed', '执行失败，请稍后重试。')
      toast.error(response?.error || fallback)
    }
  } catch (error) {
    console.error('[OmniPanel] Failed to execute feature:', error)
    toast.error(t('corebox.omniPanel.executeFailed', '执行失败，请稍后重试。'))
  } finally {
    executingId.value = null
  }
}

async function toggleFeature(item: OmniPanelFeatureItemPayload): Promise<void> {
  try {
    await transport.send(omniPanelFeatureToggleEvent, {
      id: item.id,
      enabled: !item.enabled
    })
    item.enabled = !item.enabled
  } catch (error) {
    console.error('[OmniPanel] Failed to toggle feature:', error)
    toast.error(t('corebox.omniPanel.toggleFailed', '更新 Feature 状态失败。'))
  }
}

async function reorderFeature(
  item: OmniPanelFeatureItemPayload,
  direction: 'up' | 'down'
): Promise<void> {
  try {
    await transport.send(omniPanelFeatureReorderEvent, {
      id: item.id,
      direction
    })
    await loadFeatures()
  } catch (error) {
    console.error('[OmniPanel] Failed to reorder feature:', error)
    toast.error(t('corebox.omniPanel.reorderFailed', 'Feature 排序更新失败。'))
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

const disposeFeatureRefresh = transport.on(omniPanelFeatureRefreshEvent, async () => {
  await loadFeatures()
})

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  await loadFeatures()
})

onBeforeUnmount(() => {
  disposeContext()
  disposeFeatureRefresh()
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

    <div class="OmniPanel__search">
      <input
        v-model="searchKeyword"
        type="text"
        :placeholder="t('corebox.omniPanel.searchPlaceholder', '搜索 OmniPanel Feature')"
      />
    </div>

    <div v-if="loading" class="OmniPanel__state">
      {{ t('corebox.omniPanel.loading', '正在加载 Feature...') }}
    </div>
    <div v-else-if="filteredFeatures.length === 0" class="OmniPanel__state">
      {{ t('corebox.omniPanel.empty', '当前没有可用 Feature') }}
    </div>
    <div v-else class="OmniPanel__actions">
      <div v-for="(item, index) in filteredFeatures" :key="item.id" class="OmniPanel__actionRow">
        <button
          class="OmniPanel__action"
          :disabled="!item.enabled || !!executingId || item.unavailable"
          @click="executeFeature(item)"
        >
          <span class="OmniPanel__actionIcon">
            <TuffIcon :icon="resolveFeatureIcon(item)" :size="18" />
          </span>
          <span class="OmniPanel__actionContent">
            <span class="OmniPanel__actionTitle">
              {{ item.title }}
              <small v-if="item.source === 'plugin'" class="OmniPanel__pluginTag">
                {{ item.pluginName }}
              </small>
            </span>
            <span class="OmniPanel__actionSubtitle">{{ item.subtitle }}</span>
          </span>
          <span class="OmniPanel__actionMeta">
            <span v-if="executingId === item.id" class="OmniPanel__executing">...</span>
            <span v-else>{{
              item.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已停用')
            }}</span>
          </span>
        </button>

        <div class="OmniPanel__controls">
          <button class="OmniPanel__controlBtn" @click="toggleFeature(item)">
            {{ item.enabled ? t('common.disable', '停用') : t('common.enable', '启用') }}
          </button>
          <button
            class="OmniPanel__controlBtn"
            :disabled="index === 0"
            @click="reorderFeature(item, 'up')"
          >
            ↑
          </button>
          <button
            class="OmniPanel__controlBtn"
            :disabled="index === filteredFeatures.length - 1"
            @click="reorderFeature(item, 'down')"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.OmniPanel {
  width: 100%;
  min-height: 100vh;
  padding: 22px;
  color: #eef2ff;
  background:
    radial-gradient(circle at 100% -20%, rgba(76, 139, 245, 0.3), transparent 45%),
    radial-gradient(circle at -10% 120%, rgba(45, 212, 191, 0.16), transparent 36%),
    linear-gradient(160deg, #111827 0%, #0b1220 100%);
  font-family: 'SF Pro Display', 'PingFang SC', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-size: 24px;
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
  max-height: 120px;
  overflow: auto;
}

.OmniPanel__search input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 13px;
  padding: 10px 12px;
}

.OmniPanel__state {
  border: 1px dashed rgba(129, 140, 248, 0.35);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: rgba(191, 219, 254, 0.92);
}

.OmniPanel__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.OmniPanel__actionRow {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.52);
  overflow: hidden;
}

.OmniPanel__action {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 12px;
  color: inherit;
  background: transparent;
  border: none;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.OmniPanel__pluginTag {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.OmniPanel__actionSubtitle {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.92);
}

.OmniPanel__actionMeta {
  font-size: 12px;
  color: rgba(191, 219, 254, 0.92);
}

.OmniPanel__controls {
  display: flex;
  gap: 6px;
  padding: 0 12px 12px;
}

.OmniPanel__controlBtn {
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1;
  padding: 7px 10px;
  cursor: pointer;
}

.OmniPanel__controlBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.OmniPanel__executing {
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>
