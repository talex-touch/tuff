<script setup lang="ts">
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
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

async function copyText(text?: string, key?: string) {
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
            <TxButton circle size="small" variant="ghost" native-type="button" :icon="copiedKey === row.name ? 'i-carbon-checkmark' : 'i-carbon-copy'" :aria-label="`Copy ${row.name}`" @click="copyText(row.name, row.name)" />
          </td>
          <td class="tuff-props-table__type">
            <template v-if="row.values.length">
              <TxTag
                v-for="value in row.values"
                :key="value"
                class="tuff-props-table__tag"
                :label="value"
                size="sm"
                @click="copyText(value)"
              />
            </template>
            <TxButton v-else-if="isCopyable(row.type)" native-type="button" variant="bare" size="small" class="tuff-props-table__mono" @click="copyText(row.type)">
              {{ row.type }}
            </TxButton>
            <span v-else class="tuff-props-table__placeholder">-</span>
          </td>
          <td class="tuff-props-table__default">
            <TxButton v-if="isCopyable(row.default)" native-type="button" variant="bare" size="small" class="tuff-props-table__mono" @click="copyText(row.default)">
              {{ row.default }}
            </TxButton>
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
  letter-spacing: 0.06em;
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

.tuff-props-table__tag {
  margin: 0 8px 6px 0;
}

.tuff-props-table__desc {
  color: var(--docs-muted);
  word-break: break-word;
}

.tuff-props-table__mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
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

</style>
