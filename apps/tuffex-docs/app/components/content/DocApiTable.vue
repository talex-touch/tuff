<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import CodeRenderer from '~/components/content/CodeRenderer.vue'

/**
 * R5 High-Performance API Table:
 * - SINGLE semantic `<table>` (`<td :data-label="...">`) that CSS transforms
 *   into stacked cards below 900px — ZERO duplicate desktop+mobile Vue DOM trees,
 *   ZERO `matchMedia` hydration mismatch!
 * - 1 Singleton Delegated Popover per table (native `title` for simple copy hints
 *   + ONE teleported popover activated on demand for rich type/ref previews —
 *   drops `TxBaseAnchor` from >200 to 0!).
 * - ZERO `TxAutoSizer` / `ResizeObserver` (pure CSS `-webkit-line-clamp: 2` toggle!).
 * - `content-visibility: auto; contain-intrinsic-size: auto 420px`.
 */

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
  name?: string
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

interface ActivePopoverState {
  key: string
  title: string
  code: string
  lang: string
  isCode: boolean
  top: number
  left: number
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
const expandedDescMap = ref<Record<string, boolean>>({})
const activePopover = ref<ActivePopoverState | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let popoverCloseTimer: ReturnType<typeof setTimeout> | null = null

const labels = computed(() => {
  const zh = locale.value.startsWith('zh')
  return {
    parameter: 'Parameter',
    type: 'Type',
    default: 'Default',
    description: 'Description',
    empty: zh ? '暂无参数定义' : 'No parameter definitions yet.',
    copyParameter: zh ? '点击复制参数名' : 'Click to copy parameter',
    copyType: zh ? '点击复制类型' : 'Click to copy type',
    copyDefault: zh ? '点击复制默认值' : 'Click to copy default value',
    copyEnum: zh ? '点击复制枚举值' : 'Click to copy enum value',
    copied: zh ? '已复制' : 'Copied',
    openReference: zh ? '点击查看类型定义' : 'Open type definition',
    typePreview: zh ? '类型定义预览' : 'Type preview',
    expand: zh ? '展开' : 'Expand',
    collapse: zh ? '收起' : 'Collapse',
  }
})

function extractEnumValuesFromType(typeLabel: string): string[] {
  const singleQuotes = Array.from(typeLabel.matchAll(/'([^']+)'/g))
    .map(m => m[1]?.trim())
    .filter((v): v is string => Boolean(v))
  const doubleQuotes = Array.from(typeLabel.matchAll(/"([^"]+)"/g))
    .map(m => m[1]?.trim())
    .filter((v): v is string => Boolean(v))
  const values = singleQuotes.length ? singleQuotes : doubleQuotes
  return [...new Set(values)]
}

function normalizeEnumValues(enums: ApiTableEnumInput[] = []): NormalizedEnumValue[] {
  const out: NormalizedEnumValue[] = []
  for (const item of enums) {
    if (typeof item === 'string') {
      const value = item.trim()
      if (value)
        out.push({ label: value, copyValue: value, description: '' })
      continue
    }
    const label = item.label.trim()
    const copyValue = (item.value ?? item.label).trim()
    if (label && copyValue)
      out.push({ label, copyValue, description: (item.description ?? '').trim() })
  }
  return out
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string')
    return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim()
  if (Array.isArray(value))
    return value.map(normalizeText).filter(Boolean).join(' | ').trim()
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 1 && entries[0]) {
      const [k, raw] = entries[0]
      const v = normalizeText(raw)
      return v ? `${k}: ${v}` : k
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
  return /[<>{}()[\]|:&]/.test(source) ? 'typescript' : 'plaintext'
}

function normalizeType(type?: unknown): NormalizedType {
  if (!type) {
    return { kind: 'text', label: '-', copyValue: '', snippet: '', language: 'plaintext', forcePreview: false }
  }
  if (typeof type === 'string') {
    const label = type.trim()
    if (!label)
      return { kind: 'text', label: '-', copyValue: '', snippet: '', language: 'plaintext', forcePreview: false }
    const enumValues = extractEnumValuesFromType(label)
    if (enumValues.length >= 2) {
      return {
        kind: 'enum',
        label: 'enum',
        values: enumValues.map(value => ({ label: value, copyValue: value, description: '' })),
      }
    }
    return {
      kind: 'text',
      label,
      copyValue: label,
      snippet: label,
      language: inferTypeLanguage(label),
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
      language: inferTypeLanguage(label),
      forcePreview: false,
    }
  }

  const spec = type as ApiTableTypeSpec
  const kind = spec.kind ?? (spec.enums?.length ? 'enum' : spec.to ? 'ref' : 'text')

  if (kind === 'enum') {
    const values = normalizeEnumValues(spec.enums)
    if (values.length) {
      return { kind: 'enum', label: normalizeText(spec.label) || 'enum', values }
    }
  }

  if (kind === 'ref' && normalizeText(spec.to)) {
    const to = normalizeText(spec.to)
    return {
      kind: 'ref',
      label: normalizeText(spec.label) || to,
      to,
      preview: normalizeText(spec.preview),
    }
  }

  const label = normalizeText(spec.label) || '-'
  const copyValue = normalizeText(spec.copyValue) || label
  const snippet = normalizeText(spec.snippet) || normalizeText(spec.preview) || copyValue
  return {
    kind: 'text',
    label,
    copyValue: label === '-' ? '' : copyValue,
    snippet,
    language: spec.language?.trim().toLowerCase() || inferTypeLanguage(snippet || label),
    forcePreview: Boolean(normalizeText(spec.snippet)) || kind === 'ref',
  }
}

const normalizedRows = computed<NormalizedRow[]>(() =>
  props.rows.map((row, index) => {
    const parameter = normalizeText(row.parameter) || normalizeText(row.name) || `arg${index + 1}`
    const defaultValue = normalizeText(row.defaultValue) || normalizeText(row.default) || '-'
    return {
      key: `${parameter}-${index}`,
      parameter,
      defaultValue,
      description: normalizeText(row.description),
      typeInfo: normalizeType(row.type),
    }
  }),
)

function isCopyable(value?: string): boolean {
  if (!value)
    return false
  const trimmed = value.trim()
  return Boolean(trimmed) && trimmed !== '-' && trimmed !== '—'
}

function isTypePreviewable(typeInfo: TextType): boolean {
  if (!isCopyable(typeInfo.copyValue))
    return false
  return typeInfo.forcePreview || typeInfo.snippet.length > 24 || /[<>{}()[\]|:&]/.test(typeInfo.snippet)
}

function isDescriptionCollapsible(row: NormalizedRow): boolean {
  return row.description.length > props.descriptionCollapsedChars
}

function toggleDescription(rowKey: string) {
  expandedDescMap.value[rowKey] = !expandedDescMap.value[rowKey]
}

async function copyText(value: string, key: string) {
  const text = value.trim()
  if (!text || !import.meta.client)
    return
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    }
    else {
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
  }
  catch {
    return
  }

