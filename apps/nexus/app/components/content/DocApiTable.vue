<script setup lang="ts">
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import CodeRenderer from '~/components/content/CodeRenderer.vue'

type ApiTableTypeKind = 'text' | 'ref' | 'enum'

interface ApiTableEnumValue {
  label: string
  value?: string
  description?: string
}

type ApiTableEnumInput = string | ApiTableEnumValue

interface ApiTableTypeSpec {
  kind?: ApiTableTypeKind
  label?: string
  to?: string
  preview?: string
  copyValue?: string
  snippet?: string
  language?: string
  enums?: ApiTableEnumInput[]
}

interface ApiTableRow {
  parameter?: string
  type?: unknown
  default?: unknown
  defaultValue?: unknown
  description?: unknown
}

interface NormalizedEnumValue {
  label: string
  copyValue: string
  description: string
}

interface TextType {
  kind: 'text'
  label: string
  copyValue: string
  snippet: string
  language: string
  forcePreview: boolean
}

interface RefType {
  kind: 'ref'
  label: string
  to: string
  preview: string
}

interface EnumType {
  kind: 'enum'
  label: string
  values: NormalizedEnumValue[]
}

type NormalizedType = TextType | RefType | EnumType

interface NormalizedRow {
  key: string
  parameter: string
  defaultValue: string
  description: string
  typeInfo: NormalizedType
}

interface AutoSizerActionApi {
  action?: (fn: () => void | Promise<void>) => Promise<void> | void
}

const props = withDefaults(defineProps<{
  rows?: ApiTableRow[]
  emptyText?: string
  descriptionCollapsedChars?: number
}>(), {
  rows: () => [],
  emptyText: '',
  descriptionCollapsedChars: 120,
})

const { locale } = useI18n()

const copiedKey = ref('')
const expandedDescriptionMap = ref<Record<string, boolean>>({})
const desktopDescSizerRefs = ref<Record<string, AutoSizerActionApi | undefined>>({})
const mobileDescSizerRefs = ref<Record<string, AutoSizerActionApi | undefined>>({})

const labels = computed(() => {
  const zh = locale.value.startsWith('zh')
  return {
    parameter: zh ? 'Parameter' : 'Parameter',
    type: zh ? 'Type' : 'Type',
    default: zh ? 'Default' : 'Default',
    description: zh ? 'Description' : 'Description',
    empty: zh ? '暂无参数定义' : 'No parameter definitions yet.',
    copyParameter: zh ? '点击复制参数名' : 'Click to copy parameter',
    copyType: zh ? '点击复制类型' : 'Click to copy type',
    copyDefault: zh ? '点击复制默认值' : 'Click to copy default value',
    copyEnum: zh ? '点击复制枚举值' : 'Click to copy enum value',
    copied: zh ? '已复制' : 'Copied',
    openReference: zh ? '点击查看类型定义' : 'Open type definition',
    typePreview: zh ? '类型局部定义' : 'Type preview',
    expand: zh ? '展开' : 'Expand',
    collapse: zh ? '收起' : 'Collapse',
    emptyDescription: zh ? '-' : '-',
  }
})

const tableColumns = computed(() => ([
  { key: 'parameter', title: labels.value.parameter, width: '22%' },
  { key: 'typeInfo', title: labels.value.type, width: '24%' },
  { key: 'defaultValue', title: labels.value.default, width: '16%' },
  { key: 'description', title: labels.value.description, width: '38%' },
]))

function extractEnumValuesFromType(typeLabel: string): string[] {
  const singleQuotes = Array.from(typeLabel.matchAll(/'([^']+)'/g))
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
  const doubleQuotes = Array.from(typeLabel.matchAll(/"([^"]+)"/g))
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
  const values = singleQuotes.length ? singleQuotes : doubleQuotes
  return [...new Set(values.filter(Boolean))]
}

