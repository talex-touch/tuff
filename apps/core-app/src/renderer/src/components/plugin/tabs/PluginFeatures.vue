<script lang="ts" setup>
import type { TuffItem } from '@talex-touch/utils'
import type { ComponentPublicInstance } from 'vue'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { resolveI18nMessage } from '@talex-touch/utils/i18n'
import { TxFlipOverlay, type TxFlipOverlayInstance } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getCustomRenderer } from '~/modules/box/custom-render'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import StatCard from '../../base/card/StatCard.vue'
import GridLayout from '../../base/layout/GridLayout.vue'
import FeatureCard from '../FeatureCard.vue'
import PluginFeatureDetailCard from './PluginFeatureDetailCard.vue'
import PluginFeatureEmptyState from './PluginFeatureEmptyState.vue'

type PluginFeatureWithCommandsData = IPluginFeature

interface PluginPaths {
  pluginPath: string
  dataPath: string
  configPath: string
  logsPath: string
  tempPath: string
}

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Features state - with defensive checks
const features = computed<PluginFeatureWithCommandsData[]>(() => props.plugin?.features || [])
const sortedFeatures = computed<PluginFeatureWithCommandsData[]>(() => {
  return features.value
    .map((feature, index) => ({ feature, index }))
    .sort((a, b) => {
      const aPriority = typeof a.feature.priority === 'number' ? a.feature.priority : -Infinity
      const bPriority = typeof b.feature.priority === 'number' ? b.feature.priority : -Infinity
      if (aPriority !== bPriority) {
        return bPriority - aPriority
      }
      return a.index - b.index
    })
    .map(({ feature }) => feature)
})

const totalCommands = computed(() =>
  features.value.reduce((total, feature) => total + (feature.commands?.length || 0), 0)
)

const { t } = useI18n()
const isPluginDev = computed(() => Boolean(props.plugin?.dev?.enable))
const isDevDisconnected = computed(() => props.plugin?.status === EPluginStatus.DEV_DISCONNECTED)
const isOperationDisabled = computed(
  () =>
    props.plugin?.status === EPluginStatus.DEV_DISCONNECTED ||
    props.plugin?.status === EPluginStatus.DEV_RECONNECTING
)
const devDisconnectIssue = computed(() =>
  props.plugin?.issues?.find((issue) => issue.code === 'DEV_SERVER_DISCONNECTED')
)
const devDisconnectMessage = computed(() => {
  const issue = devDisconnectIssue.value
  if (issue?.message) return resolveI18nMessage(issue.message)
  return 'Dev Server 已断开连接'
})
const devDisconnectSuggestion = computed(() => {
  const suggestion = devDisconnectIssue.value?.suggestion
  return suggestion ? resolveI18nMessage(suggestion) : ''
})
const devDisconnectReason = computed(() => {
  const meta = devDisconnectIssue.value?.meta as { error?: string } | undefined
  return meta?.error ? String(meta.error) : ''
})
const reconnectLoading = ref(false)
const canReconnect = computed(() => props.plugin?.status === EPluginStatus.DEV_DISCONNECTED)

// Feature detail panel state
const FLIP_DURATION = 480
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.12
const showDetail = ref(false)
const isDetailExpanded = ref(false)
const isDetailAnimating = ref(false)
const selectedFeature = ref<PluginFeatureWithCommandsData | null>(null)
const activeFeatureId = ref<string | null>(null)
const detailOverlayRef = ref<TxFlipOverlayInstance | null>(null)
const detailSourceEl = ref<HTMLElement | null>(null)
const detailTab = ref<'overview' | 'data' | 'interaction' | 'widget'>('overview')
const previewWidgetId = ref<string | null>(null)
const pluginPaths = ref<PluginPaths | null>(null)
const isLoadingPaths = ref(false)
const widgetRegistering = ref<Record<string, boolean>>({})
const widgetRenderErrors = ref<Record<string, string>>({})
const mockPayloadEnabled = ref(false)
const mockPayloadRaw = ref('')
const mockPayloadValue = ref<Record<string, unknown> | null>(null)
const mockPayloadError = ref('')
const widgetRegistrationCache = new Set<string>()

