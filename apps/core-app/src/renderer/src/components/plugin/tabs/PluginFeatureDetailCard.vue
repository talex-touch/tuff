<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue'
import { computed } from 'vue'
import type { TuffItem } from '@talex-touch/utils'
import type { IFeatureCommand, IPluginFeature } from '@talex-touch/utils/plugin'
import {
  TuffInput,
  TuffSelect,
  TuffSelectItem,
  TuffSwitch,
  TxButton,
  TxSplitButton,
  TxTabItem,
  TxTabs,
  type TxSelectValue
} from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import WidgetFrame from '~/components/render/WidgetFrame.vue'

type PluginFeatureWithCommandsData = IPluginFeature

interface PreviewOption {
  value: string
  label: string
}

interface PreviewIssue {
  code?: string
  source?: string
  type?: string
  message?: string
  suggestion?: string
}

interface PreviewSizeOption {
  value: string
  label: string
}

const props = defineProps<{
  feature: PluginFeatureWithCommandsData | null
  detailTab: string
  widgetTabEnabled: boolean
  widgetStatus: string
  widgetSourceDisplayPath: string
  widgetSourceFilePath: string | null
  widgetSourceUrl: string | null
  widgetCompiledDisplayPath: string | null
  widgetCompiledPath: string | null
  widgetPathAliasNote: string | null
  widgetPreviewOptions: PreviewOption[]
  previewWidgetId: string | null
  previewWidgetReady: boolean
  previewWidgetRegistering: boolean
  previewWidgetRenderError: string
  previewWidgetIssues: PreviewIssue[]
  previewWidgetStatus: string
  previewWidgetHint: string
  previewWidgetItem: TuffItem | null
  previewFrameHostRef?: (el: Element | ComponentPublicInstance | null) => void
  previewFrameStyle: Record<string, string>
  previewFrameResizing: boolean
  previewFrameSizeLabel: string
  previewSizeOptions: PreviewSizeOption[]
  previewSizePresetValue: string
  mockPayloadEnabled: boolean
  mockPayloadRaw: string
  mockPayloadError: string
  mockPayloadValue: Record<string, unknown> | null
  isOperationDisabled: boolean
  isDevDisconnected: boolean
  devDisconnectMessage: string
  devDisconnectReason: string
  devDisconnectSuggestion: string
  canReconnect: boolean
  reconnectLoading: boolean
  resolveIssueMessage: (message: string) => string
}>()

const emit = defineEmits<{
  (event: 'update:detailTab', value: string): void
  (event: 'update:previewWidgetId', value: string | null): void
  (event: 'update:previewSizePresetValue', value: string): void
  (event: 'update:mockPayloadEnabled', value: boolean): void
  (event: 'update:mockPayloadRaw', value: string): void
  (event: 'close'): void
  (event: 'copy', value?: string | null): void
  (event: 'reveal', value?: string | null): void
  (event: 'reload-widget'): void
  (event: 'reload-all-widgets'): void
  (event: 'reset-preview-frame-size'): void
  (event: 'preview-resize-start', value: PointerEvent): void
  (event: 'render-error', value: Error): void
  (event: 'reconnect'): void
}>()

const { t } = useI18n()

const currentTab = computed({
  get: () => props.detailTab,
  set: (value: string) => emit('update:detailTab', value)
})

const currentPreviewWidgetId = computed<TxSelectValue | undefined>({
  get: () => props.previewWidgetId ?? undefined,
  set: (value) => {
    if (value === undefined) {
      emit('update:previewWidgetId', null)
      return
    }
    emit('update:previewWidgetId', String(value))
  }
})

const currentPreviewSizePresetValue = computed({
  get: () => props.previewSizePresetValue,
  set: (value: string) => emit('update:previewSizePresetValue', value)
})

const currentMockPayloadEnabled = computed({
  get: () => props.mockPayloadEnabled,
  set: (value: boolean) => emit('update:mockPayloadEnabled', value)
})