function normalizeEnumValues(enums: ApiTableEnumInput[] = []): NormalizedEnumValue[] {
  return enums
    .map((item) => {
      if (typeof item === 'string') {
        const value = item.trim()
        if (!value)
          return null
        return {
          label: value,
          copyValue: value,
          description: '',
        }
      }

      const label = item.label.trim()
      const copyValue = (item.value ?? item.label).trim()

      if (!label || !copyValue)
        return null

      return {
        label,
        copyValue,
        description: (item.description ?? '').trim(),
      }
    })
    .filter((item): item is NormalizedEnumValue => item !== null)
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string')
    return value.trim()

  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim()

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeText(item))
      .filter(Boolean)
      .join(' | ')
      .trim()
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 1) {
      const entry = entries[0]
      if (!entry) return ''
      const [key, rawVal] = entry
      const val = normalizeText(rawVal)
      return val ? `${key}: ${val}` : key
    }
    try {
      return JSON.stringify(value).trim()
    }
    catch {
      return String(value).trim()
    }
  }

  return ''
}

function inferTypeLanguage(source: string): string {
  if (/[<>{}()[\]|:&]/.test(source))
    return 'typescript'
  return 'plaintext'
}

function normalizeLanguage(language?: string, source = ''): string {
  const value = language?.trim().toLowerCase()
  if (value)
    return value
  return inferTypeLanguage(source)
}

function normalizeType(type?: unknown): NormalizedType {
  if (!type) {
    return {
      kind: 'text',
      label: '-',
      copyValue: '',
      snippet: '',
      language: 'plaintext',
      forcePreview: false,
    }
  }

  if (typeof type === 'string') {
    const label = type.trim()
    if (!label) {
      return {
        kind: 'text',
        label: '-',
        copyValue: '',
        snippet: '',
        language: 'plaintext',
        forcePreview: false,
      }
    }

    const enumValues = extractEnumValuesFromType(label)
    if (enumValues.length >= 2) {
      return {
        kind: 'enum',
        label: 'enum',
        values: enumValues.map(value => ({
          label: value,
          copyValue: value,
          description: '',
        })),
      }
    }

    return {
      kind: 'text',
      label,
      copyValue: label,
      snippet: label,
      language: normalizeLanguage(undefined, label),
      forcePreview: false,
    }
  }

  if (typeof type !== 'object') {
    const label = normalizeText(type) || '-'
    return {
      kind: 'text',
      label,
      copyValue: label === '-' ? '' : label,
      snippet: label === '-' ? '' : label,
      language: normalizeLanguage(undefined, label),
      forcePreview: false,
    }
  }

  const normalizedType = type as ApiTableTypeSpec

  const kind = normalizedType.kind ?? (normalizedType.enums?.length ? 'enum' : normalizedType.to ? 'ref' : 'text')

  if (kind === 'enum') {
    const values = normalizeEnumValues(normalizedType.enums)
    if (values.length) {
      return {
        kind: 'enum',
        label: normalizeText(normalizedType.label) || 'enum',
        values,
      }
    }
  }

  if (kind === 'ref' && normalizeText(normalizedType.to)) {
    const to = normalizeText(normalizedType.to)
    const label = normalizeText(normalizedType.label) || to
    return {
      kind: 'ref',
      label,
      to,
      preview: normalizeText(normalizedType.preview),
    }
  }

  const label = normalizeText(normalizedType.label) || '-'
  const copyValue = normalizeText(normalizedType.copyValue) || label
  const snippet = normalizeText(normalizedType.snippet) || normalizeText(normalizedType.preview) || copyValue
  return {
    kind: 'text',
    label,
    copyValue: label === '-' ? '' : copyValue,
    snippet,
    language: normalizeLanguage(normalizeText(normalizedType.language), snippet || label),
    forcePreview: Boolean(normalizeText(normalizedType.snippet)) || kind === 'ref',
  }
}