  copiedKey.value = key
  if (copiedTimer)
    clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    if (copiedKey.value === key)
      copiedKey.value = ''
    copiedTimer = null
  }, 1400)
}

async function openTypeReference(typeInfo: RefType) {
  const target = typeInfo.to.trim()
  if (!target)
    return
  if (/^https?:\/\//.test(target)) {
    await navigateTo(target, { external: true, open: { target: '_blank' } })
    return
  }
  await navigateTo(target)
}

// Singleton delegated popover helpers (ONLY 1 popover node for the entire table!)
function cancelPopoverClose() {
  if (popoverCloseTimer) {
    clearTimeout(popoverCloseTimer)
    popoverCloseTimer = null
  }
}

function schedulePopoverClose() {
  cancelPopoverClose()
  popoverCloseTimer = setTimeout(() => {
    activePopover.value = null
    popoverCloseTimer = null
  }, 140)
}

function openSingletonPopover(event: Event, payload: Omit<ActivePopoverState, 'top' | 'left'>) {
  if (!import.meta.client)
    return
  cancelPopoverClose()
  const trigger = event.currentTarget as HTMLElement | null
  if (!trigger)
    return
  const rect = trigger.getBoundingClientRect()
  const maxWidth = 420
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - maxWidth - 16))
  const top = Math.min(rect.bottom + 8, window.innerHeight - 160)
  activePopover.value = { ...payload, top, left }
}