const currentMockPayloadRaw = computed({
  get: () => props.mockPayloadRaw,
  set: (value: string) => emit('update:mockPayloadRaw', value)
})

function getInputTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    text: 'i-ri-text',
    image: 'i-ri-image-line',
    files: 'i-ri-file-copy-line',
    html: 'i-ri-code-line'
  }
  return icons[type] || 'i-ri-question-line'
}

function resolveInteractionFlag(value?: boolean): string {
  if (typeof value === 'boolean') {
    return value
      ? t('plugin.features.interaction.flagEnabled')
      : t('plugin.features.interaction.flagDisabled')
  }
  return t('plugin.features.interaction.flagDefault')
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getCommandTitle(command: IFeatureCommand, index: number): string {
  return t('plugin.features.data.commandTitle', {
    index: index + 1,
    type: command.type
  })
}

function handleCopy(value?: string | null): void {
  emit('copy', value)
}

function handleReveal(value?: string | null): void {
  emit('reveal', value)
}

function handleReloadWidget(): void {
  emit('reload-widget')
}

function handleReloadAllWidgets(): void {
  emit('reload-all-widgets')
}

function handleResetPreviewFrameSize(): void {
  emit('reset-preview-frame-size')
}

function handlePreviewResizeStart(event: PointerEvent): void {
  emit('preview-resize-start', event)
}

function handleRenderError(error: Error): void {
  emit('render-error', error)
}

function handleReconnect(): void {
  emit('reconnect')
}

function handleClose(): void {
  emit('close')
}
</script>

<template>
  <div class="PluginFeature-Detail">
    <div class="PluginFeature-DetailHeader">
      <div class="flex items-center gap-4 py-2">
        <div
          class="w-10 h-10 bg-gradient-to-br from-[var(--tx-color-primary)] to-[var(--tx-color-primary-light-3)] rounded-xl flex items-center justify-center overflow-hidden"
        >
          <TuffIcon
            v-if="feature?.icon"
            :icon="feature.icon"
            :alt="feature.name"
            :size="24"
            class="text-[var(--tx-color-white)]"
          />
          <i v-else class="i-ri-function-line text-[var(--tx-color-white)] text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-[var(--tx-text-color-primary)]">
            {{ feature?.name }}
          </h2>
          <p class="text-sm text-[var(--tx-text-color-regular)]">
            {{ feature?.desc }}
          </p>
        </div>
      </div>
      <TxButton size="sm" variant="ghost" icon="i-ri-close-line" @click="handleClose">
        {{ t('common.close') }}
      </TxButton>
    </div>

    <div v-if="feature" class="PluginFeature-DetailBody">
      <div class="PluginFeature-DetailContent">
        <TxTabs
          v-model="currentTab"
          class="PluginFeature-DetailTabs"
          placement="top"
          :content-padding="0"
          :content-scrollable="false"
          :animation="{ indicator: { durationMs: 800 } }"
          borderless
        >
          <TxTabItem name="overview" activation>
            <template #name>{{ t('plugin.features.drawer.overview') }}</template>
            <TouchScroll class="PluginFeature-TabScroll" no-padding>
              <div class="PluginFeature-TabScrollContent">
                <TuffGroupBlock
                  class="PluginFeature-Overview"
                  :name="t('plugin.features.drawer.overview')"
                >
                  <template #icon>
                    <i class="i-ri-information-line text-[var(--tx-color-primary)]" />
                  </template>
                  <div class="p-4 space-y-3">
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.featureId') }}
                      </span>
                      <code class="text-sm bg-[var(--tx-fill-color)] px-2 py-1 rounded">{{
                        feature.id
                      }}</code>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.commandsCount') }}
                      </span>
                      <span class="text-sm font-medium">{{ feature.commands?.length || 0 }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.featureType') }}
                      </span>
                      <span
                        class="text-sm bg-[var(--tx-color-primary-light-9)] text-[var(--tx-color-primary)] px-2 py-1 rounded"
                        >{{
                          feature.interaction?.type || t('plugin.features.drawer.standardType')
                        }}</span
                      >
                    </div>
                    <div v-if="feature.acceptedInputTypes" class="flex justify-between items-start">
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.acceptedInputs') }}
                      </span>
                      <div class="flex flex-wrap gap-1 justify-end max-w-[60%]">
                        <span
                          v-for="inputType in feature.acceptedInputTypes"
                          :key="inputType"
                          class="text-xs bg-[var(--tx-color-success-light-9)] text-[var(--tx-color-success)] px-2 py-1 rounded"
                        >
                          <i :class="getInputTypeIcon(inputType)" class="mr-1" />
                          {{ inputType }}
                        </span>
                      </div>
                    </div>
                    <div v-else class="flex justify-between items-center">
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.acceptedInputs') }}
                      </span>
                      <span class="text-xs text-[var(--tx-text-color-secondary)]">
                        <i class="i-ri-text mr-1" />
                        {{ t('plugin.features.drawer.defaultInput') }}
                      </span>
                    </div>
                    <div
                      v-if="feature.priority !== undefined"
                      class="flex justify-between items-center"
                    >
                      <span class="text-sm text-[var(--tx-text-color-regular)]">
                        {{ t('plugin.features.drawer.priority') }}
                      </span>
                      <span class="text-sm font-medium">{{ feature.priority }}</span>
                    </div>
                  </div>
                </TuffGroupBlock>
              </div>
            </TouchScroll>
          </TxTabItem>

          <TxTabItem name="data">
            <template #name>{{ t('plugin.features.data.tab') }}</template>
            <TouchScroll class="PluginFeature-TabScroll" no-padding>
              <div class="PluginFeature-TabScrollContent">
                <div class="space-y-4">
                  <TuffGroupBlock
                    class="PluginFeature-Data"
                    :name="t('plugin.features.data.featureTitle')"
                    :description="t('plugin.features.data.featureDesc')"
                    :default-expand="false"
                  >
                    <template #icon>
                      <i class="i-ri-database-2-line text-[var(--tx-color-info)]" />
                    </template>
                    <div class="p-4">
                      <TouchScroll native no-padding direction="horizontal">
                        <pre
                          class="PluginFeature-Json text-xs text-[var(--tx-text-color-secondary)]"
                          >{{ formatJson(feature) }}</pre
                        >
                      </TouchScroll>
                    </div>
                  </TuffGroupBlock>

                  <TuffGroupBlock
                    v-for="(command, index) in feature.commands || []"
                    :key="`${command.type}-${index}`"
                    class="PluginFeature-Data"
                    :name="getCommandTitle(command, index)"
                    :description="t('plugin.features.data.commandDesc')"
                    :default-expand="false"
                  >
                    <template #icon>
                      <i class="i-ri-terminal-box-line text-[var(--tx-color-primary)]" />
                    </template>
                    <div class="p-4">
                      <TouchScroll native no-padding direction="horizontal">
                        <pre
                          class="PluginFeature-Json text-xs text-[var(--tx-text-color-secondary)]"
                          >{{ formatJson(command) }}</pre
                        >
                      </TouchScroll>
                    </div>
                  </TuffGroupBlock>

                  <div
                    v-if="!feature.commands || feature.commands.length === 0"
                    class="text-sm text-[var(--tx-text-color-secondary)] px-2"
                  >
                    {{ t('plugin.features.data.empty') }}
                  </div>
                </div>
              </div>
            </TouchScroll>
          </TxTabItem>

          <TxTabItem v-if="feature?.interaction" name="interaction">
            <template #name>{{ t('plugin.features.interaction.tab') }}</template>
            <TouchScroll class="PluginFeature-TabScroll" no-padding>
              <div class="PluginFeature-TabScrollContent">
                <div class="space-y-4">
                  <TuffGroupBlock
                    class="PluginFeature-Interaction"
                    :name="t('plugin.features.interaction.title')"
                  >
                    <template #icon>
                      <i class="i-ri-exchange-line text-[var(--tx-color-primary)]" />
                    </template>
                    <div class="p-4 space-y-3">
                      <div class="flex justify-between items-center">
                        <span class="text-sm text-[var(--tx-text-color-regular)]">
                          {{ t('plugin.features.interaction.type') }}
                        </span>
                        <span class="text-sm font-medium">{{ feature.interaction?.type }}</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-sm text-[var(--tx-text-color-regular)]">
                          {{ t('plugin.features.interaction.path') }}
                        </span>
                        <code class="text-sm bg-[var(--tx-fill-color)] px-2 py-1 rounded">{{
                          feature.interaction?.path || '-'
                        }}</code>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-sm text-[var(--tx-text-color-regular)]">
                          {{ t('plugin.features.interaction.showInput') }}
                        </span>
                        <span class="text-sm font-medium">{{
                          resolveInteractionFlag(feature.interaction?.showInput)
                        }}</span>
                      </div>
                      <div class="flex justify-between items-center">
                        <span class="text-sm text-[var(--tx-text-color-regular)]">
                          {{ t('plugin.features.interaction.allowInput') }}
                        </span>
                        <span class="text-sm font-medium">{{
                          resolveInteractionFlag(feature.interaction?.allowInput)
                        }}</span>
                      </div>
                    </div>
                  </TuffGroupBlock>
                </div>
              </div>
            </TouchScroll>
          </TxTabItem>

          <TxTabItem v-if="widgetTabEnabled" name="widget">
            <template #name>Widget</template>
            <TouchScroll class="PluginFeature-TabScroll" no-padding>
              <div class="PluginFeature-TabScrollContent">
                <div class="space-y-4">
                  <TuffGroupBlock
                    v-if="widgetTabEnabled"
                    class="PluginFeature-Widget"
                    :name="t('plugin.features.widget.title')"
                  >
                    <template #icon>
                      <i class="i-ri-layout-2-line text-[var(--tx-color-warning)]" />
                    </template>
                    <TuffBlockLine
                      :title="t('plugin.features.widget.status')"
                      :description="widgetStatus"
                    />
                    <TuffBlockSlot
                      :title="t('plugin.features.widget.details')"
                      :description="t('plugin.features.widget.detailsDesc')"
                      default-icon="i-ri-link-m"
                    >
                      <div class="space-y-2 w-full">
                        <div class="flex items-center gap-2 min-w-0">
                          <code
                            class="PluginFeature-Path text-xs bg-[var(--tx-fill-color)] px-2 py-1 rounded flex-1 min-w-0"
                          >
                            <span class="PluginFeature-PathText">
                              {{ widgetSourceDisplayPath }}
                            </span>
                          </code>
                          <TxSplitButton
                            size="sm"
                            variant="ghost"
                            icon="i-ri-file-copy-line"
                            :disabled="isOperationDisabled || !widgetSourceFilePath"
                            :menu-disabled="isOperationDisabled || !widgetSourceFilePath"
                            :menu-width="160"
                            @click="handleCopy(widgetSourceFilePath)"
                          >
                            {{ t('plugin.features.widget.copy') }}
                            <template #menu="{ close }">
                              <div class="PluginFeature-PathMenu">
                                <TxButton
                                  size="sm"
                                  plain
                                  block
                                  icon="i-ri-folder-open-line"
                                  :disabled="isOperationDisabled || !widgetSourceFilePath"
                                  @click="
                                    () => {
                                      close()
                                      handleReveal(widgetSourceFilePath)
                                    }
                                  "
                                >
                                  {{ t('plugin.features.widget.revealFile') }}
                                </TxButton>
                              </div>
                            </template>
                          </TxSplitButton>
                        </div>
                        <div v-if="widgetSourceUrl" class="flex items-center gap-2 min-w-0">
                          <code
                            class="PluginFeature-Path text-xs bg-[var(--tx-fill-color)] px-2 py-1 rounded flex-1 min-w-0"
                          >
                            <span class="PluginFeature-PathText">
                              {{ widgetSourceUrl }}
                            </span>
                          </code>
                          <TxButton
                            size="sm"
                            plain
                            icon="i-ri-file-copy-line"
                            :disabled="isOperationDisabled || !widgetSourceUrl"
                            @click="handleCopy(widgetSourceUrl)"
                          >
                            {{ t('plugin.features.widget.copy') }}
                          </TxButton>
                        </div>
                        <div
                          v-if="widgetCompiledDisplayPath"
                          class="flex items-center gap-2 min-w-0"
                        >
                          <code
                            class="PluginFeature-Path PluginFeature-Path--compiled text-xs bg-[var(--tx-color-primary-light-9)] text-[var(--tx-color-primary)] px-2 py-1 rounded flex-1 min-w-0 font-semibold"
                          >
                            <span class="PluginFeature-PathText">
                              {{ widgetCompiledDisplayPath }}
                            </span>
                          </code>
                          <TxSplitButton
                            size="sm"
                            variant="ghost"
                            icon="i-ri-file-copy-line"
                            :disabled="isOperationDisabled || !widgetCompiledPath"
                            :menu-disabled="isOperationDisabled || !widgetCompiledPath"
                            :menu-width="160"
                            @click="handleCopy(widgetCompiledPath)"
                          >
                            {{ t('plugin.features.widget.copy') }}
                            <template #menu="{ close }">
                              <div class="PluginFeature-PathMenu">
                                <TxButton
                                  size="sm"
                                  plain
                                  block
                                  icon="i-ri-folder-open-line"
                                  :disabled="isOperationDisabled || !widgetCompiledPath"
                                  @click="
                                    () => {
                                      close()
                                      handleReveal(widgetCompiledPath)
                                    }
                                  "
                                >
                                  {{ t('plugin.features.widget.revealFile') }}
                                </TxButton>
                              </div>
                            </template>
                          </TxSplitButton>
                        </div>
                        <div
                          v-if="widgetPathAliasNote"
                          class="text-xs text-[var(--tx-text-color-secondary)]"
                        >
                          {{ widgetPathAliasNote }}
                        </div>
                      </div>
                    </TuffBlockSlot>
                  </TuffGroupBlock>

                  <TuffGroupBlock
                    v-if="widgetPreviewOptions.length"
                    class="PluginFeature-WidgetPreview"
                    :name="t('plugin.features.widget.preview.title')"
                    :description="t('plugin.features.widget.preview.description')"
                  >
                    <template #icon>
                      <i class="i-ri-eye-line text-[var(--tx-color-primary)]" />
                    </template>
                    <div class="p-4">
                      <div class="PluginFeature-PreviewControls">
                        <span class="text-xs text-[var(--tx-text-color-secondary)]">
                          {{ t('plugin.features.widget.preview.selectLabel') }}
                        </span>
                        <TuffSelect
                          v-model="currentPreviewWidgetId"
                          class="PluginFeature-PreviewSelect"
                          :placeholder="t('plugin.features.widget.preview.selectPlaceholder')"
                          :disabled="isOperationDisabled"
                        >
                          <TuffSelectItem
                            v-for="option in widgetPreviewOptions"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value"
                          />
                        </TuffSelect>
                      </div>
                      <div class="PluginFeature-PreviewMeta">
                        <span
                          class="PluginFeature-PreviewStatus"
                          :class="{
                            'is-ready': previewWidgetReady,
                            'is-loading': previewWidgetRegistering,
                            'is-error':
                              Boolean(previewWidgetRenderError) ||
                              (!previewWidgetReady && previewWidgetIssues.length)
                          }"
                        >
                          {{ t('plugin.features.widget.preview.statusLabel') }}:
                          {{ previewWidgetStatus }}
                        </span>
                        <div class="PluginFeature-PreviewActions">
                          <TxButton
                            size="sm"
                            plain
                            :loading="previewWidgetRegistering"
                            :disabled="isOperationDisabled || !previewWidgetId"
                            @click="handleReloadWidget"
                          >
                            {{ t('plugin.features.widget.preview.reloadCurrent') }}
                          </TxButton>
                          <TxButton
                            size="sm"
                            plain
                            :disabled="isOperationDisabled || !widgetPreviewOptions.length"
                            @click="handleReloadAllWidgets"
                          >
                            {{ t('plugin.features.widget.preview.reloadAll') }}
                          </TxButton>
                        </div>
                      </div>
                      <div class="PluginFeature-PreviewSize">
                        <span class="text-xs text-[var(--tx-text-color-secondary)]">{{
                          t('plugin.features.widget.preview.sizeLabel')
                        }}</span>
                        <TuffSelect
                          v-model="currentPreviewSizePresetValue"
                          class="PluginFeature-PreviewSizeSelect"
                          :placeholder="t('plugin.features.widget.preview.sizePlaceholder')"
                          :disabled="isOperationDisabled || !previewWidgetId"
                        >
                          <TuffSelectItem
                            v-for="option in previewSizeOptions"
                            :key="option.value"
                            :label="option.label"
                            :value="option.value"
                          />
                        </TuffSelect>
                        <span class="PluginFeature-PreviewSizeMeta">
                          {{ previewFrameSizeLabel }}
                        </span>
                        <TxButton
                          size="sm"
                          plain
                          :disabled="isOperationDisabled || !previewWidgetId"
                          @click="handleResetPreviewFrameSize"
                        >
                          {{ t('plugin.features.widget.preview.reset') }}
                        </TxButton>
                        <span class="PluginFeature-PreviewSizeHint">{{
                          t('plugin.features.widget.preview.resizeHint')
                        }}</span>
                      </div>
                      <div v-if="previewWidgetHint" class="PluginFeature-PreviewHint">
                        {{ previewWidgetHint }}
                      </div>
                      <div class="PluginFeature-PreviewMock">
                        <div class="PluginFeature-PreviewMockHeader">
                          <span class="text-xs text-[var(--tx-text-color-secondary)]">
                            {{ t('plugin.features.widget.preview.mockLabel') }}
                          </span>
                          <TuffSwitch
                            v-model="currentMockPayloadEnabled"
                            size="small"
                            :disabled="isOperationDisabled"
                          />
                        </div>
                        <TuffInput
                          v-model="currentMockPayloadRaw"
                          type="textarea"
                          :rows="4"
                          :placeholder="t('plugin.features.widget.preview.mockPlaceholder')"
                          :disabled="isOperationDisabled || !currentMockPayloadEnabled"
                        />
                        <div
                          v-if="currentMockPayloadEnabled && mockPayloadError"
                          class="PluginFeature-PreviewMockError"
                        >
                          {{
                            t('plugin.features.widget.preview.mockError', {
                              error: mockPayloadError
                            })
                          }}
                        </div>
                      </div>
                      <div
                        v-if="previewWidgetRenderError || previewWidgetIssues.length"
                        class="PluginFeature-PreviewIssues"
                      >
                        <div
                          v-if="previewWidgetRenderError"
                          class="PluginFeature-PreviewIssue is-error"
                        >
                          <div class="PluginFeature-PreviewIssueTitle">RENDER_ERROR</div>
                          <div class="PluginFeature-PreviewIssueMessage">
                            {{ previewWidgetRenderError }}
                          </div>
                        </div>
                        <div
                          v-for="(issue, index) in previewWidgetIssues"
                          :key="`${issue.code || 'issue'}-${index}`"
                          class="PluginFeature-PreviewIssue"
                          :class="{
                            'is-error': issue.type === 'error',
                            'is-warning': issue.type === 'warning'
                          }"
                        >
                          <div class="PluginFeature-PreviewIssueTitle">
                            {{ issue.code || issue.source || 'Widget' }}
                          </div>
                          <div class="PluginFeature-PreviewIssueMessage">
                            {{ resolveIssueMessage(issue.message || '') }}
                          </div>
                          <div v-if="issue.suggestion" class="PluginFeature-PreviewIssueHint">
                            {{ resolveIssueMessage(issue.suggestion) }}
                          </div>
                        </div>
                      </div>
                      <div :ref="previewFrameHostRef" class="PluginFeature-PreviewFrameHost">
                        <div
                          class="PluginFeature-PreviewFrame"
                          :class="{ 'is-resizing': previewFrameResizing }"
                          :style="previewFrameStyle"
                        >
                          <WidgetFrame
                            v-if="previewWidgetId"
                            :renderer-id="previewWidgetId"
                            :item="previewWidgetItem || undefined"
                            :payload="
                              currentMockPayloadEnabled ? mockPayloadValue || undefined : undefined
                            "
                            preview
                            @render-error="handleRenderError"
                          />
                          <div v-else class="text-sm text-[var(--tx-text-color-secondary)]">
                            {{ t('plugin.features.widget.preview.missingWidgetId') }}
                          </div>
                          <TxButton
                            variant="ghost"
                            :border="false"
                            :disabled="isOperationDisabled || !previewWidgetId"
                            class="PluginFeature-PreviewResizeHandle"
                            :class="{ 'is-disabled': isOperationDisabled || !previewWidgetId }"
                            :aria-label="t('plugin.features.widget.preview.resizeAriaLabel')"
                            @pointerdown="handlePreviewResizeStart"
                          />
                        </div>
                      </div>
                    </div>
                  </TuffGroupBlock>
                </div>
              </div>
            </TouchScroll>
          </TxTabItem>
        </TxTabs>
      </div>
    </div>

    <div v-if="isDevDisconnected" class="PluginFeature-DevWarning">
      <div class="PluginFeature-DevWarningInfo">
        <i class="i-ri-alert-fill PluginFeature-DevWarningIcon" />
        <div class="PluginFeature-DevWarningText">
          <div class="PluginFeature-DevWarningTitle">
            {{ t('plugin.features.devDisconnectedTitle') }}
          </div>
          <div class="PluginFeature-DevWarningDesc">
            {{ devDisconnectMessage }}
          </div>
          <div v-if="devDisconnectReason" class="PluginFeature-DevWarningReason">
            {{ t('plugin.features.devDisconnectedReason', { reason: devDisconnectReason }) }}
          </div>
          <div v-if="devDisconnectSuggestion" class="PluginFeature-DevWarningSuggestion">
            {{ devDisconnectSuggestion }}
          </div>
        </div>
      </div>
      <TxButton
        size="sm"
        variant="flat"
        type="warning"
        :loading="reconnectLoading"
        :disabled="!canReconnect"
        @click="handleReconnect"
      >
        {{ t('plugin.actions.reconnect') }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
pre {
  font-family:
    'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.PluginFeature-Detail {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.PluginFeature-DetailHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.PluginFeature-DetailBody {
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.PluginFeature-DetailContent {
  opacity: 1;
  filter: none;
  transform: none;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.PluginFeature-TabScroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.PluginFeature-TabScrollContent {
  padding: 0 24px 32px;
  min-height: 100%;
  box-sizing: border-box;
}

.PluginFeature-DetailTabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.PluginFeature-DetailTabs :deep(.tx-tabs) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.PluginFeature-DetailTabs :deep(.tx-tabs__auto-sizer) {
  height: 100%;
  min-height: 0;
}

.PluginFeature-DetailTabs :deep(.tx-tabs__auto-sizer > *) {
  height: 100%;
  min-height: 0;
}

.PluginFeature-DetailTabs :deep(.tx-tabs__main) {
  flex: 1;
  min-height: 0;
}

.PluginFeature-DetailTabs :deep(.tx-tabs__content-wrapper) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.PluginFeature-DetailTabs :deep(.tx-tabs__nav) {
  margin: 0 0 16px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--tx-bg-color-overlay);
}

.PluginFeature-Json {
  font-size: 12px;
  line-height: 1.6;
}

.PluginFeature-PreviewControls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.PluginFeature-PreviewSelect {
  flex: 1;
  min-width: 180px;
}

.PluginFeature-PreviewMeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.PluginFeature-PreviewStatus {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
}

.PluginFeature-PreviewStatus.is-ready {
  color: var(--tx-color-success);
  background: var(--tx-color-success-light-9);
}

.PluginFeature-PreviewStatus.is-loading {
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-light-9);
}

.PluginFeature-PreviewStatus.is-error {
  color: var(--tx-color-danger);
  background: var(--tx-color-danger-light-9);
}

.PluginFeature-PreviewActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.PluginFeature-PreviewSize {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.PluginFeature-PreviewSizeSelect {
  min-width: 160px;
}

.PluginFeature-PreviewSizeMeta {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.PluginFeature-PreviewSizeHint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.PluginFeature-PreviewHint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin-bottom: 12px;
}

.PluginFeature-PreviewMock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.PluginFeature-PreviewMock :deep(.tx-input__textarea) {
  resize: vertical;
  min-height: 120px;
  max-height: 220px;
}

.PluginFeature-PreviewMockHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.PluginFeature-PreviewMockError {
  font-size: 12px;
  color: var(--tx-color-danger);
}

.PluginFeature-PreviewIssues {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.PluginFeature-PreviewIssue {
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-fill-color-lighter);
}

.PluginFeature-PreviewIssue.is-warning {
  border-color: var(--tx-color-warning-light-7);
  background: var(--tx-color-warning-light-9);
}

.PluginFeature-PreviewIssue.is-error {
  border-color: var(--tx-color-danger-light-7);
  background: var(--tx-color-danger-light-9);
}

.PluginFeature-PreviewIssueTitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.PluginFeature-PreviewIssueMessage {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin-top: 2px;
}

.PluginFeature-PreviewIssueHint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  margin-top: 4px;
}

.PluginFeature-PreviewFrameHost {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 6px;
}

.PluginFeature-PreviewFrame {
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color-page);
  overflow: hidden;
}

