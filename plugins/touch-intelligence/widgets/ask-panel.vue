<script lang="ts">
import { TxAiConversation } from '@talex-touch/tuffex/ai-elements'
import { computed, defineComponent, nextTick, ref, watch } from 'vue'

type IntelligenceWidgetStatus
  = | 'idle'
    | 'ocr-pending'
    | 'chat-pending'
    | 'ready'
    | 'error'

interface IntelligenceWidgetAttachment {
  type?: 'image' | string
  title?: string
  detail?: string
  preview?: string
}

interface IntelligenceWidgetMessage {
  id?: string
  role?: 'user' | 'assistant' | 'system' | 'tool' | string
  content?: string
  status?: 'pending' | 'streaming' | 'complete' | 'error' | string
  attachments?: IntelligenceWidgetAttachment[]
}

interface IntelligenceImageContext {
  type?: 'image' | string
  title?: string
  preview?: string
  ocrText?: string
  status?: 'attached' | 'ready' | 'unsupported' | string
  note?: string
}

type IntelligenceContextMode = 'new' | 'continue' | 'stateless'

type IntelligenceContextContinuationReason
  = | 'archived-session-continuation'
    | 'expired-session-continuation'
    | 'idle-session-continuation'
    | 'continuation-session-missing'

interface IntelligenceContextContinuationSummary {
  reason?: IntelligenceContextContinuationReason
  status?: 'included' | 'excluded' | 'unavailable'
  degradedReason?: string
}

interface IntelligenceContextSummary {
  mode?: IntelligenceContextMode
  scope?: string
  itemCount?: number
  tokenBudget?: number
  tokenEstimate?: number
  retrievalItemCount?: number
  citationCount?: number
  degradedReason?: string
  checkpointReason?: string
  continuation?: IntelligenceContextContinuationSummary
}

interface IntelligenceWidgetPayload {
  requestId?: string
  aiCommandId?: string
  prompt?: string
  answer?: string
  status?: string
  provider?: string
  model?: string
  latency?: number
  traceId?: string
  capabilityId?: string
  inputKinds?: string[]
  errorCode?: string
  errorMessage?: string
  copyStatus?: string
  copyError?: string
  copyRecovery?: string
  replaceStatus?: string
  replaceError?: string
  replaceRecovery?: string
  messages?: IntelligenceWidgetMessage[]
  contextMode?: IntelligenceContextMode
  contextPackage?: IntelligenceContextSummary | null
  imageContext?: IntelligenceImageContext | null
  modelOptions?: IntelligenceProviderModelOption[]
  selectedProviderId?: string
  selectedModel?: string
}

interface RuntimeMetadataItem {
  label: string
  value: string
}

interface IntelligenceProviderModelOption {
  providerId?: string
  providerName?: string
  providerType?: string
  models?: string[]
  defaultModel?: string | null
  capabilities?: string[]
  available?: boolean
}

interface ModelSelectOption {
  value: string
  label: string
  providerId: string
  model: string
  providerName: string
  providerType: string
  defaultModel?: string | null
}

const AUTO_MODEL_VALUE = '__auto__'

function formatContextContinuation(
  summary: IntelligenceContextContinuationSummary,
): string {
  const base
    = summary.reason === 'archived-session-continuation'
      ? '已从归档会话摘要开启新会话'
      : summary.reason === 'expired-session-continuation'
        ? '已从过期会话摘要开启新会话'
        : summary.reason === 'idle-session-continuation'
          ? '长时间未活动，已从摘要开启新会话'
          : '原会话不可用，已开启新会话'
  if (summary.status === 'excluded')
    return `${base}（摘要已阻止）`
  if (summary.status === 'unavailable')
    return `${base}（摘要不可用）`
  return base
}