const normalizedRows = computed<NormalizedRow[]>(() => {
  return props.rows.map((row, index) => {
    const parameter = normalizeText(row.parameter) || normalizeText((row as Record<string, unknown>).name) || `arg${index + 1}`
    const defaultValue = normalizeText(row.defaultValue) || normalizeText(row.default) || '-'
    return {
      key: `${parameter}-${index}`,
      parameter,
      defaultValue,
      description: normalizeText(row.description),
      typeInfo: normalizeType(row.type),
    }
  })
})

function isCopyable(value?: string): boolean {
  if (!value)
    return false
  const trimmed = value.trim()
  return !!trimmed && trimmed !== '-' && trimmed !== '—'
}

function fallbackCopy(text: string) {
  if (!hasDocument())
    return
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

async function copyText(value: string, key: string) {
  const text = value.trim()
  if (!text || !hasWindow())
    return

  try {
    if (hasNavigator() && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    }
    else {
      fallbackCopy(text)
    }
  }
  catch {
    fallbackCopy(text)
  }

  copiedKey.value = key
  window.setTimeout(() => {
    if (copiedKey.value === key)
      copiedKey.value = ''
  }, 1400)
}

function isCopied(key: string) {
  return copiedKey.value === key
}

function getParameterKey(rowKey: string) {
  return `param:${rowKey}`
}

function getTypeKey(rowKey: string) {
  return `type:${rowKey}`
}

function getDefaultKey(rowKey: string) {
  return `default:${rowKey}`
}

function getTypeCopyValue(typeInfo: NormalizedType): string {
  return typeInfo.kind === 'text' ? typeInfo.copyValue : ''
}

function getTypeLabel(typeInfo: NormalizedType): string {
  return typeInfo.label
}

function getEnumKey(rowKey: string, value: string) {
  return `enum:${rowKey}:${value}`
}

function handleKeyCopy(event: KeyboardEvent, value: string, key: string) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  copyText(value, key)
}

function handleKeyOpenReference(event: KeyboardEvent, typeInfo: RefType) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  openTypeReference(typeInfo)
}

function isTypePreviewable(typeInfo: NormalizedType): typeInfo is TextType {
  if (typeInfo.kind !== 'text')
    return false
  if (!isCopyable(typeInfo.copyValue))
    return false
  if (typeInfo.forcePreview)
    return true
  if (typeInfo.snippet.length > 24)
    return true
  return /[<>{}()[\]|:&]/.test(typeInfo.snippet)
}

function getTypePreviewCode(typeInfo: TextType): string {
  return typeInfo.snippet || typeInfo.copyValue || typeInfo.label
}

function isDescriptionCollapsible(row: NormalizedRow): boolean {
  return row.description.length > props.descriptionCollapsedChars
}

function isDescriptionExpanded(rowKey: string): boolean {
  return !!expandedDescriptionMap.value[rowKey]
}

function setDescSizerRef(mode: 'desktop' | 'mobile', rowKey: string, instance: AutoSizerActionApi | null) {
  const map = mode === 'desktop' ? desktopDescSizerRefs.value : mobileDescSizerRefs.value
  if (instance) {
    map[rowKey] = instance
    return
  }
  delete map[rowKey]
}

function getActiveDescSizer(rowKey: string): AutoSizerActionApi | undefined {
  const desktopSizer = desktopDescSizerRefs.value[rowKey]
  const mobileSizer = mobileDescSizerRefs.value[rowKey]

  if (!hasWindow())
    return desktopSizer ?? mobileSizer

  const mobile = window.matchMedia('(max-width: 900px)').matches
  if (mobile)
    return mobileSizer ?? desktopSizer
  return desktopSizer ?? mobileSizer
}

async function toggleDescription(rowKey: string) {
  const sizer = getActiveDescSizer(rowKey)
  const next = !expandedDescriptionMap.value[rowKey]
  const applyToggle = () => {
    expandedDescriptionMap.value[rowKey] = next
  }

  if (sizer?.action) {
    await sizer.action(applyToggle)
    return
  }

  applyToggle()
}