.PluginFeature-PreviewFrame.is-resizing {
  cursor: nwse-resize;
}

.PluginFeature-PreviewResizeHandle {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 14px;
  height: 14px;
  padding: 0;
  box-shadow: none;
  border-radius: 4px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-light);
  cursor: nwse-resize;
  opacity: 0.6;
}

.PluginFeature-PreviewResizeHandle:hover {
  opacity: 0.9;
}

.PluginFeature-PreviewResizeHandle.is-disabled {
  opacity: 0.2;
  cursor: not-allowed;
  pointer-events: none;
}

.PluginFeature-Path {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
}

.PluginFeature-PathText {
  direction: ltr;
  unicode-bidi: plaintext;
}

.PluginFeature-PathMenu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.PluginFeature-DevWarning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: var(--tx-color-warning-light-9);
  border-top: 1px solid var(--tx-color-warning-light-7);
  color: var(--tx-color-warning);
  border-radius: 0 0 1.5rem 1.5rem;
}

.PluginFeature-DevWarningInfo {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.PluginFeature-DevWarningIcon {
  font-size: 18px;
  flex-shrink: 0;
}

.PluginFeature-DevWarningText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.PluginFeature-DevWarningTitle {
  font-weight: 600;
  color: var(--tx-color-warning);
}

.PluginFeature-DevWarningDesc,
.PluginFeature-DevWarningReason,
.PluginFeature-DevWarningSuggestion {
  font-size: 12px;
  color: var(--tx-text-color-regular);
  word-break: break-word;
}
</style>