const previewFrameHostRef = ref<HTMLElement | null>(null)
const setPreviewFrameHostRef = (el: Element | ComponentPublicInstance | null) => {
  previewFrameHostRef.value = el instanceof HTMLElement ? el : null
}
const previewFrameSize = ref({ width: 560, height: 360, preset: 'm' })
const previewFrameResizing = ref(false)
const previewFrameDragState = ref<{
  startX: number
  startY: number
  startWidth: number
  startHeight: number
} | null>(null)

const previewSizePresets = [
  { value: 'xs', label: 'XS 320×240', width: 320, height: 240 },
  { value: 's', label: 'S 420×300', width: 420, height: 300 },
  { value: 'm', label: 'M 560×360', width: 560, height: 360 },
  { value: 'l', label: 'L 720×480', width: 720, height: 480 },
  { value: 'xl', label: 'XL 900×600', width: 900, height: 600 }
]

const widgetPreviewOptions = computed(() => {
  const feature = selectedFeature.value
  if (!isWidgetFeature(feature)) return []
  const widgetId = getWidgetId(feature)
  if (!widgetId) return []
  return [
    {
      value: widgetId,
      label: feature?.name ?? widgetId
    }
  ]
})

const previewWidgetReady = computed(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId) return false
  return Boolean(getCustomRenderer(widgetId))
})

const previewWidgetRegistering = computed(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId) return false
  return Boolean(widgetRegistering.value[widgetId])
})

const previewWidgetRenderError = computed(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId) return ''
  return widgetRenderErrors.value[widgetId] || ''
})

const previewFrameStorageKey = computed(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId) return ''
  const pluginName = typeof props.plugin?.name === 'string' ? props.plugin.name : 'unknown'
  return `plugin-widget-preview-size:${pluginName}:${widgetId}`
})

const previewSizeOptions = computed(() => {
  const customLabel = `自定义 ${previewFrameSize.value.width}×${previewFrameSize.value.height}`
  return [
    ...previewSizePresets,
    {
      value: 'custom',
      label: customLabel,
      width: previewFrameSize.value.width,
      height: previewFrameSize.value.height
    }
  ]
})

const previewSizePresetValue = computed({
  get: () => previewFrameSize.value.preset,
  set: (value: string) => {
    if (value === 'custom') return
    const preset = previewSizePresets.find((item) => item.value === value)
    if (!preset) return
    previewFrameSize.value = { width: preset.width, height: preset.height, preset: preset.value }
    persistPreviewFrameSize()
  }
})

const previewFrameStyle = computed(() => ({
  width: `${previewFrameSize.value.width}px`,
  height: `${previewFrameSize.value.height}px`
}))

const previewFrameSizeLabel = computed(
  () => `${previewFrameSize.value.width}×${previewFrameSize.value.height}`
)

function persistPreviewFrameSize(): void {
  if (!previewFrameStorageKey.value) return
  try {
    localStorage.setItem(previewFrameStorageKey.value, JSON.stringify(previewFrameSize.value))
  } catch {
    // ignore persistence errors
  }
}

function loadPreviewFrameSize(): void {
  if (!previewFrameStorageKey.value) return
  try {
    const raw = localStorage.getItem(previewFrameStorageKey.value)
    if (!raw) return
    const parsed = JSON.parse(raw) as { width?: number; height?: number; preset?: string }
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      previewFrameSize.value = {
        width: parsed.width,
        height: parsed.height,
        preset: parsed.preset || 'custom'
      }
    }
  } catch {
    // ignore parse errors
  }
}

function resetPreviewFrameSize(): void {
  const preset = previewSizePresets.find((item) => item.value === 'm') || previewSizePresets[0]
  previewFrameSize.value = { width: preset.width, height: preset.height, preset: preset.value }
  if (previewFrameStorageKey.value) {
    try {
      localStorage.removeItem(previewFrameStorageKey.value)
    } catch {
      // ignore
    }
  }
}

function getPreviewFrameBounds(): {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
} {
  const minWidth = 280
  const minHeight = 200
  const hostRect = previewFrameHostRef.value?.getBoundingClientRect()
  const maxWidth = hostRect ? Math.max(minWidth, Math.floor(hostRect.width)) : 960
  const viewportMaxHeight = Math.max(360, window.innerHeight - 260)
  const maxHeight = Math.min(720, viewportMaxHeight)
  return { minWidth, minHeight, maxWidth, maxHeight }
}

