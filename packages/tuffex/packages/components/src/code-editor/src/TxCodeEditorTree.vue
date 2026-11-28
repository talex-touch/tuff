<script setup lang="ts">
import type { CodeEditorLanguage } from './types'
import type { TreeValue } from './tree-parser'
import { computed, ref, watch } from 'vue'
import TxCodeEditorTreeNode from './TxCodeEditorTreeNode.vue'
import { encodeTreePathKey, parseStructuredValue, serializeStructuredValue, setValueAtPath } from './tree-parser'

defineOptions({
  name: 'TxCodeEditorTree',
})

const props = withDefaults(defineProps<{
  source: string
  language: CodeEditorLanguage
  tabSize?: number
  readOnly?: boolean
}>(), {
  tabSize: 2,
  readOnly: false,
})

const emit = defineEmits<{
  updateSource: [value: string]
  switchToCode: []
}>()

const ROOT_PATH_KEY = encodeTreePathKey([])
const rootAncestors: ReadonlySet<object> = new Set()

const parsed = computed(() => parseStructuredValue(props.source, props.language))
const expandedPaths = ref<Set<string>>(new Set([ROOT_PATH_KEY]))
const selectedPath = ref<(string | number)[]>([])
const initialized = ref(false)

function collectBranchPaths(
  value: TreeValue,
  maxDepth: number,
  path: (string | number)[] = [],
  depth = 0,
  out: string[] = [],
  ancestors: ReadonlySet<object> = new Set(),
): string[] {
  if (value === null || typeof value !== 'object')
    return out
  if (ancestors.has(value))
    return out
  if (depth <= maxDepth)
    out.push(encodeTreePathKey(path))
  if (depth >= maxDepth)
    return out

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(value)

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectBranchPaths(item, maxDepth, [...path, index], depth + 1, out, nextAncestors))
  }
  else {
    Object.entries(value).forEach(([key, item]) => collectBranchPaths(item, maxDepth, [...path, key], depth + 1, out, nextAncestors))
  }
  return out
}

watch(
  () => parsed.value,
  (next) => {
    if (next.ok && next.value !== undefined && !initialized.value) {
      expandedPaths.value = new Set(collectBranchPaths(next.value, 2))
      initialized.value = true
    }
  },
  { immediate: true },
)

const selectedPathKey = computed(() => encodeTreePathKey(selectedPath.value))

function togglePath(pathKey: string) {
  const next = new Set(expandedPaths.value)
  if (next.has(pathKey))
    next.delete(pathKey)
  else
    next.add(pathKey)
  expandedPaths.value = next
}

function expandAll() {
  if (!parsed.value.ok || parsed.value.value === undefined)
    return
  expandedPaths.value = new Set(collectBranchPaths(parsed.value.value, 12))
}

function collapseAll() {
  expandedPaths.value = new Set([ROOT_PATH_KEY])
}

function handleSelect(path: (string | number)[]) {
  selectedPath.value = path
}

function handleUpdateValue(payload: { path: (string | number)[], value: TreeValue }) {
  if (props.readOnly || !parsed.value.ok || !parsed.value.editable || parsed.value.value === undefined)
    return
  const nextTree = setValueAtPath(parsed.value.value, payload.path, payload.value)
  const serialized = serializeStructuredValue(nextTree, props.language, props.tabSize)
  if (serialized !== null)
    emit('updateSource', serialized)
}
</script>

<template>
  <div class="tx-code-editor-tree">
    <div class="tx-ce-tb">
      <div class="tx-ce-tc" aria-label="Selected path">
        <span class="tx-ce-td">›</span>
        <template v-if="selectedPath.length">
          <template v-for="(seg, idx) in selectedPath" :key="`${idx}-${seg}`">
            <span v-if="idx > 0" class="tx-ce-td">›</span>
            <span class="tx-ce-ti">{{ seg }}</span>
          </template>
        </template>
        <span v-else class="tx-ce-ti is-root">root</span>
      </div>

      <div v-if="parsed.ok" class="tx-ce-ta">
        <button type="button" class="tx-ce-tbtn" title="Expand all" @click="expandAll">
          Expand
        </button>
        <button type="button" class="tx-ce-tbtn" title="Collapse all" @click="collapseAll">
          Collapse
        </button>
      </div>
    </div>

    <div v-if="parsed.ok && parsed.value !== undefined" class="tx-ce-tbody">
      <TxCodeEditorTreeNode
        :value="parsed.value"
        :path="[]"
        :depth="0"
        :expanded-paths="expandedPaths"
        :selected-path-key="selectedPathKey"
        :editable="!readOnly && parsed.editable"
        :ancestors="rootAncestors"
        @toggle="togglePath"
        @select="handleSelect"
        @update-value="handleUpdateValue"
      />
    </div>

    <div v-else class="tx-ce-terr">
      <p class="tx-ce-tet">
        Unable to preview structure
      </p>
      <p class="tx-ce-tem">
        {{ parsed.error }}
      </p>
      <button type="button" class="tx-ce-tbtn" @click="emit('switchToCode')">
        Edit code
      </button>
    </div>
  </div>
</template>