async function openTypeReference(typeInfo: RefType) {
  const target = typeInfo.to.trim()
  if (!target)
    return

  if (/^https?:\/\//.test(target)) {
    await navigateTo(target, {
      external: true,
      open: {
        target: '_blank',
      },
    })
    return
  }

  await navigateTo(target)
}
</script>

<template>
  <div class="doc-api-table">
    <div class="doc-api-table__desktop">
      <TxDataTable
        :columns="tableColumns"
        :data="normalizedRows"
        row-key="key"
        bordered
        hover
      >
        <template #cell-parameter="{ row }">
          <div class="doc-api-table__parameter-cell">
            <TxTooltip :content="isCopied(getParameterKey(row.key)) ? labels.copied : labels.copyParameter">
              <span
                class="doc-api-table__param-text"
                role="button"
                tabindex="0"
                @click="copyText(row.parameter, getParameterKey(row.key))"
                @keydown="handleKeyCopy($event, row.parameter, getParameterKey(row.key))"
              >
                {{ row.parameter }}
              </span>
            </TxTooltip>
            <TxTag
              v-if="isCopied(getParameterKey(row.key))"
              :label="labels.copied"
              size="sm"
            />
          </div>
        </template>

        <template #cell-typeInfo="{ row }">
          <div class="doc-api-table__type-cell">
            <template v-if="row.typeInfo.kind === 'enum'">
              <TxTooltip
                v-for="enumValue in row.typeInfo.values"
                :key="`${row.key}-${enumValue.copyValue}`"
                :content="isCopied(getEnumKey(row.key, enumValue.copyValue)) ? labels.copied : labels.copyEnum"
              >
                <TxTag
                  :label="enumValue.label"
                  size="sm"
                  class="doc-api-table__enum-tag"
                  @click="copyText(enumValue.copyValue, getEnumKey(row.key, enumValue.copyValue))"
                />
              </TxTooltip>
            </template>

            <template v-else-if="row.typeInfo.kind === 'ref'">
              <TxTooltip :content="row.typeInfo.preview || labels.openReference">
                <span
                  class="doc-api-table__type-action is-link"
                  role="button"
                  tabindex="0"
                  @click="openTypeReference(row.typeInfo)"
                  @keydown="handleKeyOpenReference($event, row.typeInfo)"
                >
                  <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                  <span class="doc-api-table__type-action-icon i-carbon-launch" aria-hidden="true" />
                </span>
              </TxTooltip>
            </template>

            <template v-else>
              <TxTooltip
                v-if="isTypePreviewable(row.typeInfo)"
                interactive
                :open-delay="120"
                :close-delay="140"
                :anchor="{
                  placement: 'right-start',
                  maxWidth: 460,
                  panelPadding: 10,
                  panelVariant: 'plain',
                  panelBackground: 'glass',
                  panelShadow: 'soft',
                }"
              >
                <span
                  class="doc-api-table__type-action is-popover"
                  :class="{ 'is-copyable': isCopyable(getTypeCopyValue(row.typeInfo)) }"
                  :role="isCopyable(getTypeCopyValue(row.typeInfo)) ? 'button' : undefined"
                  :tabindex="isCopyable(getTypeCopyValue(row.typeInfo)) ? 0 : undefined"
                  @click="copyText(getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                  @keydown="handleKeyCopy($event, getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                >
                  <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                  <span class="doc-api-table__type-action-icon i-carbon-code" aria-hidden="true" />
                </span>
                <template #content>
                  <div class="doc-api-table__type-popover">
                    <p class="doc-api-table__type-popover-title">
                      {{ labels.typePreview }}
                    </p>
                    <CodeRenderer :code="getTypePreviewCode(row.typeInfo)" :lang="row.typeInfo.language" :max-height="220" />
                  </div>
                </template>
              </TxTooltip>
              <TxTooltip v-else :content="isCopyable(getTypeCopyValue(row.typeInfo)) ? labels.copyType : ''" :disabled="!isCopyable(getTypeCopyValue(row.typeInfo))">
                <span
                  class="doc-api-table__type-action"
                  :class="{ 'is-copyable': isCopyable(getTypeCopyValue(row.typeInfo)) }"
                  :role="isCopyable(getTypeCopyValue(row.typeInfo)) ? 'button' : undefined"
                  :tabindex="isCopyable(getTypeCopyValue(row.typeInfo)) ? 0 : undefined"
                  @click="copyText(getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                  @keydown="handleKeyCopy($event, getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                >
                  <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                </span>
              </TxTooltip>
            </template>
          </div>
        </template>

        <template #cell-defaultValue="{ row }">
          <div class="doc-api-table__default-cell">
            <TxTooltip :content="isCopyable(row.defaultValue) ? labels.copyDefault : ''" :disabled="!isCopyable(row.defaultValue)">
              <span
                class="doc-api-table__default-text"
                :class="{ 'is-copyable': isCopyable(row.defaultValue), 'is-empty': !isCopyable(row.defaultValue) }"
                :role="isCopyable(row.defaultValue) ? 'button' : undefined"
                :tabindex="isCopyable(row.defaultValue) ? 0 : undefined"
                @click="copyText(row.defaultValue, getDefaultKey(row.key))"
                @keydown="handleKeyCopy($event, row.defaultValue, getDefaultKey(row.key))"
              >
                {{ row.defaultValue }}
              </span>
            </TxTooltip>
          </div>
        </template>

        <template #cell-description="{ row }">
          <div class="doc-api-table__desc-cell">
            <TxAutoSizer
              :ref="(el: unknown) => setDescSizerRef('desktop', row.key, el as AutoSizerActionApi | null)"
              :width="false"
              :height="true"
              :duration-ms="200"
              outer-class="doc-api-table__desc-sizer overflow-hidden"
              inner-class="doc-api-table__desc-sizer-inner min-h-0"
            >
              <TxTooltip
                :content="row.description || ''"
                :disabled="!row.description"
                :anchor="{
                  placement: 'top-start',
                  maxWidth: 560,
                  panelPadding: 10,
                  panelVariant: 'plain',
                  panelBackground: 'glass',
                  panelShadow: 'soft',
                }"
                :reference-full-width="true"
              >
                <p
                  class="doc-api-table__desc-text"
                  :class="{ 'is-collapsed': isDescriptionCollapsible(row) && !isDescriptionExpanded(row.key) }"
                >
                  {{ row.description || labels.emptyDescription }}
                </p>
                <template #content>
                  <div class="doc-api-table__desc-tooltip">
                    {{ row.description }}
                  </div>
                </template>
              </TxTooltip>
            </TxAutoSizer>
            <TxAutoSizer
              v-if="isDescriptionCollapsible(row)"
              :width="true"
              :height="false"
              :inline="true"
              :duration-ms="180"
              outer-class="doc-api-table__desc-toggle-sizer overflow-hidden"
            >
              <TxButton
                variant="bare"
                size="small"
                native-type="button"
                :icon="isDescriptionExpanded(row.key) ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
                class="doc-api-table__desc-toggle"
                @click="toggleDescription(row.key)"
              >
                {{ isDescriptionExpanded(row.key) ? labels.collapse : labels.expand }}
              </TxButton>
            </TxAutoSizer>
          </div>
        </template>

        <template #empty>
          <TxEmptyState variant="no-data" :title="props.emptyText || labels.empty" size="small" layout="vertical" />
        </template>
      </TxDataTable>
    </div>

    <div class="doc-api-table__mobile">
      <template v-if="!normalizedRows.length">
        <TxEmptyState
          variant="no-data"
          :title="props.emptyText || labels.empty"
          size="small"
          layout="vertical"
        />
      </template>

      <template v-else>
        <TxCard
          v-for="row in normalizedRows"
          :key="row.key"
          variant="plain"
          background="mask"
          :padding="14"
          :radius="14"
          class="doc-api-table__mobile-card"
        >
          <div class="doc-api-table__mobile-item">
            <div class="doc-api-table__mobile-label">
              {{ labels.parameter }}
            </div>
            <div class="doc-api-table__mobile-value">
              <TxTooltip :content="isCopied(getParameterKey(row.key)) ? labels.copied : labels.copyParameter">
                <span
                  class="doc-api-table__param-text"
                  role="button"
                  tabindex="0"
                  @click="copyText(row.parameter, getParameterKey(row.key))"
                  @keydown="handleKeyCopy($event, row.parameter, getParameterKey(row.key))"
                >
                  {{ row.parameter }}
                </span>
              </TxTooltip>
            </div>
          </div>

          <div class="doc-api-table__mobile-item">
            <div class="doc-api-table__mobile-label">
              {{ labels.type }}
            </div>
            <div class="doc-api-table__mobile-value">
              <div class="doc-api-table__type-cell">
                <template v-if="row.typeInfo.kind === 'enum'">
                  <TxTooltip
                    v-for="enumValue in row.typeInfo.values"
                    :key="`${row.key}-mobile-${enumValue.copyValue}`"
                    :content="isCopied(getEnumKey(row.key, enumValue.copyValue)) ? labels.copied : labels.copyEnum"
                  >
                    <TxTag
                      :label="enumValue.label"
                      size="sm"
                      class="doc-api-table__enum-tag"
                      @click="copyText(enumValue.copyValue, getEnumKey(row.key, enumValue.copyValue))"
                    />
                  </TxTooltip>
                </template>
                <template v-else-if="row.typeInfo.kind === 'ref'">
                  <TxTooltip :content="row.typeInfo.preview || labels.openReference">
                    <span
                      class="doc-api-table__type-action is-link"
                      role="button"
                      tabindex="0"
                      @click="openTypeReference(row.typeInfo)"
                      @keydown="handleKeyOpenReference($event, row.typeInfo)"
                    >
                      <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                      <span class="doc-api-table__type-action-icon i-carbon-launch" aria-hidden="true" />
                    </span>
                  </TxTooltip>
                </template>
                <template v-else>
                  <TxTooltip
                    v-if="isTypePreviewable(row.typeInfo)"
                    interactive
                    :open-delay="120"
                    :close-delay="140"
                    :anchor="{
                      placement: 'top-start',
                      maxWidth: 420,
                      panelPadding: 10,
                      panelVariant: 'plain',
                      panelBackground: 'glass',
                      panelShadow: 'soft',
                    }"
                  >
                    <span
                      class="doc-api-table__type-action is-popover"
                      :class="{ 'is-copyable': isCopyable(getTypeCopyValue(row.typeInfo)) }"
                      :role="isCopyable(getTypeCopyValue(row.typeInfo)) ? 'button' : undefined"
                      :tabindex="isCopyable(getTypeCopyValue(row.typeInfo)) ? 0 : undefined"
                      @click="copyText(getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                      @keydown="handleKeyCopy($event, getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                    >
                      <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                      <span class="doc-api-table__type-action-icon i-carbon-code" aria-hidden="true" />
                    </span>
                    <template #content>
                      <div class="doc-api-table__type-popover">
                        <p class="doc-api-table__type-popover-title">
                          {{ labels.typePreview }}
                        </p>
                        <CodeRenderer :code="getTypePreviewCode(row.typeInfo)" :lang="row.typeInfo.language" :max-height="200" />
                      </div>
                    </template>
                  </TxTooltip>
                  <TxTooltip v-else :content="isCopyable(getTypeCopyValue(row.typeInfo)) ? labels.copyType : ''" :disabled="!isCopyable(getTypeCopyValue(row.typeInfo))">
                    <span
                      class="doc-api-table__type-action"
                      :class="{ 'is-copyable': isCopyable(getTypeCopyValue(row.typeInfo)) }"
                      :role="isCopyable(getTypeCopyValue(row.typeInfo)) ? 'button' : undefined"
                      :tabindex="isCopyable(getTypeCopyValue(row.typeInfo)) ? 0 : undefined"
                      @click="copyText(getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                      @keydown="handleKeyCopy($event, getTypeCopyValue(row.typeInfo), getTypeKey(row.key))"
                    >
                      <span class="doc-api-table__type-action-text">{{ getTypeLabel(row.typeInfo) }}</span>
                    </span>
                  </TxTooltip>
                </template>
              </div>
            </div>
          </div>

          <div class="doc-api-table__mobile-item">
            <div class="doc-api-table__mobile-label">
              {{ labels.default }}
            </div>
            <div class="doc-api-table__mobile-value">
              <TxTooltip :content="isCopyable(row.defaultValue) ? labels.copyDefault : ''" :disabled="!isCopyable(row.defaultValue)">
                <span
                  class="doc-api-table__default-text"
                  :class="{ 'is-copyable': isCopyable(row.defaultValue), 'is-empty': !isCopyable(row.defaultValue) }"
                  :role="isCopyable(row.defaultValue) ? 'button' : undefined"
                  :tabindex="isCopyable(row.defaultValue) ? 0 : undefined"
                  @click="copyText(row.defaultValue, getDefaultKey(row.key))"
                  @keydown="handleKeyCopy($event, row.defaultValue, getDefaultKey(row.key))"
                >
                  {{ row.defaultValue }}
                </span>
              </TxTooltip>
            </div>
          </div>

          <div class="doc-api-table__mobile-item">
            <div class="doc-api-table__mobile-label">
              {{ labels.description }}
            </div>
            <div class="doc-api-table__mobile-value doc-api-table__desc-cell">
              <TxAutoSizer
                :ref="(el: unknown) => setDescSizerRef('mobile', row.key, el as AutoSizerActionApi | null)"
                :width="false"
                :height="true"
                :duration-ms="180"
                outer-class="doc-api-table__desc-sizer overflow-hidden"
                inner-class="doc-api-table__desc-sizer-inner min-h-0"
              >
                <TxTooltip
                  :content="row.description || ''"
                  :disabled="!row.description"
                  :anchor="{
                    placement: 'top-start',
                    maxWidth: 460,
                    panelPadding: 10,
                    panelVariant: 'plain',
                    panelBackground: 'glass',
                    panelShadow: 'soft',
                  }"
                  :reference-full-width="true"
                >
                  <p
                    class="doc-api-table__desc-text"
                    :class="{ 'is-collapsed-mobile': isDescriptionCollapsible(row) && !isDescriptionExpanded(row.key) }"
                  >
                    {{ row.description || labels.emptyDescription }}
                  </p>
                  <template #content>
                    <div class="doc-api-table__desc-tooltip">
                      {{ row.description }}
                    </div>
                  </template>
                </TxTooltip>
              </TxAutoSizer>
              <TxAutoSizer
                v-if="isDescriptionCollapsible(row)"
                :width="true"
                :height="false"
                :inline="true"
                :duration-ms="160"
                outer-class="doc-api-table__desc-toggle-sizer overflow-hidden"
              >
                <TxButton
                  variant="bare"
                  size="small"
                  native-type="button"
                  :icon="isDescriptionExpanded(row.key) ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
                  class="doc-api-table__desc-toggle"
                  @click="toggleDescription(row.key)"
                >
                  {{ isDescriptionExpanded(row.key) ? labels.collapse : labels.expand }}
                </TxButton>
              </TxAutoSizer>
            </div>
          </div>
        </TxCard>
      </template>
    </div>
  </div>