function handlePreviewResizeMove(event: PointerEvent): void {
  if (!previewFrameDragState.value) return
  const bounds = getPreviewFrameBounds()
  const deltaX = event.clientX - previewFrameDragState.value.startX
  const deltaY = event.clientY - previewFrameDragState.value.startY
  const nextWidth = Math.min(
    bounds.maxWidth,
    Math.max(bounds.minWidth, previewFrameDragState.value.startWidth + deltaX)
  )
  const nextHeight = Math.min(
    bounds.maxHeight,
    Math.max(bounds.minHeight, previewFrameDragState.value.startHeight + deltaY)
  )
  previewFrameSize.value = {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
    preset: 'custom'
  }
  persistPreviewFrameSize()
}

function handlePreviewResizeEnd(): void {
  previewFrameDragState.value = null
  previewFrameResizing.value = false
  window.removeEventListener('pointermove', handlePreviewResizeMove)
  window.removeEventListener('pointerup', handlePreviewResizeEnd)
}

function handlePreviewResizeStart(event: PointerEvent): void {
  if (event.button !== 0) return
  if (isOperationDisabled.value || !previewWidgetId.value) return
  event.preventDefault()
  previewFrameResizing.value = true
  previewFrameDragState.value = {
    startX: event.clientX,
    startY: event.clientY,
    startWidth: previewFrameSize.value.width,
    startHeight: previewFrameSize.value.height
  }
  window.addEventListener('pointermove', handlePreviewResizeMove)
  window.addEventListener('pointerup', handlePreviewResizeEnd)
}

const previewPayloadInvalid = computed(
  () => mockPayloadEnabled.value && Boolean(mockPayloadError.value)
)
const previewPayloadActive = computed(
  () => mockPayloadEnabled.value && Boolean(mockPayloadValue.value)
)

const previewWidgetIssues = computed(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId) return []
  const feature = resolveWidgetFeature(widgetId)
  const source = feature ? `feature:${feature.id}` : null
  const issues = props.plugin?.issues ?? []
  return issues.filter((issue) => {
    if (issue.code === 'DEV_SERVER_DISCONNECTED') return true
    if (source && issue.source === source) return true
    if (issue.code?.startsWith('WIDGET_') && (!issue.source || issue.source === source)) return true
    return false
  })
})

const previewWidgetItem = computed<TuffItem | null>(() => {
  const widgetId = previewWidgetId.value
  if (!widgetId || !props.plugin?.name) return null
  const feature = resolveWidgetFeature(widgetId)
  const title = feature?.name || props.plugin.name
  return {
    id: `preview:${widgetId}`,
    source: {
      type: 'plugin',
      id: props.plugin.name,
      name: props.plugin.name,
      version: props.plugin.version
    },
    kind: 'feature',
    render: {
      mode: 'custom',
      basic: {
        title,
        subtitle: 'Widget 预览'
      },
      custom: {
        type: 'vue',
        content: widgetId,
        data: mockPayloadValue.value ?? undefined
      }
    },
    meta: {
      pluginName: props.plugin.name,
      featureId: feature?.id,
      interaction: feature?.interaction
    }
  }
})

const previewWidgetStatus = computed(() => {
  if (!previewWidgetId.value) return '未选择'
  if (previewPayloadInvalid.value) return 'Payload 无效'
  if (previewWidgetRegistering.value) return '加载中'
  if (previewWidgetRenderError.value) return '渲染失败'
  if (previewWidgetReady.value) return '已加载'
  if (previewWidgetIssues.value.some((issue) => issue.type === 'error')) return '异常'
  return '暂未就绪'
})

const previewWidgetHint = computed(() => {
  if (!previewWidgetId.value) return ''
  if (previewPayloadInvalid.value) return `Mock payload 解析失败：${mockPayloadError.value}`
  if (mockPayloadEnabled.value && !previewPayloadActive.value) {
    return '已开启 Mock Payload，但内容为空'
  }
  if (previewPayloadActive.value) return '使用 Mock Payload 渲染'
  if (!previewWidgetReady.value) return ''
  if (previewWidgetRenderError.value) return ''
  if (previewWidgetIssues.value.length) return ''
  return '提示：Widget 已加载但内容为空时，通常需要 payload 或运行时数据。'
})