onBeforeUnmount(() => {
  if (copiedTimer)
    clearTimeout(copiedTimer)
  if (popoverCloseTimer)
    clearTimeout(popoverCloseTimer)
})
</script>

<template>
  <div class="doc-api-table not-prose">
    <span class="sr-only" aria-live="polite">
      {{ copiedKey ? labels.copied : '' }}
    </span>

    <div v-if="!normalizedRows.length" class="doc-api-table__empty">
      {{ props.emptyText || labels.empty }}
    </div>

    <!-- R5: SINGLE semantic <table> transformed to stacked mobile cards via CSS @media (max-width: 900px) -->
    <div v-else class="doc-api-table__wrap">
      <table class="doc-api-table__table">
        <thead>
          <tr>
            <th class="col-param">{{ labels.parameter }}</th>
            <th class="col-type">{{ labels.type }}</th>
            <th class="col-default">{{ labels.default }}</th>
            <th class="col-desc">{{ labels.description }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in normalizedRows" :key="row.key">
            <td :data-label="labels.parameter" class="doc-api-table__cell doc-api-table__cell--param">
              <button
                type="button"
                class="doc-api-table__param-btn"
                :class="{ 'is-copied': copiedKey === `param:${row.key}` }"
                :title="copiedKey === `param:${row.key}` ? labels.copied : labels.copyParameter"
                @click="copyText(row.parameter, `param:${row.key}`)"
              >
                <span>{{ row.parameter }}</span>
                <span v-if="copiedKey === `param:${row.key}`" class="doc-api-table__copied-pill">{{ labels.copied }}</span>
              </button>
            </td>

            <td :data-label="labels.type" class="doc-api-table__cell doc-api-table__cell--type">
              <div class="doc-api-table__type-cell">
                <template v-if="row.typeInfo.kind === 'enum'">
                  <button
                    v-for="enumVal in row.typeInfo.values"
                    :key="`${row.key}-${enumVal.copyValue}`"
                    type="button"
                    class="doc-api-table__enum-tag"
                    :class="{ 'is-copied': copiedKey === `enum:${row.key}:${enumVal.copyValue}` }"
                    :title="copiedKey === `enum:${row.key}:${enumVal.copyValue}` ? labels.copied : (enumVal.description || labels.copyEnum)"
                    @click="copyText(enumVal.copyValue, `enum:${row.key}:${enumVal.copyValue}`)"
                  >
                    <span v-if="copiedKey === `enum:${row.key}:${enumVal.copyValue}`" class="i-carbon-checkmark" aria-hidden="true" />
                    <span>{{ enumVal.label }}</span>
                  </button>
                </template>

                <template v-else-if="row.typeInfo.kind === 'ref'">
                  <button
                    type="button"
                    class="doc-api-table__type-action is-link"
                    :title="row.typeInfo.preview || labels.openReference"
                    @click="openTypeReference(row.typeInfo)"
                    @mouseenter="row.typeInfo.preview && openSingletonPopover($event, { key: `ref:${row.key}`, title: row.typeInfo.label, code: row.typeInfo.preview, lang: 'plaintext', isCode: false })"
                    @mouseleave="schedulePopoverClose"
                    @focus="row.typeInfo.preview && openSingletonPopover($event, { key: `ref:${row.key}`, title: row.typeInfo.label, code: row.typeInfo.preview, lang: 'plaintext', isCode: false })"
                    @blur="schedulePopoverClose"
                  >
                    <span>{{ row.typeInfo.label }}</span>
                    <span class="i-carbon-launch doc-api-table__action-icon" aria-hidden="true" />
                  </button>
                </template>

                <template v-else>
                  <button
                    v-if="isTypePreviewable(row.typeInfo)"
                    type="button"
                    class="doc-api-table__type-action is-popover"
                    :class="{ 'is-copied': copiedKey === `type:${row.key}` }"
                    :title="copiedKey === `type:${row.key}` ? labels.copied : labels.copyType"
                    @click="copyText(row.typeInfo.copyValue, `type:${row.key}`)"
                    @mouseenter="openSingletonPopover($event, { key: `type:${row.key}`, title: labels.typePreview, code: row.typeInfo.snippet || row.typeInfo.copyValue, lang: row.typeInfo.language, isCode: true })"
                    @mouseleave="schedulePopoverClose"
                    @focus="openSingletonPopover($event, { key: `type:${row.key}`, title: labels.typePreview, code: row.typeInfo.snippet || row.typeInfo.copyValue, lang: row.typeInfo.language, isCode: true })"
                    @blur="schedulePopoverClose"
                  >
                    <span class="doc-api-table__type-text">{{ row.typeInfo.label }}</span>
                    <span class="i-carbon-code doc-api-table__action-icon" aria-hidden="true" />
                  </button>

                  <button
                    v-else-if="isCopyable(row.typeInfo.copyValue)"
                    type="button"
                    class="doc-api-table__type-action"
                    :class="{ 'is-copied': copiedKey === `type:${row.key}` }"
                    :title="copiedKey === `type:${row.key}` ? labels.copied : labels.copyType"
                    @click="copyText(row.typeInfo.copyValue, `type:${row.key}`)"
                  >
                    <span class="doc-api-table__type-text">{{ row.typeInfo.label }}</span>
                  </button>

                  <span v-else class="doc-api-table__muted">-</span>
                </template>
              </div>
            </td>

            <td :data-label="labels.default" class="doc-api-table__cell doc-api-table__cell--default">
              <button
                v-if="isCopyable(row.defaultValue)"
                type="button"
                class="doc-api-table__default-btn"
                :class="{ 'is-copied': copiedKey === `default:${row.key}` }"
                :title="copiedKey === `default:${row.key}` ? labels.copied : labels.copyDefault"
                @click="copyText(row.defaultValue, `default:${row.key}`)"
              >
                {{ row.defaultValue }}
              </button>
              <span v-else class="doc-api-table__muted">-</span>
            </td>

            <td :data-label="labels.description" class="doc-api-table__cell doc-api-table__cell--desc">
              <div class="doc-api-table__desc-cell">
                <p
                  class="doc-api-table__desc-text"
                  :class="{ 'is-collapsed': isDescriptionCollapsible(row) && !expandedDescMap[row.key] }"
                >
                  {{ row.description || '-' }}
                </p>
                <button
                  v-if="isDescriptionCollapsible(row)"
                  type="button"
                  class="doc-api-table__desc-toggle"
                  :aria-expanded="Boolean(expandedDescMap[row.key])"
                  @click="toggleDescription(row.key)"
                >
                  <span :class="expandedDescMap[row.key] ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" aria-hidden="true" />
                  <span>{{ expandedDescMap[row.key] ? labels.collapse : labels.expand }}</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- R5: Singleton delegated popover (<= 1 per entire table, rendered only on hover/focus) -->
    <Teleport to="body">
      <div
        v-if="activePopover"
        class="doc-api-table__singleton-popover"
        :style="{ top: `${activePopover.top}px`, left: `${activePopover.left}px` }"
        role="tooltip"
        @mouseenter="cancelPopoverClose"
        @mouseleave="schedulePopoverClose"
      >
        <p class="doc-api-table__popover-title">
          {{ activePopover.title }}
        </p>
        <CodeRenderer
          v-if="activePopover.isCode"
          :code="activePopover.code"
          :lang="activePopover.lang"
          :max-height="200"
        />
        <p v-else class="doc-api-table__popover-text">
          {{ activePopover.code }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.doc-api-table {
  margin: 16px 0;
  content-visibility: auto;
  contain-intrinsic-size: auto 420px;
}

.doc-api-table__empty {
  padding: 20px 16px;
  border-radius: 12px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  text-align: center;
  font-size: 13px;
  color: var(--docs-muted);
}

.doc-api-table__wrap {
  width: 100%;
  overflow-x: auto;
  border-radius: 14px;
  background: var(--docs-surface);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
}

.doc-api-table__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.doc-api-table__table th {
  padding: 10px 14px;
  border-bottom: 1px solid var(--docs-border-light);
  background: var(--docs-surface-subtle);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: left;
  color: var(--docs-muted);
}

.col-param { width: 21%; }
.col-type { width: 25%; }
.col-default { width: 16%; }
.col-desc { width: 38%; }

.doc-api-table__table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--docs-border-light);
  vertical-align: top;
  color: var(--docs-ink);
}

