<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'

const EditorMindmap = defineAsyncComponent(() => import('./EditorMindmap.vue'))
const EditorEcharts = defineAsyncComponent(() => import('./EditorEcharts.vue'))
const EditorMermaid = defineAsyncComponent(() => import('./EditorMermaid.vue'))
const EditorAbc = defineAsyncComponent(() => import('./EditorAbc.vue'))
const EditorCode = defineAsyncComponent(() => import('./EditorCode.vue'))

const { selected, node } = useNodeViewContext()

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
