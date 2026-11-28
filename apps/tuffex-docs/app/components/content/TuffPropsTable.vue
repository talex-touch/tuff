<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref } from 'vue'

interface PropRow {
  name: string
  type?: unknown
  default?: unknown
  description?: string
  values?: string[]
}

const props = withDefaults(defineProps<{ rows?: PropRow[] }>(), {
  rows: () => [],
})

const { locale } = useI18n()

const labels = computed(() => {
  const zh = locale.value.startsWith('zh')
  return {
    property: zh ? '属性名' : 'Property',
    type: zh ? '类型' : 'Type',
    default: zh ? '默认值' : 'Default',
    description: zh ? '说明' : 'Description',
    copy: zh ? '点击复制' : 'Click to copy',
    copied: zh ? '已复制' : 'Copied',
  }
})

const copiedKey = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | null = null

function stripWrappingBackticks(value: string) {
  const trimmed = value.trim()
  if (trimmed.length < 2 || !trimmed.startsWith('`') || !trimmed.endsWith('`'))
    return trimmed
  return trimmed.replace(/^`+/, '').replace(/`+$/, '').trim()
}

function toCopyText(value: unknown): string {
  if (typeof value === 'string')
    return stripWrappingBackticks(value)
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return ''
}

function extractValues(type?: unknown): string[] {
  const text = toCopyText(type)
  if (!text)
    return []
  const single = Array.from(text.matchAll(/'([^']+)'/g)).map(m => m[1]!).filter(Boolean)
  if (single.length)
    return single
  return Array.from(text.matchAll(/"([^"]+)"/g)).map(m => m[1]!).filter(Boolean)
}

interface DescriptionSegment {
  code: boolean
  text: string
}

