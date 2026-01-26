<script setup lang="ts">
import { computed, ref } from 'vue'

interface PropRow {
  name: string
  type?: string
  default?: string
  description?: string
  values?: string[]
}

const props = withDefaults(defineProps<{ rows?: PropRow[] }>(), {
  rows: () => [],
})
const labels = {
  property: 'Property',
  type: 'Type',
  default: 'Default',
  description: 'Description',
}

const copiedKey = ref('')

function extractValues(type?: string) {
  if (!type)
    return []
  const matches = Array.from(type.matchAll(/'([^']+)'/g)).map(match => match[1])
  if (matches.length)
    return matches
  const doubleMatches = Array.from(type.matchAll(/"([^"]+)"/g)).map(match => match[1])
  return doubleMatches
}

const normalizedRows = computed(() => {
  return props.rows.map((row) => {
    const values = row.values?.length ? row.values : extractValues(row.type)
    return {
      ...row,
      values,
    }
  })
})

function isCopyable(value?: string) {
  if (!value)
    return false
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-' || trimmed === '—')
    return false
  return true
}

function fallbackCopy(text: string) {
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

async function copyText(text?: string, key?: string) {
  if (!text || typeof window === 'undefined')
    return
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    fallbackCopy(text)
  }
  if (key) {
    copiedKey.value = key
    window.setTimeout(() => {
      if (copiedKey.value === key)
        copiedKey.value = ''
    }, 1400)
  }
}
</script>

<template>
  <div class="tuff-props-table">
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
          <td class="tuff-props-table__name">
            <span>{{ row.name }}</span>
            <button
              type="button"
              class="tuff-props-table__copy"
              :aria-label="`Copy ${row.name}`"
              @click="copyText(row.name, row.name)"
            >
              <span :class="copiedKey === row.name ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
            </button>
          </td>
          <td class="tuff-props-table__type">
            <template v-if="row.values.length">
              <button
                v-for="value in row.values"
                :key="value"
                type="button"
                class="tuff-props-tag tuff-props-tag--clickable"
                @click="copyText(value)"
              >
                {{ value }}
              </button>
            </template>
            <button
              v-else-if="isCopyable(row.type)"
              type="button"
              class="tuff-props-table__mono tuff-props-table__mono--clickable"
              @click="copyText(row.type)"
            >
              {{ row.type }}
            </button>
            <span v-else class="tuff-props-table__placeholder">-</span>
          </td>
          <td class="tuff-props-table__default">
            <button
              v-if="isCopyable(row.default)"
              type="button"
              class="tuff-props-table__mono tuff-props-table__mono--clickable"
              @click="copyText(row.default)"
            >
              {{ row.default }}
            </button>
            <span v-else class="tuff-props-table__placeholder">-</span>
          </td>
          <td class="tuff-props-table__desc">
            {{ row.description || '-' }}
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
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.tuff-props-table__table {
  display: table !important;
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
  border-radius: 0 !important;
  overflow: visible !important;
}

:global(.markdown-body .tuff-props-table__table) {
  display: table !important;
  width: 100% !important;
  overflow: visible !important;
}

.tuff-props-table .tuff-props-table__table th {
  text-align: left;
  padding: 12px 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--docs-muted);
  background: transparent;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
}

.tuff-props-table .tuff-props-table__table td {
  padding: 16px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  color: var(--docs-ink);
  vertical-align: top;
}

.tuff-props-table .tuff-props-table__table tr:last-child td {
  border-bottom: none;
}

.tuff-props-table .tuff-props-table__table tr:nth-child(2n) {
  background: transparent;
}

.tuff-props-table__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--docs-accent);
}

.tuff-props-table__type,
.tuff-props-table__default {
  min-width: 0;
}

.tuff-props-table__table th:nth-child(1),
.tuff-props-table__table td:nth-child(1) {
  width: 18%;
}

.tuff-props-table__table th:nth-child(2),
.tuff-props-table__table td:nth-child(2) {
  width: 22%;
}

.tuff-props-table__table th:nth-child(3),
.tuff-props-table__table td:nth-child(3) {
  width: 16%;
}

.tuff-props-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--docs-ink);
  border: none;
  background: rgba(241, 245, 249, 0.95);
  margin: 0 8px 6px 0;
}

.tuff-props-tag--clickable {
  cursor: pointer;
}

.tuff-props-tag--clickable:hover {
  background: rgba(226, 232, 240, 0.9);
}

.tuff-props-table__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.8);
  color: rgba(71, 85, 105, 0.9);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tuff-props-table__copy:hover {
  border-color: rgba(59, 130, 246, 0.5);
  color: rgba(30, 64, 175, 0.95);
}

.tuff-props-tag.is-default {
  color: rgba(30, 41, 59, 0.7);
  background: rgba(241, 245, 249, 0.95);
}

.tuff-props-table__desc {
  color: var(--docs-muted);
  word-break: break-word;
}

.tuff-props-table__mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--docs-ink);
  background: transparent;
  border: none;
  padding: 0;
}

.tuff-props-table__mono--clickable {
  cursor: pointer;
}

.tuff-props-table__mono--clickable:hover {
  color: var(--docs-accent-strong);
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

::global(.dark .tuff-props-table),
::global([data-theme='dark'] .tuff-props-table) {
  background: transparent;
  border: none;
  box-shadow: none;
}

::global(.dark .tuff-props-table__table th),
::global([data-theme='dark'] .tuff-props-table__table th) {
  background: transparent;
  color: rgba(226, 232, 240, 0.7);
  border-bottom-color: rgba(148, 163, 184, 0.35);
}

::global(.dark .tuff-props-table__table td),
::global([data-theme='dark'] .tuff-props-table__table td) {
  border-bottom-color: rgba(148, 163, 184, 0.22);
  color: rgba(226, 232, 240, 0.9);
}

::global(.dark .tuff-props-tag),
::global([data-theme='dark'] .tuff-props-tag) {
  background: rgba(30, 41, 59, 0.7);
  border: none;
  color: rgba(226, 232, 240, 0.85);
}

::global(.dark .tuff-props-tag--clickable:hover),
::global([data-theme='dark'] .tuff-props-tag--clickable:hover) {
  background: rgba(15, 23, 42, 0.75);
}

::global(.dark .tuff-props-table__copy),
::global([data-theme='dark'] .tuff-props-table__copy) {
  background: rgba(15, 23, 42, 0.7);
  border-color: rgba(148, 163, 184, 0.35);
  color: rgba(226, 232, 240, 0.8);
}

::global(.dark .tuff-props-tag.is-default),
::global([data-theme='dark'] .tuff-props-tag.is-default) {
  color: rgba(226, 232, 240, 0.7);
  background: rgba(30, 41, 59, 0.7);
}
</style>
