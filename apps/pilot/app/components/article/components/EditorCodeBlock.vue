<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import EditorMindmap from './EditorMindmap.vue'
import EditorEcharts from './EditorEcharts.vue'
import EditorMermaid from './EditorMermaid.vue'
import EditorAbc from './EditorAbc.vue'
import EditorCode from './EditorCode.vue'

const { contentRef, selected, node } = useNodeViewContext()

const lang = computed(() => node.value.attrs.language)

const renderList = ['mindmap', 'echarts', 'mermaid', 'abc', 'flowchart']

const renderMode = computed(() => !!renderList.find(item => item === lang.value))
</script>

<template>
  <div :lang="lang" class="EditorCodeBlock" :class="{ selected }">
    <template v-if="renderMode">
      <EditorMindmap v-if="lang === 'mindmap'" :node="node" />
      <EditorEcharts v-else-if="lang === 'echarts'" :node="node" />
      <EditorMermaid v-else-if="lang === 'mermaid'" :node="node" />
      <EditorMermaid v-else-if="lang === 'flowchart'" :node="node" />
      <EditorAbc v-else-if="lang === 'abc'" :node="node" />
    </template>
    <template v-else>
      <EditorCode :selected="selected" :node="node" />
    </template>
  </div>
</template>

<style lang="scss">
.EditorCodeBlock {
  margin: 16px 0;
}
</style>