export default defineComponent({
  name: 'AskPanel',
  components: {
    TxAiConversation,
  },
  props: {
    item: { type: Object, required: true },
    payload: {
      type: Object as () => IntelligenceWidgetPayload | undefined,
      required: false,
    },
    hostKeyEvent: {
      type: Object as () => HostKeyEventEnvelope | null | undefined,
      required: false,
    },
  },
  emits: ['host-action'],
  setup(props, { emit }) {
    const contentRef = ref<HTMLElement | null>(null)
    const modelSearch = ref('')
    const widgetPayload = computed<IntelligenceWidgetPayload>(
      () => props.payload ?? {},
    )
    const status = computed<IntelligenceWidgetStatus>(() => {
      const value = widgetPayload.value.status
      if (
        value === 'ocr-pending'
        || value === 'chat-pending'
        || value === 'ready'
        || value === 'error'
      ) {
        return value
      }
      return 'idle'
    })
    const messages = computed<IntelligenceWidgetMessage[]>(() => {
      if (
        Array.isArray(widgetPayload.value.messages)
        && widgetPayload.value.messages.length > 0
      ) {
        return widgetPayload.value.messages.filter((message) => {
          const content = message?.content?.trim()
          return Boolean(
            content
            || message?.status === 'streaming'
            || message?.status === 'pending',
          )
        })
      }
      return []
    })
    const isEmpty = computed(() => messages.value.length === 0)
    const imageContext = computed(
      () => widgetPayload.value.imageContext || null,
    )
    const isBusy = computed(
      () => status.value === 'ocr-pending' || status.value === 'chat-pending',
    )
    const errorCode = computed(() =>
      String(widgetPayload.value.errorCode || '').trim(),
    )
    const errorMessage = computed(() =>
      String(widgetPayload.value.errorMessage || '').trim(),
    )
    const isPermissionDenied = computed(
      () => errorCode.value === 'PERMISSION_DENIED',
    )
    const copyFailed = computed(
      () => String(widgetPayload.value.copyStatus || '').trim() === 'failed',
    )
    const copyError = computed(() =>
      String(widgetPayload.value.copyError || '').trim(),
    )
    const copyRecovery = computed(() =>
      String(widgetPayload.value.copyRecovery || '').trim(),
    )
    const replaceFailed = computed(
      () => String(widgetPayload.value.replaceStatus || '').trim() === 'failed',
    )
    const replaceError = computed(() =>
      String(widgetPayload.value.replaceError || '').trim(),
    )
    const replaceRecovery = computed(() =>
      String(widgetPayload.value.replaceRecovery || '').trim(),
    )
    const canUseAnswerActions = computed(
      () =>
        status.value === 'ready' && Boolean(widgetPayload.value.answer?.trim()),
    )
    const runtimeMetadata = computed<RuntimeMetadataItem[]>(() => {
      const payload = widgetPayload.value
      const items: RuntimeMetadataItem[] = []
      const provider = String(payload.provider || '').trim()
      const model = String(payload.model || '').trim()
      const traceId = String(payload.traceId || '').trim()
      const capabilityId = String(payload.capabilityId || '').trim()
      const inputKinds = Array.isArray(payload.inputKinds)
        ? payload.inputKinds.map(kind => String(kind).trim()).filter(Boolean)
        : []
      const latency = Number(payload.latency)
      const contextPackage = payload.contextPackage
      const contextModeValue = contextPackage?.mode || payload.contextMode
      const contextScope = String(contextPackage?.scope || '').trim()
      const contextItemCount = Number(contextPackage?.itemCount)
      const contextTokenBudget = Number(contextPackage?.tokenBudget)
      const contextTokenEstimate = Number(contextPackage?.tokenEstimate)
      const retrievalItemCount = Number(contextPackage?.retrievalItemCount)
      const citationCount = Number(contextPackage?.citationCount)
      const degradedReason = String(contextPackage?.degradedReason || '').trim()
      const continuation = contextPackage?.continuation

      if (provider) {
        const providerValue
          = provider.toLowerCase() === 'local' ? 'Local/Ollama (local)' : provider
        items.push({ label: 'Provider', value: providerValue })
      }
      if (model)
        items.push({ label: 'Model', value: model })
      if (Number.isFinite(latency) && latency >= 0)
        items.push({ label: 'Latency', value: `${Math.round(latency)} ms` })
      if (traceId)
        items.push({ label: 'Trace', value: traceId })
      if (inputKinds.length > 0)
        items.push({ label: 'Input kind', value: inputKinds.join(', ') })
      if (capabilityId)
        items.push({ label: 'Capability', value: capabilityId })
      if (contextPackage) {
        items.push({
          label: 'Context boundary',
          value: `${contextModeValue || 'new'} / ${contextScope || 'retrieval'}`,
        })
        if (continuation?.reason) {
          items.push({
            label: 'Context transition',
            value: formatContextContinuation(continuation),
          })
        }
        if (Number.isFinite(contextItemCount) && contextItemCount >= 0) {
          items.push({
            label: 'Context items',
            value: String(contextItemCount),
          })
        }
        if (
          Number.isFinite(contextTokenEstimate)
          && contextTokenEstimate >= 0
          && Number.isFinite(contextTokenBudget)
          && contextTokenBudget > 0
        ) {
          items.push({
            label: 'Context tokens',
            value: `${Math.round(contextTokenEstimate)} / ${Math.round(contextTokenBudget)}`,
          })
        }
        if (Number.isFinite(retrievalItemCount) && retrievalItemCount > 0) {
          items.push({
            label: 'Retrieval items',
            value: String(retrievalItemCount),
          })
        }
        if (Number.isFinite(citationCount) && citationCount > 0)
          items.push({ label: 'Citations', value: String(citationCount) })
        if (degradedReason)
          items.push({ label: 'Context state', value: degradedReason })
      }

      return items
    })
    const hasRuntimeMetadata = computed(() => runtimeMetadata.value.length > 0)
    const selectedProviderId = computed(() =>
      String(widgetPayload.value.selectedProviderId || '').trim(),
    )
    const selectedModel = computed(() =>
      String(widgetPayload.value.selectedModel || '').trim(),
    )
    const selectedModelValue = computed(() => {
      if (!selectedProviderId.value || !selectedModel.value)
        return AUTO_MODEL_VALUE
      return `${selectedProviderId.value}::${selectedModel.value}`
    })
    const modelOptions = computed(() => {
      const values = Array.isArray(widgetPayload.value.modelOptions)
        ? widgetPayload.value.modelOptions
        : []
      return values
        .map((option) => {
          const providerId = String(option?.providerId || '').trim()
          const providerName = String(option?.providerName || providerId).trim()
          const providerType = String(option?.providerType || '').trim()
          const defaultModel = String(option?.defaultModel || '').trim()
          const models = Array.isArray(option?.models)
            ? Array.from(
                new Set(
                  option.models
                    .map(model => String(model || '').trim())
                    .filter(Boolean),
                ),
              )
            : []
          return {
            providerId,
            providerName,
            providerType,
            defaultModel,
            models,
            available: option?.available === true,
          }
        })
        .filter(
          option =>
            option.available && option.providerId && option.models.length > 0,
        )
    })
    const flattenedModelOptions = computed<ModelSelectOption[]>(() => {
      return modelOptions.value.flatMap((provider) => {
        const orderedModels = [...provider.models].sort((a, b) => {
          if (provider.defaultModel && a === provider.defaultModel)
            return -1
          if (provider.defaultModel && b === provider.defaultModel)
            return 1
          return a.localeCompare(b)
        })
        return orderedModels.map(model => ({
          value: `${provider.providerId}::${model}`,
          label: model,
          providerId: provider.providerId,
          model,
          providerName: provider.providerName,
          providerType: provider.providerType,
          defaultModel: provider.defaultModel,
        }))
      })
    })
    const filteredModelGroups = computed(() => {
      const query = modelSearch.value.trim().toLowerCase()
      return modelOptions.value
        .map((provider) => {
          const models = provider.models.filter((model) => {
            if (!query)
              return true
            return [
              provider.providerId,
              provider.providerName,
              provider.providerType,
              model,
            ].some(value => value.toLowerCase().includes(query))
          })
          return { ...provider, models }
        })
        .filter(provider => provider.models.length > 0)
    })
    const selectedModelSummary = computed(() => {
      if (!selectedProviderId.value || !selectedModel.value)
        return '自动路由'
      const provider = modelOptions.value.find(
        option => option.providerId === selectedProviderId.value,
      )
      const providerName = provider?.providerName || selectedProviderId.value
      return `${providerName} / ${selectedModel.value}`
    })
    const isAiCommand = computed(() => Boolean(widgetPayload.value.aiCommandId))
    const contextModes: IntelligenceContextMode[] = [
      'new',
      'continue',
      'stateless',
    ]
    const contextMode = computed<IntelligenceContextMode>(() => {
      if (isAiCommand.value)
        return 'stateless'
      const value = widgetPayload.value.contextMode
      return value === 'continue' || value === 'stateless' ? value : 'new'
    })

    function cloneMessage(
      message: IntelligenceWidgetMessage,
    ): IntelligenceWidgetMessage {
      return {
        ...message,
        attachments: message.attachments?.map(attachment => ({
          ...attachment,
        })),
      }
    }

    const visibleMessages = computed(() => messages.value.map(cloneMessage))

    function scrollToBottom(force = false) {
      void nextTick(() => {
        const el = contentRef.value
        if (!el)
          return
        const apply = () => {
          el.scrollTop = el.scrollHeight
          el.scrollTo?.({
            top: el.scrollHeight,
            behavior: force ? 'auto' : 'smooth',
          })
        }
        apply()
        requestAnimationFrame(() => {
          apply()
          requestAnimationFrame(apply)
        })
      })
    }

    watch(
      () => [
        visibleMessages.value,
        status.value,
        widgetPayload.value.updatedAt,
      ],
      () => scrollToBottom(true),
      { immediate: true, deep: true, flush: 'post' },
    )

    function buildHostActionPayload(overrides: Record<string, unknown> = {}) {
      const payload = widgetPayload.value
      return {
        requestId: payload.requestId || '',
        aiCommandId: payload.aiCommandId || '',
        prompt: payload.prompt || '',
        answer: payload.answer || '',
        status: payload.status || 'idle',
        provider: payload.provider || '',
        model: payload.model || '',
        latency: payload.latency,
        traceId: payload.traceId || '',
        capabilityId: payload.capabilityId || 'text.chat',
        inputKinds: payload.inputKinds || [],
        errorCode: payload.errorCode || '',
        errorMessage: payload.errorMessage || '',
        copyStatus: payload.copyStatus || '',
        copyError: payload.copyError || '',
        copyRecovery: payload.copyRecovery || '',
        replaceStatus: payload.replaceStatus || '',
        replaceError: payload.replaceError || '',
        replaceRecovery: payload.replaceRecovery || '',
        imageDataUrl: payload.imageContext?.preview || '',
        ocrText: payload.imageContext?.ocrText || '',
        contextMode: contextMode.value,
        contextPackage: payload.contextPackage || null,
        ...overrides,
      }
    }

    function handleAnswerAction(actionId: 'copy-answer' | 'replace-answer') {
      if (!canUseAnswerActions.value || isBusy.value)
        return
      emit('host-action', {
        actionId,
        payload: buildHostActionPayload(),
      })
    }

    function handleModelChange(event: Event) {
      const target = event.target as HTMLSelectElement | null
      const value = target?.value || AUTO_MODEL_VALUE
      const option = flattenedModelOptions.value.find(
        item => item.value === value,
      )
      emit('host-action', {
        actionId: 'select-model',
        payload: buildHostActionPayload({
          selectedProviderId: option?.providerId || '',
          selectedModel: option?.model || '',
        }),
      })
    }

    function handleContextModeChange(mode: IntelligenceContextMode) {
      if (mode === contextMode.value || isBusy.value)
        return
      emit('host-action', {
        actionId: 'select-context-mode',
        payload: buildHostActionPayload({ contextMode: mode }),
      })
    }

    return {
      contentRef,
      modelSearch,
      status,
      messages: visibleMessages,
      isEmpty,
      imageContext,
      isBusy,
      errorCode,
      errorMessage,
      isPermissionDenied,
      copyFailed,
      copyError,
      copyRecovery,
      replaceFailed,
      replaceError,
      replaceRecovery,
      canUseAnswerActions,
      runtimeMetadata,
      hasRuntimeMetadata,
      contextModes,
      isAiCommand,
      contextMode,
      selectedModelValue,
      selectedModelSummary,
      filteredModelGroups,
      AUTO_MODEL_VALUE,
      handleModelChange,
      handleContextModeChange,
      handleAnswerAction,
      scrollToBottom,
    }
  },
})
</script>