</template>

<style scoped>
.doc-api-table {
  width: 100%;
}

.doc-api-table__desktop {
  display: block;
}

.doc-api-table__mobile {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.doc-api-table__parameter-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-api-table__param-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-color-primary, #4f46e5) 92%, white);
  cursor: pointer;
  outline: none;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.2s ease;
}

.doc-api-table__param-text:hover,
.doc-api-table__param-text:focus-visible {
  text-decoration-color: currentColor;
}

.doc-api-table__type-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.doc-api-table__type-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.35;
  outline: none;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 78%, transparent);
}

.doc-api-table__type-action.is-copyable,
.doc-api-table__type-action.is-link,
.doc-api-table__type-action.is-popover {
  cursor: pointer;
}

.doc-api-table__type-action.is-link,
.doc-api-table__type-action.is-popover {
  color: color-mix(in srgb, var(--tx-color-primary, #4f46e5) 90%, white);
}

.doc-api-table__type-action-text {
  text-decoration: none;
  transition: text-decoration-color 0.2s ease;
}

.doc-api-table__type-action.is-link .doc-api-table__type-action-text,
.doc-api-table__type-action.is-popover .doc-api-table__type-action-text {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-thickness: 1px;
  text-decoration-color: color-mix(in srgb, currentColor 58%, transparent);
  text-underline-offset: 3px;
}

.doc-api-table__type-action.is-link:hover .doc-api-table__type-action-text,
.doc-api-table__type-action.is-link:focus-visible .doc-api-table__type-action-text,
.doc-api-table__type-action.is-popover:hover .doc-api-table__type-action-text,
.doc-api-table__type-action.is-popover:focus-visible .doc-api-table__type-action-text {
  text-decoration-color: currentColor;
}

.doc-api-table__type-action-icon {
  flex: none;
  font-size: 12px;
  opacity: 0.86;
}

.doc-api-table__enum-tag {
  cursor: pointer;
}

.doc-api-table__default-cell {
  display: flex;
  align-items: center;
  min-height: 22px;
}

.doc-api-table__default-text {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 74%, transparent);
  outline: none;
}

.doc-api-table__default-text.is-copyable {
  cursor: pointer;
}

.doc-api-table__default-text.is-empty {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 85%, transparent);
}