const widgetPathAliasNote = computed(() => {
  const pluginPath = pluginPaths.value?.pluginPath
  if (!pluginPath) return ''
  return t('plugin.features.widget.pathAliasNote', { path: pluginPath })
})
watch(
  () => props.plugin?.name,
  () => {
    pluginPaths.value = null
    widgetRegistrationCache.clear()
    widgetRegistering.value = {}
    widgetRenderErrors.value = {}
    mockPayloadEnabled.value = false
    mockPayloadRaw.value = ''
    mockPayloadValue.value = null
    mockPayloadError.value = ''
  }
)

// Feature details management
function showFeatureDetails(feature: PluginFeatureWithCommandsData, event?: MouseEvent): void {
  if (showDetail.value || isDetailAnimating.value) return
  const target = event?.currentTarget as HTMLElement | null
  detailSourceEl.value = target
  selectedFeature.value = feature
  activeFeatureId.value = feature.id
  showDetail.value = true
  detailTab.value = 'overview'
  previewWidgetId.value = isWidgetFeature(feature) ? getWidgetId(feature) : null
  void ensureWidgetRegistered(previewWidgetId.value)
  void ensurePluginPaths()
}

async function ensurePluginPaths(): Promise<void> {
  if (isLoadingPaths.value || pluginPaths.value || !props.plugin?.name) {
    return
  }
  isLoadingPaths.value = true
  try {
    pluginPaths.value = await pluginSDK.getPaths(props.plugin.name)
  } finally {
    isLoadingPaths.value = false
  }
}

function handleDetailClose(): void {
  if (!showDetail.value) return
  if (!detailOverlayRef.value) {
    showDetail.value = false
    handleDetailClosed()
    return
  }
  detailOverlayRef.value.close()
}

function handleDetailClosed(): void {
  selectedFeature.value = null
  activeFeatureId.value = null
  detailSourceEl.value = null
  detailTab.value = 'overview'
  previewWidgetId.value = null
  handlePreviewResizeEnd()
}

function handleEscapeClose(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  handleDetailClose()
}

watch(showDetail, (value) => {
  if (value) {
    window.addEventListener('keydown', handleEscapeClose)
  } else {
    window.removeEventListener('keydown', handleEscapeClose)
  }
})

watch(
  widgetPreviewOptions,
  (options) => {
    if (!options.length) {
      previewWidgetId.value = null
      if (detailTab.value === 'widget') {
        detailTab.value = 'overview'
      }
      return
    }
    if (
      !previewWidgetId.value ||
      !options.some((option) => option.value === previewWidgetId.value)
    ) {
      previewWidgetId.value = options[0].value
    }
  },
  { immediate: true }
)

watch(previewWidgetId, (value) => {
  void ensureWidgetRegistered(value)
  resetPreviewFrameSize()
  if (value) {
    loadPreviewFrameSize()
  }
})

watch(
  [mockPayloadRaw, mockPayloadEnabled],
  () => {
    if (!mockPayloadEnabled.value) {
      mockPayloadValue.value = null
      mockPayloadError.value = ''
      return
    }
    const raw = mockPayloadRaw.value.trim()
    if (!raw) {
      mockPayloadValue.value = null
      mockPayloadError.value = ''
      return
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      mockPayloadValue.value = parsed
      mockPayloadError.value = ''
    } catch (error) {
      mockPayloadValue.value = null
      mockPayloadError.value = error instanceof Error ? error.message : String(error)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscapeClose)
  handlePreviewResizeEnd()
})

function isWidgetFeature(feature?: PluginFeatureWithCommandsData | null): boolean {
  return feature?.interaction?.type === 'widget'
}

function getWidgetPath(feature?: PluginFeatureWithCommandsData | null): string | null {
  const raw = feature?.interaction?.path
  return typeof raw === 'string' && raw.trim().length ? raw.trim() : null
}

function getWidgetExtension(pathValue?: string | null): string | null {
  if (!pathValue) return null
  const normalized = pathValue.split('?')[0].split('#')[0]
  const ext = normalized.includes('.') ? `.${normalized.split('.').pop()}` : null
  return ext ? ext.toLowerCase() : null
}

function normalizeWidgetPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const trimmed = normalized.replace(/^widgets\//, '')
  return trimmed ? trimmed : null
}

function withWidgetExtension(pathValue: string): string {
  return getWidgetExtension(pathValue) ? pathValue : `${pathValue}.vue`
}