<template>
  <section class="AiChatbot" aria-live="polite">
    <div class="AiChatbot__conversation">
      <div ref="contentRef" class="AiChatbot__content">
        <div v-if="isEmpty" class="AiChatbot__empty">
          <div class="AiChatbot__emptyIcon">
            <i class="i-carbon-chat" />
          </div>
          <strong>Start a conversation</strong>
          <span>Messages will appear here as the conversation progresses.</span>
        </div>

        <TxAiConversation
          v-else
          class="AiChatbot__aiConversation"
          :messages="messages"
          :markdown="true"
          :compact="false"
          :show-avatar="false"
          empty-text="Start a conversation"
        />

        <div
          v-if="hasRuntimeMetadata"
          class="AiChatbot__runtimeMetadata"
          aria-label="Execution metadata"
        >
          <strong>Execution metadata</strong>
          <dl>
            <template v-for="metadataItem in runtimeMetadata" :key="metadataItem.label">
              <dt>{{ metadataItem.label }}</dt>
              <dd>{{ metadataItem.value }}</dd>
            </template>
          </dl>
        </div>

        <div
          v-if="imageContext"
          class="AiImageContext"
          :class="`is-${imageContext.status || 'attached'}`"
        >
          <img
            v-if="imageContext.preview"
            :src="imageContext.preview"
            alt="图片上下文"
          >
          <div>
            <strong>{{ imageContext.title || '图片上下文' }}</strong>
            <span>{{ imageContext.note || '图片已作为上下文引用。' }}</span>
          </div>
        </div>

        <div
          v-if="status === 'error' && errorMessage"
          class="AiChatbot__errorNotice"
        >
          <strong>{{
            isPermissionDenied ? '需要授权 AI 权限' : '请求失败'
          }}</strong>
          <span>{{ errorMessage }}</span>
          <small v-if="isPermissionDenied">请到插件权限设置中允许 intelligence.basic 后重试。</small>
        </div>

        <div v-if="copyFailed" class="AiChatbot__copyFailureNotice">
          <strong>复制失败</strong>
          <span>{{ copyError || '无法复制回答到剪贴板。' }}</span>
          <small>{{ copyRecovery || '请检查插件剪贴板权限后重试。' }}</small>
        </div>

        <div
          v-if="canUseAnswerActions"
          class="AiChatbot__answerActions"
          role="group"
          aria-label="回答操作"
        >
          <button
            type="button"
            :disabled="isBusy"
            @click="handleAnswerAction('copy-answer')"
          >
            <i class="i-carbon-copy" aria-hidden="true" />
            复制回答
          </button>
          <button
            type="button"
            :disabled="isBusy"
            @click="handleAnswerAction('replace-answer')"
          >
            <i class="i-carbon-text-selection" aria-hidden="true" />
            替换选中文本
          </button>
        </div>

        <div v-if="replaceFailed" class="AiChatbot__replaceFailureNotice">
          <strong>替换失败</strong>
          <span>{{ replaceError || '无法将回答粘贴到当前应用。' }}</span>
          <small>{{ replaceRecovery || '请检查系统自动化权限后重试。' }}</small>
        </div>
      </div>

      <button
        class="AiChatbot__scrollButton"
        type="button"
        aria-label="Scroll to bottom"
        @click="scrollToBottom(true)"
      >
        ↓
      </button>
    </div>

    <div class="AiChatbot__modelToolbar" aria-label="渠道模型选择">
      <div v-if="!isAiCommand" class="AiChatbot__contextControl">
        <span>上下文</span>
        <div
          class="AiChatbot__contextModes"
          role="group"
          aria-label="上下文模式"
        >
          <button
            v-for="mode in contextModes"
            :key="mode"
            type="button"
            :class="{ 'is-active': contextMode === mode }"
            :aria-pressed="contextMode === mode"
            :disabled="isBusy"
            @click="handleContextModeChange(mode)"
          >
            {{
              mode === 'new'
                ? '新会话'
                : mode === 'continue'
                  ? '继续'
                  : '无历史'
            }}
          </button>
        </div>
      </div>
      <div v-else class="AiChatbot__contextControl">
        <span>AI 命令</span>
        <strong>无历史</strong>
      </div>
      <div class="AiChatbot__modelSummary">
        <span>渠道模型</span>
        <strong>{{ selectedModelSummary }}</strong>
      </div>
      <input
        v-model="modelSearch"
        class="AiChatbot__modelSearch"
        type="search"
        placeholder="搜索渠道或模型"
        aria-label="搜索渠道或模型"
      >
      <select
        class="AiChatbot__modelSelect"
        :value="selectedModelValue"
        aria-label="选择渠道模型"
        @change="handleModelChange"
      >
        <option :value="AUTO_MODEL_VALUE">
          自动路由
        </option>
        <template
          v-for="provider in filteredModelGroups"
          :key="provider.providerId"
        >
          <option disabled :value="`group:${provider.providerId}`">
            {{ provider.providerName
            }}{{ provider.providerType ? ` · ${provider.providerType}` : '' }}
          </option>
          <option
            v-for="model in provider.models"
            :key="`${provider.providerId}:${model}`"
            :value="`${provider.providerId}::${model}`"
          >
            {{ model }}{{ provider.defaultModel === model ? ' · 默认' : '' }}
          </option>
        </template>
      </select>
    </div>
  </section>
