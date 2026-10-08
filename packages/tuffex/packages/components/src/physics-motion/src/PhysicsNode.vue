<script setup lang="ts">
// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { PhysicsNode } from './scene-model'
import type { PhysicsMotionLabels } from './types'
import { computed } from 'vue'

defineOptions({ name: 'PhysicsNode' })
const props = defineProps<{ node: PhysicsNode, labels: PhysicsMotionLabels }>()
const content = computed(() => props.node.text
  ? props.labels[props.node.text.slice(1) as 'content' | 'north' | 'south']
  : undefined)
</script>

<template>
  <component :is="node.tag" v-bind="node.attrs" :data-part="node.part" :style="node.style">
    {{ content }}
    <PhysicsNode v-for="(child, index) in node.children" :key="child.part ?? index" :node="child" :labels="labels" />
  </component>
</template>