.doc-api-table__table tbody tr:last-child td {
  border-bottom: 0;
}

.doc-api-table__table tbody tr:hover td {
  background: color-mix(in srgb, var(--docs-surface-subtle) 55%, transparent);
}

.doc-api-table__param-btn,
.doc-api-table__type-action,
.doc-api-table__default-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-family: var(--docs-mono-font);
  font-size: 12.5px;
  line-height: 1.4;
  text-align: left;
  word-break: break-word;
  cursor: copy;
}

.doc-api-table__param-btn {
  color: var(--docs-accent);
  font-weight: 600;
}

.doc-api-table__param-btn:hover,
.doc-api-table__type-action:hover,
.doc-api-table__default-btn:hover {
  background: color-mix(in srgb, var(--docs-accent) 11%, transparent);
}

.doc-api-table__type-action {
  color: var(--docs-ink);
}

.doc-api-table__type-action.is-link {
  color: var(--docs-accent);
  cursor: pointer;
}

.doc-api-table__type-action.is-popover {
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
}

.doc-api-table__default-btn {
  color: var(--docs-ink-regular);
}

.is-copied {
  color: var(--tx-color-success, #67c23a) !important;
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent) !important;
}

.doc-api-table__copied-pill {
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 16%, transparent);
}

.doc-api-table__type-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.doc-api-table__enum-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 0;
  border-radius: 999px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink);
  font-family: var(--docs-mono-font);
  font-size: 11.5px;
  line-height: 1.35;
  cursor: copy;
}

