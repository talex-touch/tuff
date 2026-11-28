<script setup lang="ts">
import type { TreeValue } from './tree-parser'
import { computed } from 'vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import { isCssColorValue } from './tree-parser'

defineOptions({
  name: 'TxCodeEditorTreeNode',
})

const props = withDefaults(defineProps<{
  nodeKey?: string | number | null
  value: TreeValue
  path: (string | number)[]
  depth?: number
  expandedPaths: ReadonlySet<string>
  selectedPathKey: string
  editable?: boolean
}>(), {
  nodeKey: null,
  depth: 0,
  editable: false,
})

const emit = defineEmits<{
  toggle: [pathKey: string]
  select: [path: (string | number)[]]
  updateValue: [payload: { path: (string | number)[], value: TreeValue }]
}>()

const pathKey = computed(() => (props.path.length === 0 ? '$' : props.path.map(String).join('.')))

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(() => props.value !== null && typeof props.value === 'object' && !Array.isArray(props.value))
const isBranch = computed(() => isArray.value || isObject.value)
const isExpanded = computed(() => props.expandedPaths.has(pathKey.value))
const isSelected = computed(() => props.selectedPathKey === pathKey.value)

const entries = computed<Array<{ key: string | number, value: TreeValue }>>(() => {
  if (Array.isArray(props.value))
    return props.value.map((item, index) => ({ key: index, value: item }))
  if (props.value !== null && typeof props.value === 'object') {
    return Object.entries(props.value).map(([key, value]) => ({ key, value }))
  }
  return []
})

const countLabel = computed(() => {
  const count = entries.value.length
  if (isArray.value)
    return count === 1 ? '1 item' : `${count} items`
  return count === 1 ? '1 key' : `${count} keys`
})

const colorSwatch = computed(() => (typeof props.value === 'string' && isCssColorValue(props.value) ? props.value : ''))

function handleToggle() {
  if (!isBranch.value)
    return
  emit('toggle', pathKey.value)
  emit('select', props.path)
}

function handleSelect() {
  emit('select', props.path)
}

function handleBooleanChange(next: boolean) {
  if (!props.editable)
    return
  emit('updateValue', { path: props.path, value: next })
}
</script>

<template>
  <div class="tx-ce-n" :class="{ 'is-root': depth === 0 }">
    <div
      class="tx-ce-nr"
      :class="{
        'is-branch': isBranch,
        'is-selected': isSelected,
      }"
      :style="{ '--tx-tree-depth': depth }"
      @click="isBranch ? handleToggle() : handleSelect()"
    >
      <button
        v-if="isBranch"
        type="button"
        class="tx-ce-nt"
        :class="{ 'is-expanded': isExpanded }"
        :aria-expanded="isExpanded"
        aria-label="Toggle node"
        @click.stop="handleToggle"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 4 4 4-4 4" />
        </svg>
      </button>
      <span v-else class="tx-ce-ns" aria-hidden="true" />

      <template v-if="nodeKey !== null">
        <span
          class="tx-ce-nk"
          :class="{ 'is-index': typeof nodeKey === 'number' }"
        >{{ nodeKey }}</span>
        <span class="tx-ce-nm">:</span>
      </template>

      <template v-if="isBranch">
        <span class="tx-ce-nm">{{ isArray ? '[' : '{' }}</span>
        <span v-if="!isExpanded || isArray" class="tx-code-editor-tree-node__count">
          {{ countLabel }}
        </span>
        <span v-if="!isExpanded" class="tx-ce-nm">{{ isArray ? ']' : '}' }}</span>
      </template>

      <template v-else-if="typeof value === 'boolean'">
        <span class="tx-ce-nv" @click.stop>
          <TxCheckbox
            class="tx-ce-nc"
            :model-value="value"
            :disabled="!editable"
            :aria-label="nodeKey !== null ? String(nodeKey) : 'boolean'"
            @update:model-value="handleBooleanChange"
          />
          <span class="tx-ce-nv is-bool">{{ String(value) }}</span>
        </span>
      </template>

      <template v-else-if="value === null">
        <span class="tx-ce-nv is-null">null</span>
      </template>

      <template v-else-if="typeof value === 'number'">
        <span class="tx-ce-nv is-number">{{ value }}</span>
      </template>

      <template v-else>
        <span class="tx-ce-nv is-string">
          <span
            v-if="colorSwatch"
            class="tx-code-editor-tree-node__swatch"
            :style="{ backgroundColor: colorSwatch }"
            aria-hidden="true"
          />
          <span>{{ value }}</span>
        </span>
      </template>
    </div>

    <div
      v-if="isBranch && isExpanded"
      class="tx-ce-nch"
      :style="{ '--tx-tree-depth': depth }"
    >
      <TxCodeEditorTreeNode
        v-for="entry in entries"
        :key="String(entry.key)"
        :node-key="entry.key"
        :value="entry.value"
        :path="[...path, entry.key]"
        :depth="depth + 1"
        :expanded-paths="expandedPaths"
        :selected-path-key="selectedPathKey"
        :editable="editable"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
        @update-value="emit('updateValue', $event)"
      />
      <div
        class="tx-ce-ncl"
        :style="{ '--tx-tree-depth': depth }"
      >
        <span class="tx-ce-nm">{{ isArray ? ']' : '}' }}</span>
      </div>
    </div>
  </div>
</template>