function joinPaths(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  const trimmedBase = base.replace(/[\\/]+$/, '')
  const cleanedParts = parts.map((part) => part.replace(/^[\\/]+/, ''))
  return [trimmedBase, ...cleanedParts].join(separator)
}

function getWidgetId(feature?: PluginFeatureWithCommandsData | null): string | null {
  if (!feature) return null
  return `${props.plugin.name}::${feature.id}`
}

function resolveWidgetFeature(widgetId: string | null): PluginFeatureWithCommandsData | null {
  if (!widgetId) return null
  return sortedFeatures.value.find((feature) => getWidgetId(feature) === widgetId) ?? null
}

function setWidgetRegistering(widgetId: string, value: boolean): void {
  if (!widgetId) return
  if (value) {
    widgetRegistering.value = { ...widgetRegistering.value, [widgetId]: true }
    return
  }
  if (!widgetRegistering.value[widgetId]) return
  const next = { ...widgetRegistering.value }
  delete next[widgetId]
  widgetRegistering.value = next
}

async function requestWidgetRegister(
  widgetId: string | null,
  options?: { emitAsUpdate?: boolean; force?: boolean }
): Promise<boolean> {
  if (!widgetId || !props.plugin?.name) return false
  if (isPluginDev.value) {
    console.info(
      `[PluginFeatures] request widget ${options?.emitAsUpdate ? 'update' : 'register'}: ${widgetId}`
    )
  }
  const rendererReady = Boolean(getCustomRenderer(widgetId))
  if (!options?.force && widgetRegistrationCache.has(widgetId) && rendererReady) return true
  if (widgetRegistering.value[widgetId]) return false
  const feature = resolveWidgetFeature(widgetId)
  if (!feature || !isWidgetFeature(feature) || !getWidgetPath(feature)) return false
  setWidgetRegistering(widgetId, true)
  const success = await pluginSDK.registerWidget({
    plugin: props.plugin.name,
    feature: feature.id,
    emitAsUpdate: options?.emitAsUpdate
  })
  setWidgetRegistering(widgetId, false)
  if (success) {
    widgetRegistrationCache.add(widgetId)
  }
  return success
}

async function ensureWidgetRegistered(widgetId: string | null): Promise<void> {
  await requestWidgetRegister(widgetId)
}

function formatPluginAliasPath(pathValue?: string | null): string | null {
  if (!pathValue) return null
  const pluginPath = pluginPaths.value?.pluginPath
  if (!pluginPath) return pathValue
  const normalizedBase = pluginPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedPath = pathValue.replace(/\\/g, '/')
  if (!normalizedPath.startsWith(normalizedBase)) return pathValue
  const suffix = normalizedPath.slice(normalizedBase.length).replace(/^\/+/, '')
  return suffix ? `~/${suffix}` : '~'
}

function resolveWidgetSourceDisplayPath(feature?: PluginFeatureWithCommandsData | null): string {
  const sourcePath = resolveWidgetSourceFilePath(feature)
  if (sourcePath) return formatPluginAliasPath(sourcePath) || sourcePath
  const raw = getWidgetPath(feature)
  if (!raw) return t('plugin.features.widget.missingPath')
  const trimmed = normalizeWidgetPath(raw)
  if (!trimmed) return raw
  return `~/widgets/${withWidgetExtension(trimmed)}`
}

function resolveWidgetCompiledDisplayPath(
  feature?: PluginFeatureWithCommandsData | null
): string | null {
  const compiledPath = resolveWidgetCompiledPath(feature)
  if (!compiledPath) return null
  return formatPluginAliasPath(compiledPath) || compiledPath
}

function resolveWidgetStatus(feature?: PluginFeatureWithCommandsData | null): string {
  if (!feature || !getWidgetPath(feature)) {
    return t('plugin.features.widget.statusMissing')
  }
  return isPluginDev.value
    ? t('plugin.features.widget.statusDev')
    : t('plugin.features.widget.statusRelease')
}

function resolveWidgetSourceUrl(feature?: PluginFeatureWithCommandsData | null): string | null {
  if (
    !feature ||
    !props.plugin.dev?.enable ||
    !props.plugin.dev?.source ||
    !props.plugin.dev?.address
  ) {
    return null
  }
  const rawPath = getWidgetPath(feature)
  if (!rawPath) return null
  const trimmed = normalizeWidgetPath(rawPath)
  if (!trimmed) return null
  const withExt = withWidgetExtension(trimmed)
  const base = props.plugin.dev?.address
  try {
    const url = new URL(`widgets/${withExt}`, base)
    url.searchParams.set('raw', '1')
    return url.toString()
  } catch {
    return null
  }
}