</template>

<style scoped>
.AiChatbot {
  --ai-chat-bg: transparent;
  --ai-chat-text: var(--tx-text-color-primary, #1f2937);
  --ai-chat-text-secondary: var(--tx-text-color-secondary, #6b7280);
  --ai-chat-border: color-mix(
    in srgb,
    var(--tx-border-color, #dcdfe6) 72%,
    transparent
  );
  --ai-chat-assistant-bg: color-mix(
    in srgb,
    var(--tx-fill-color, #f3f4f6) 82%,
    transparent
  );
  --ai-chat-user-bg: color-mix(
    in srgb,
    var(--tx-color-primary, #3082ff) 18%,
    transparent
  );
  --ai-chat-user-border: color-mix(
    in srgb,
    var(--tx-color-primary, #3082ff) 42%,
    transparent
  );
  --ai-chat-floating-bg: color-mix(
    in srgb,
    var(--tx-bg-color, #ffffff) 86%,
    transparent
  );
  --ai-chat-danger-bg: color-mix(
    in srgb,
    var(--tx-color-danger, #e5484d) 14%,
    transparent
  );
  --ai-chat-danger-border: color-mix(
    in srgb,
    var(--tx-color-danger, #e5484d) 28%,
    transparent
  );
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--ai-chat-bg);
  color: var(--ai-chat-text);
}

.AiChatbot__conversation {
  position: relative;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.AiChatbot__content {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 24px 28px 86px;
  scrollbar-width: thin;
}

.AiChatbot__empty {
  display: flex;
  height: 100%;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ai-chat-text-secondary);
  text-align: center;
}

.AiChatbot__emptyIcon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  color: var(--tx-color-primary, #3082ff);
  font-size: 24px;
}

.AiChatbot__empty strong {
  color: var(--ai-chat-text);
  font-size: 16px;
  font-weight: 650;
}

.AiChatbot__empty span {
  max-width: 340px;
  font-size: 14px;
  line-height: 1.6;
}

.AiMessage {
  display: flex;
  width: 100%;
}

.AiMessage--user {
  justify-content: flex-end;
}

.AiMessage--assistant {
  justify-content: flex-start;
}

.AiMessage__content {
  max-width: min(78%, 720px);
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 16px;
  color: var(--ai-chat-text);
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}

.AiMessage--user .AiMessage__content {
  border: 1px solid var(--ai-chat-user-border);
  background: var(--ai-chat-user-bg);
}

.AiMessage--assistant .AiMessage__content {
  border: 1px solid var(--ai-chat-border);
  background: var(--ai-chat-assistant-bg);
}

.AiMessage.is-error .AiMessage__content {
  border-color: var(--ai-chat-danger-border);
  background: var(--ai-chat-danger-bg);
  color: var(--tx-color-danger, #e5484d);
}

.AiMessage.is-streaming .AiMessage__content {
  min-width: 58px;
}

.AiMarkdown {
  display: inline;
}

.AiMarkdown :deep(p) {
  margin: 0 0 0.85em;
}

.AiMarkdown :deep(p:last-child),
.AiMarkdown :deep(ul:last-child),
.AiMarkdown :deep(pre:last-child) {
  margin-bottom: 0;
}

.AiMarkdown :deep(h1),
.AiMarkdown :deep(h2),
.AiMarkdown :deep(h3),
.AiMarkdown :deep(h4),
.AiMarkdown :deep(h5),
.AiMarkdown :deep(h6) {
  margin: 1em 0 0.5em;
  color: var(--ai-chat-text);
  font-weight: 700;
  line-height: 1.35;
}

.AiMarkdown :deep(h1) {
  font-size: 1.45em;
}
.AiMarkdown :deep(h2) {
  font-size: 1.32em;
}
.AiMarkdown :deep(h3) {
  font-size: 1.18em;
}

.AiMarkdown :deep(ul) {
  margin: 0 0 0.85em;
  padding-left: 1.25em;
}

.AiMarkdown :deep(li + li) {
  margin-top: 0.35em;
}

.AiMarkdown :deep(code) {
  padding: 0.1em 0.35em;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ai-chat-text) 10%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
}

.AiMarkdown :deep(pre) {
  overflow-x: auto;
  margin: 0 0 0.85em;
  padding: 12px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-text) 8%, transparent);
}

.AiMarkdown :deep(pre code) {
  padding: 0;
  background: transparent;
}

.AiMarkdown :deep(strong) {
  font-weight: 700;
}

.AiMessage__attachments {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.AiAttachment,
.AiImageContext {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-assistant-bg) 72%, transparent);
}

.AiAttachment img,
.AiImageContext img {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 10px;
  object-fit: cover;
}

.AiAttachment figcaption,
.AiImageContext div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.AiAttachment strong,
.AiImageContext strong {
  color: var(--ai-chat-text);
  font-size: 12px;
  font-weight: 700;
}

.AiAttachment span,
.AiImageContext span {
  color: var(--ai-chat-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.AiImageContext {
  max-width: min(78%, 720px);
}

.AiChatbot__runtimeMetadata {
  display: grid;
  max-width: min(78%, 720px);
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ai-chat-assistant-bg) 78%, transparent);
  color: var(--ai-chat-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.AiChatbot__runtimeMetadata strong {
  color: var(--ai-chat-text);
  font-size: 12px;
  font-weight: 700;
}

.AiChatbot__runtimeMetadata dl {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.AiChatbot__runtimeMetadata dt,
.AiChatbot__runtimeMetadata dd {
  margin: 0;
}

.AiChatbot__runtimeMetadata dt {
  color: var(--ai-chat-text-secondary);
  font-weight: 650;
}

.AiChatbot__runtimeMetadata dt::after {
  content: ':';
}

.AiChatbot__runtimeMetadata dd {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--ai-chat-text);
}

.AiChatbot__modelToolbar {
  position: absolute;
  right: 16px;
  bottom: 14px;
  left: 16px;
  display: grid;
  grid-template-columns:
    minmax(210px, auto) minmax(130px, 1fr) minmax(120px, 160px)
    minmax(180px, 260px);
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 12px;
  background: var(--ai-chat-floating-bg);
  backdrop-filter: blur(18px);
}

.AiChatbot__contextControl {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.AiChatbot__contextControl > span {
  color: var(--ai-chat-text-secondary);
  font-size: 11px;
  line-height: 1;
}

.AiChatbot__contextModes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 82%, transparent);
}

.AiChatbot__contextModes button {
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ai-chat-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  white-space: nowrap;
}

.AiChatbot__contextModes button:hover:not(:disabled) {
  color: var(--ai-chat-text);
}

.AiChatbot__contextModes button:active:not(:disabled) {
  transform: translateY(1px);
}

.AiChatbot__contextModes button:focus-visible {
  outline: 2px solid
    color-mix(in srgb, var(--tx-color-primary, #3082ff) 60%, transparent);
  outline-offset: 1px;
}

.AiChatbot__contextModes button.is-active {
  background: color-mix(
    in srgb,
    var(--tx-color-primary, #3082ff) 16%,
    var(--tx-bg-color, #ffffff)
  );
  color: var(--ai-chat-text);
  font-weight: 650;
}

.AiChatbot__contextModes button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.AiChatbot__modelSummary {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.AiChatbot__modelSummary span {
  color: var(--ai-chat-text-secondary);
  font-size: 11px;
  line-height: 1;
}

.AiChatbot__modelSummary strong {
  overflow: hidden;
  color: var(--ai-chat-text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.AiChatbot__modelSearch,
.AiChatbot__modelSelect {
  width: 100%;
  min-width: 0;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid var(--ai-chat-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 92%, transparent);
  color: var(--ai-chat-text);
  font-size: 12px;
  outline: none;
}

.AiChatbot__modelSearch {
  padding: 0 10px;
}

.AiChatbot__modelSelect {
  padding: 0 8px;
}

.AiChatbot__modelSearch:focus,
.AiChatbot__modelSelect:focus {
  border-color: color-mix(
    in srgb,
    var(--tx-color-primary, #3082ff) 64%,
    var(--ai-chat-border)
  );
}

@media (max-width: 640px) {
  .AiChatbot__content {
    padding: 18px 16px 220px;
  }

  .AiChatbot__modelToolbar {
    grid-template-columns: 1fr;
  }
}

.AiImageContext.is-unsupported {
  border-color: var(--ai-chat-danger-border);
  background: var(--ai-chat-danger-bg);
}

.AiTypingDot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  animation: ai-conversation-dot 1.15s ease-in-out infinite;
  background: var(--ai-chat-text-secondary);
}

.AiTypingDot:nth-child(2) {
  animation-delay: 0.14s;
}
.AiTypingDot:nth-child(3) {
  animation-delay: 0.28s;
}

.AiChatbot__errorNotice {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--ai-chat-danger-border);
  border-radius: 14px;
  background: var(--ai-chat-danger-bg);
  color: var(--tx-color-danger, #e5484d);
  font-size: 13px;
  line-height: 1.5;
}

.AiChatbot__errorNotice strong {
  font-size: 14px;
  font-weight: 700;
}

.AiChatbot__errorNotice small {
  color: color-mix(
    in srgb,
    var(--tx-color-danger, #e5484d) 78%,
    var(--ai-chat-text)
  );
  font-size: 12px;
}

.AiChatbot__copyFailureNotice,
.AiChatbot__replaceFailureNotice {
  display: grid;
  max-width: min(78%, 720px);
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--ai-chat-danger-border);
  border-radius: 14px;
  background: var(--ai-chat-danger-bg);
  color: var(--tx-color-danger, #e5484d);
  font-size: 13px;
  line-height: 1.5;
}

.AiChatbot__copyFailureNotice strong,
.AiChatbot__replaceFailureNotice strong {
  font-size: 14px;
  font-weight: 700;
}

.AiChatbot__copyFailureNotice small,
.AiChatbot__replaceFailureNotice small {
  color: color-mix(
    in srgb,
    var(--tx-color-danger, #e5484d) 78%,
    var(--ai-chat-text)
  );
  font-size: 12px;
}

.AiChatbot__answerActions {
  display: flex;
  max-width: min(78%, 720px);
  flex-wrap: wrap;
  gap: 8px;
}

.AiChatbot__answerActions button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--ai-chat-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 88%, transparent);
  color: var(--ai-chat-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}

.AiChatbot__answerActions button:hover:not(:disabled) {
  border-color: color-mix(
    in srgb,
    var(--tx-color-primary, #3082ff) 54%,
    var(--ai-chat-border)
  );
  color: var(--tx-color-primary, #3082ff);
}

.AiChatbot__answerActions button:focus-visible {
  outline: 2px solid
    color-mix(in srgb, var(--tx-color-primary, #3082ff) 58%, transparent);
  outline-offset: 2px;
}

.AiChatbot__answerActions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.AiChatbot__scrollButton {
  position: absolute;
  right: 24px;
  bottom: 18px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--ai-chat-border);
  border-radius: 999px;
  background: var(--ai-chat-floating-bg);
  color: var(--ai-chat-text-secondary);
  font-size: 16px;
  box-shadow: 0 8px 24px
    color-mix(in srgb, var(--ai-chat-text) 10%, transparent);
}

@keyframes ai-conversation-dot {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-3px);
    opacity: 1;
  }
}
</style>