.doc-api-table__enum-tag:hover {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docs-accent) 40%, transparent);
  color: var(--docs-accent);
}

.doc-api-table__action-icon {
  flex: none;
  font-size: 12px;
  opacity: 0.72;
}

.doc-api-table__muted {
  color: var(--docs-muted);
}

.doc-api-table__desc-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.doc-api-table__desc-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--docs-ink-regular);
  word-break: break-word;
}

.doc-api-table__desc-text.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.doc-api-table__desc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--docs-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

/* R5: Pure CSS responsive stacked card layout below 900px — ZERO duplicate mobile Vue DOM! */
@media (max-width: 900px) {
  .doc-api-table__wrap {
    box-shadow: none;
    background: transparent;
    overflow: visible;
  }

  .doc-api-table__table,
  .doc-api-table__table tbody,
  .doc-api-table__table tr,
  .doc-api-table__table td {
    display: block;
    width: 100%;
  }

  .doc-api-table__table thead {
    display: none;
  }

  .doc-api-table__table tbody {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .doc-api-table__table tr {
    border-radius: 14px;
    background: var(--docs-surface);
    box-shadow: inset 0 0 0 1px var(--docs-border-light);
    padding: 12px 14px;
  }

  .doc-api-table__table td {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--docs-border-light);
  }

  .doc-api-table__table td:last-child {
    border-bottom: 0;
  }

  .doc-api-table__table td::before {
    content: attr(data-label);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--docs-muted);
    padding-top: 3px;
  }
}

.doc-api-table__singleton-popover {
  position: fixed;
  z-index: 2300;
  width: min(420px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--docs-surface, #ffffff);
  box-shadow:
    inset 0 0 0 1px var(--docs-border),
    0 16px 40px rgba(0, 0, 0, 0.2);
}

.doc-api-table__popover-title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--docs-muted);
}

.doc-api-table__popover-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--docs-ink);
}
</style>