function resolveWidgetSourceFilePath(
  feature?: PluginFeatureWithCommandsData | null
): string | null {
  const pluginPath = pluginPaths.value?.pluginPath
  if (!pluginPath) return null
  const rawPath = getWidgetPath(feature)
  if (!rawPath) return null
  const trimmed = normalizeWidgetPath(rawPath)
  if (!trimmed) return null
  return joinPaths(pluginPath, 'widgets', withWidgetExtension(trimmed))
}

function resolveWidgetCompiledPath(feature?: PluginFeatureWithCommandsData | null): string | null {
  const tempPath = pluginPaths.value?.tempPath
  const widgetId = getWidgetId(feature)
  if (!tempPath || !widgetId) return null
  const safeId = widgetId.replace(/[^a-zA-Z0-9._-]/g, '_')
  return joinPaths(tempPath, 'widgets', `${safeId}.cjs`)
}

async function copyToClipboard(value?: string | null): Promise<void> {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(t('corebox.copied'))
  } catch (error) {
    console.error('[PluginFeatures] Failed to copy path:', error)
    ElMessage.error(t('plugin.features.widget.copyFailed'))
  }
}

async function revealWidgetFile(pathValue?: string | null): Promise<void> {
  if (!props.plugin?.name || !pathValue) return
  try {
    const result = await pluginSDK.revealPath(props.plugin.name, pathValue)
    if (!result?.success) {
      ElMessage.warning(t('plugin.features.widget.openFailed'))
    }
  } catch (error) {
    console.error('[PluginFeatures] Failed to reveal widget file:', error)
    ElMessage.warning(t('plugin.features.widget.openFailed'))
  }
}

function resolveIssueMessage(message: string): string {
  return resolveI18nMessage(message)
}

async function handleReconnect(): Promise<void> {
  if (!props.plugin?.name || !canReconnect.value || reconnectLoading.value) return
  reconnectLoading.value = true
  try {
    await pluginSDK.reconnectDevServer(props.plugin.name)
  } catch (error) {
    console.error(
      `[PluginFeatures] Failed to reconnect dev server for plugin "${props.plugin.name}":`,
      error
    )
  } finally {
    reconnectLoading.value = false
  }
}

async function reloadPreviewWidget(): Promise<void> {
  const widgetId = previewWidgetId.value
  if (!widgetId) return
  if (widgetRenderErrors.value[widgetId]) {
    widgetRenderErrors.value = { ...widgetRenderErrors.value, [widgetId]: '' }
  }
  const success = await requestWidgetRegister(widgetId, { emitAsUpdate: true, force: true })
  if (!success) {
    ElMessage.warning('Widget 重新加载失败')
  }
}

async function reloadAllWidgets(): Promise<void> {
  const options = widgetPreviewOptions.value
  if (!options.length) return
  for (const option of options) {
    if (widgetRenderErrors.value[option.value]) {
      widgetRenderErrors.value = { ...widgetRenderErrors.value, [option.value]: '' }
    }
    await requestWidgetRegister(option.value, { emitAsUpdate: true, force: true })
  }
  ElMessage.success('已触发全部 Widget 重新加载')
}

function handlePreviewRenderError(error: Error): void {
  const widgetId = previewWidgetId.value
  if (!widgetId) return
  widgetRenderErrors.value = { ...widgetRenderErrors.value, [widgetId]: error.message }
}
</script>