.doc-api-table__type-popover {
  width: min(440px, 70vw);
}

.doc-api-table__type-popover-title {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 84%, transparent);
}

.doc-api-table__desc-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

:deep(.doc-api-table__desc-sizer) {
  width: 100%;
}

.doc-api-table__desc-text {
  margin: 0;
  line-height: 1.55;
  word-break: break-word;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 78%, transparent);
}

.doc-api-table__desc-tooltip {
  max-width: min(560px, 72vw);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-size: 13px;
}

.doc-api-table__desc-text.is-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.doc-api-table__desc-text.is-collapsed-mobile {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.doc-api-table__desc-toggle {
  padding-inline: 0;
  font-size: 12px;
  min-height: 24px;
}

:deep(.doc-api-table__desc-toggle .tx-button__inner) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

:deep(.doc-api-table__desc-toggle .tx-button__icon) {
  font-size: 12px;
  opacity: 0.82;
}

.doc-api-table__mobile-card {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 82%, transparent);
}

.doc-api-table__mobile-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.doc-api-table__mobile-item + .doc-api-table__mobile-item {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 78%, transparent);
}

.doc-api-table__mobile-label {
  font-size: 11px;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 85%, transparent);
}

.doc-api-table__mobile-value {
  min-width: 0;
}

:deep(.tx-data-table) {
  border-radius: 14px;
  border-color: color-mix(in srgb, var(--tx-border-color-lighter, #d1d5db) 84%, transparent);
}

:deep(.tx-data-table__th) {
  font-size: 14px;
  letter-spacing: 0;
  text-transform: none;
}

:deep(.tx-data-table__cell) {
  vertical-align: top;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .doc-api-table__desktop {
    display: none;
  }

  .doc-api-table__mobile {
    display: flex;
  }
}
</style>