function toDescriptionSegments(description?: string): DescriptionSegment[] {
  if (!description)
    return []
  const segments: DescriptionSegment[] = []
  let last = 0
  for (const match of description.matchAll(/`([^`]+)`/g)) {
    const start = match.index ?? 0
    if (start > last)
      segments.push({ code: false, text: description.slice(last, start) })
    segments.push({ code: true, text: match[1] ?? '' })
    last = start + match[0].length
  }
  if (last < description.length)
    segments.push({ code: false, text: description.slice(last) })
  return segments
}

function DescriptionText(cell: { segments: DescriptionSegment[] }) {
  return cell.segments.map(segment => (segment.code ? h('code', segment.text) : segment.text))
}

const normalizedRows = computed(() =>
  props.rows.map((row) => {
    const values = row.values?.length ? row.values.map(toCopyText).filter(Boolean) : extractValues(row.type)
    return {
      ...row,
      displayName: toCopyText(row.name),
      displayType: toCopyText(row.type),
      displayDefault: toCopyText(row.default),
      descriptionSegments: toDescriptionSegments(row.description),
      values,
    }
  }),
)

function isCopyable(value?: unknown) {
  const trimmed = toCopyText(value).trim()
  return Boolean(trimmed) && trimmed !== '-' && trimmed !== '—'
}

function copyKey(scope: string, name: string, value = '') {
  return `${scope}:${name}:${value}`
}

async function copyText(text?: unknown, key?: string) {
  const copyValue = toCopyText(text).trim()
  if (!copyValue || !import.meta.client)
    return
  try {
    if (navigator.clipboard)
      await navigator.clipboard.writeText(copyValue)
  }
  catch {
    return
  }
  if (key) {
    copiedKey.value = key
    if (copiedTimer)
      clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      if (copiedKey.value === key)
        copiedKey.value = ''
      copiedTimer = null
    }, 1400)
  }
}

onBeforeUnmount(() => {
  if (copiedTimer)
    clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="tuff-props-table not-prose">
    <span class="sr-only" aria-live="polite">
      {{ copiedKey ? labels.copied : '' }}
    </span>
    <table v-if="normalizedRows.length" class="tuff-props-table__table">
      <thead>
        <tr>
          <th>{{ labels.property }}</th>
          <th>{{ labels.type }}</th>
          <th>{{ labels.default }}</th>
          <th>{{ labels.description }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in normalizedRows" :key="row.name">
          <td :data-label="labels.property" class="tuff-props-table__name">
            <button
              type="button"
              class="tuff-props-table__copy-token"
              :class="{ 'is-copied': copiedKey === copyKey('name', row.name) }"
              :title="copiedKey === copyKey('name', row.name) ? labels.copied : labels.copy"
              @click="copyText(row.displayName, copyKey('name', row.name))"
            >
              {{ row.displayName }}
            </button>
          </td>
          <td :data-label="labels.type" class="tuff-props-table__type">
            <template v-if="row.values.length">
              <button
                v-for="value in row.values"
                :key="value"
                type="button"
                class="tuff-props-table__tag"
                :class="{ 'is-copied': copiedKey === copyKey('value', row.name, value) }"
                :title="labels.copy"
                @click="copyText(value, copyKey('value', row.name, value))"
              >
                <span v-if="copiedKey === copyKey('value', row.name, value)" class="i-carbon-checkmark" aria-hidden="true" />
                {{ value }}
              </button>
            </template>
            <button
              v-else-if="isCopyable(row.displayType)"
              type="button"
              class="tuff-props-table__mono"
              :class="{ 'is-copied': copiedKey === copyKey('type', row.name) }"
              :title="labels.copy"
              @click="copyText(row.displayType, copyKey('type', row.name))"
            >
              <span v-if="copiedKey === copyKey('type', row.name)" class="i-carbon-checkmark" aria-hidden="true" />
              {{ row.displayType }}
            </button>
            <span v-else class="tuff-props-table__placeholder">-</span>
          </td>
          <td :data-label="labels.default" class="tuff-props-table__default">
            <button
              v-if="isCopyable(row.displayDefault)"
              type="button"
              class="tuff-props-table__mono"
              :class="{ 'is-copied': copiedKey === copyKey('default', row.name) }"
              :title="labels.copy"
              @click="copyText(row.displayDefault, copyKey('default', row.name))"
            >
              <span v-if="copiedKey === copyKey('default', row.name)" class="i-carbon-checkmark" aria-hidden="true" />
              {{ row.displayDefault }}
            </button>
            <span v-else class="tuff-props-table__placeholder">-</span>
          </td>
          <td :data-label="labels.description" class="tuff-props-table__desc">
            <DescriptionText v-if="row.descriptionSegments.length" :segments="row.descriptionSegments" />
            <template v-else>
              -
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="tuff-props-table__empty">
      No props yet.
    </div>
  </div>
</template>

<style scoped>
.tuff-props-table {
  position: relative;
  width: 100%;
  margin: 14px 0;
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}

.tuff-props-table__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.tuff-props-table__table th {
  text-align: left;
  padding: 10px 12px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--docs-muted);
  border-bottom: 1px solid var(--docs-border);
}

.tuff-props-table__table td {
  padding: 13px 12px;
  border-bottom: 1px solid var(--docs-border-light);
  color: var(--docs-ink);
  vertical-align: top;
}

.tuff-props-table__table tr:last-child td {
  border-bottom: 0;
}

.tuff-props-table__table th:nth-child(1),
.tuff-props-table__table td:nth-child(1) { width: 19%; }
.tuff-props-table__table th:nth-child(2),
.tuff-props-table__table td:nth-child(2) { width: 23%; }
.tuff-props-table__table th:nth-child(3),
.tuff-props-table__table td:nth-child(3) { width: 16%; }

.tuff-props-table__copy-token {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 0;
  border-radius: 6px;
  padding: 2px 5px;
  background: transparent;
  color: var(--docs-accent);
  font-family: var(--docs-mono-font);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  word-break: break-word;
  cursor: copy;
}

.tuff-props-table__copy-token:hover {
  background: color-mix(in srgb, var(--docs-accent) 12%, transparent);
}

.tuff-props-table__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px 6px 0;
  border: 1px solid var(--docs-border-light);
  border-radius: 999px;
  background: var(--docs-surface-subtle);
  color: var(--docs-ink);
  cursor: copy;
  font-family: var(--docs-mono-font);
  font-size: 11.5px;
  line-height: 1.25;
  padding: 3px 8px;
}

.tuff-props-table__tag:hover {
  border-color: color-mix(in srgb, var(--docs-accent) 40%, transparent);
  color: var(--docs-accent);
}

.tuff-props-table__mono {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--docs-ink-regular);
  font-family: var(--docs-mono-font);
  font-size: 12px;
  line-height: 1.4;
  padding: 2px 4px;
  cursor: copy;
  text-align: left;
  word-break: break-word;
}

.tuff-props-table__mono:hover {
  background: color-mix(in srgb, var(--docs-accent) 12%, transparent);
  color: var(--docs-accent);
}

.is-copied {
  color: var(--tx-color-success, #67c23a) !important;
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent) !important;
}

.tuff-props-table__desc {
  color: var(--docs-ink-regular);
  line-height: 1.55;
  word-break: break-word;
}

.tuff-props-table__desc :deep(code) {
  font-family: var(--docs-mono-font);
  font-size: 0.875em;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--docs-inline-code-bg);
  border: 1px solid var(--docs-inline-code-border);
}

.tuff-props-table__placeholder {
  color: var(--docs-muted);
}

.tuff-props-table__empty {
  text-align: center;
  color: var(--docs-muted);
  font-size: 13px;
  padding: 16px;
}

@media (max-width: 760px) {
  .tuff-props-table__table,
  .tuff-props-table__table tbody,
  .tuff-props-table__table tr,
  .tuff-props-table__table td {
    display: block;
    width: 100% !important;
  }

  .tuff-props-table__table thead {
    display: none;
  }

  .tuff-props-table__table tr {
    padding: 10px 0;
    border-bottom: 1px solid var(--docs-border);
  }

  .tuff-props-table__table td {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 8px;
    padding: 5px 0;
    border-bottom: 0;
  }

  .tuff-props-table__table td::before {
    content: attr(data-label);
    font-size: 11px;
    font-weight: 600;
    color: var(--docs-muted);
    padding-top: 2px;
  }
}
</style>