<template>
  <div class="PluginFeature w-full">
    <!-- Stats Header -->
    <div class="PluginFeature-Header mb-6">
      <div class="grid grid-cols-2 gap-4">
        <StatCard
          :value="plugin.features?.length || 0"
          :label="t('plugin.features.stats.features')"
          icon-class="i-ri-function-line text-6xl text-blue-500"
        />
        <StatCard
          :value="totalCommands"
          :label="t('plugin.features.stats.commands')"
          icon-class="i-ri-terminal-box-line text-6xl text-[var(--el-color-success)]"
        />
      </div>
    </div>

    <!-- Features Grid -->
    <GridLayout v-if="plugin?.features?.length && features.length">
      <FeatureCard
        v-for="feature in sortedFeatures"
        :key="feature.id"
        :feature="feature"
        :active="activeFeatureId === feature.id && showDetail"
        @click="showFeatureDetails(feature, $event)"
      />
    </GridLayout>

    <!-- Empty State -->
    <PluginFeatureEmptyState v-else />

    <!-- Feature Detail Card -->
    <Teleport to="body">
      <TxFlipOverlay
        ref="detailOverlayRef"
        v-model="showDetail"
        v-model:expanded="isDetailExpanded"
        v-model:animating="isDetailAnimating"
        :source="detailSourceEl"
        :duration="FLIP_DURATION"
        :rotate-x="FLIP_ROTATE_X"
        :rotate-y="FLIP_ROTATE_Y"
        :speed-boost="FLIP_SPEED_BOOST"
        transition-name="PluginFeature-DetailMask"
        mask-class="PluginFeature-DetailMask"
        card-class="PluginFeature-DetailCard"
        @closed="handleDetailClosed"
      >
        <template #default="{ close }">
          <PluginFeatureDetailCard
            v-model:detail-tab="detailTab"
            v-model:preview-widget-id="previewWidgetId"
            v-model:preview-size-preset-value="previewSizePresetValue"
            v-model:mock-payload-enabled="mockPayloadEnabled"
            v-model:mock-payload-raw="mockPayloadRaw"
            :feature="selectedFeature"
            :widget-tab-enabled="isWidgetFeature(selectedFeature)"
            :widget-status="resolveWidgetStatus(selectedFeature)"
            :widget-source-display-path="resolveWidgetSourceDisplayPath(selectedFeature)"
            :widget-source-file-path="resolveWidgetSourceFilePath(selectedFeature)"
            :widget-source-url="resolveWidgetSourceUrl(selectedFeature)"
            :widget-compiled-display-path="resolveWidgetCompiledDisplayPath(selectedFeature)"
            :widget-compiled-path="resolveWidgetCompiledPath(selectedFeature)"
            :widget-path-alias-note="widgetPathAliasNote"
            :widget-preview-options="widgetPreviewOptions"
            :preview-widget-ready="previewWidgetReady"
            :preview-widget-registering="previewWidgetRegistering"
            :preview-widget-render-error="previewWidgetRenderError"
            :preview-widget-issues="previewWidgetIssues"
            :preview-widget-status="previewWidgetStatus"
            :preview-widget-hint="previewWidgetHint"
            :preview-widget-item="previewWidgetItem"
            :preview-frame-host-ref="setPreviewFrameHostRef"
            :preview-frame-style="previewFrameStyle"
            :preview-frame-resizing="previewFrameResizing"
            :preview-frame-size-label="previewFrameSizeLabel"
            :preview-size-options="previewSizeOptions"
            :mock-payload-value="mockPayloadValue"
            :mock-payload-error="mockPayloadError"
            :is-operation-disabled="isOperationDisabled"
            :is-dev-disconnected="isDevDisconnected"
            :dev-disconnect-message="devDisconnectMessage"
            :dev-disconnect-reason="devDisconnectReason"
            :dev-disconnect-suggestion="devDisconnectSuggestion"
            :can-reconnect="canReconnect"
            :reconnect-loading="reconnectLoading"
            :resolve-issue-message="resolveIssueMessage"
            @close="close"
            @copy="copyToClipboard"
            @reveal="revealWidgetFile"
            @reload-widget="reloadPreviewWidget"
            @reload-all-widgets="reloadAllWidgets"
            @reset-preview-frame-size="resetPreviewFrameSize"
            @preview-resize-start="handlePreviewResizeStart"
            @render-error="handlePreviewRenderError"
            @reconnect="handleReconnect"
          />
        </template>
      </TxFlipOverlay>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
:global(.PluginFeature-DetailMask) {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

:global(.PluginFeature-DetailMask-enter-active),
:global(.PluginFeature-DetailMask-leave-active) {
  transition: opacity 200ms ease;
}

:global(.PluginFeature-DetailMask-enter-from),
:global(.PluginFeature-DetailMask-leave-to) {
  opacity: 0;
}

:global(.PluginFeature-DetailCard) {
  width: min(980px, 92vw);
  height: min(720px, 86vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.5rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
  transition:
    box-shadow 420ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 420ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
