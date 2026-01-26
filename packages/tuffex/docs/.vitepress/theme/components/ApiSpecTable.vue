<script setup lang="ts">
import { computed, ref } from 'vue'

interface ApiSpecRow {
  name: string
  description?: string
  type?: string
  values?: string[]
  default?: string
}

const props = withDefaults(defineProps<{
  title?: string
  rows?: ApiSpecRow[]
}>(), {
  title: '',
  rows: () => [],
})

const copiedKey = ref('')

function extractEnumValues(type?: string) {
  if (!type)
    return []
  const single = Array.from(type.matchAll(/'([^']+)'/g)).map(match => match[1])
  if (single.length)
    return single
  const double = Array.from(type.matchAll(/\"([^\"]+)\"/g)).map(match => match[1])
  return double
}

const normalizedRows = computed(() => {
  return props.rows.map((row) => {
    const values = row.values?.length ? row.values : extractEnumValues(row.type)
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
  <section class="tx-spec-table">
    <div v-if="title" class="tx-spec-table__title">
      {{ title }}
    </div>
    <div class="tx-spec-table__wrap">
      <table class="tx-spec-table__table">
        <thead>
          <tr>
            <th>Property</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in normalizedRows" :key="row.name">
            <td class="tx-spec-table__name">
              <span>{{ row.name }}</span>
              <button
                type="button"
                class="tx-spec-table__copy"
                :aria-label="`Copy ${row.name}`"
                @click="copyText(row.name, row.name)"
              >
                <span :class="copiedKey === row.name ? 'i-carbon-checkmark' : 'i-carbon-copy'" />
              </button>
            </td>
            <td class="tx-spec-table__type">
              <div v-if="row.values.length" class="tx-spec-table__chips">
                <button
                  v-for="value in row.values"
                  :key="value"
                  type="button"
                  class="tx-spec-table__chip"
                  @click="copyText(value)"
                >
                  {{ value }}
                </button>
              </div>
              <button
                v-else-if="isCopyable(row.type)"
                type="button"
                class="tx-spec-table__mono is-copyable"
                @click="copyText(row.type)"
              >
                {{ row.type }}
              </button>
              <span v-else class="tx-spec-table__placeholder">—</span>
            </td>
            <td class="tx-spec-table__default">
              <button
                v-if="isCopyable(row.default)"
                type="button"
                class="tx-spec-table__mono is-copyable"
                @click="copyText(row.default)"
              >
                {{ row.default }}
              </button>
              <span v-else class="tx-spec-table__placeholder">—</span>
            </td>
            <td class="tx-spec-table__desc">
              {{ row.description || '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.tx-spec-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tx-spec-table__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.tx-spec-table__wrap {
  overflow-x: auto;
}

.tx-spec-table__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.tx-spec-table__table th,
.tx-spec-table__table td {
  text-align: left;
  padding: 14px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
  vertical-align: top;
}

.tx-spec-table__table th {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.tx-spec-table__table th:nth-child(1),
.tx-spec-table__table td:nth-child(1) {
  width: 18%;
}

.tx-spec-table__table th:nth-child(2),
.tx-spec-table__table td:nth-child(2) {
  width: 22%;
}

.tx-spec-table__table th:nth-child(3),
.tx-spec-table__table td:nth-child(3) {
  width: 16%;
}

.tx-spec-table__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tx-spec-table__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 80%, transparent);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tx-spec-table__copy:hover {
  border-color: rgba(59, 130, 246, 0.5);
  color: var(--vp-c-text-1);
}

.tx-spec-table__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tx-spec-table__chip {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--vp-c-border) 70%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 75%, transparent);
  color: var(--vp-c-text-1);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}

.tx-spec-table__mono {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--vp-c-text-1);
  background: none;
  border: none;
  padding: 0;
}

.tx-spec-table__mono.is-copyable {
  cursor: pointer;
}

.tx-spec-table__placeholder {
  color: var(--vp-c-text-3);
}

.tx-spec-table__desc {
  color: var(--vp-c-text-2);
  word-break: break-word;
}
</style>
