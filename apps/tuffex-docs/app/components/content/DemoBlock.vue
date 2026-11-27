<script setup lang="ts">
import { computed, useSlots } from 'vue'
import TuffDemo from './TuffDemo.vue'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  code?: string
  codeHtml?: string
  codeLabel?: string
  codeLang?: string
}>(), {
  title: '',
  description: '',
  code: '',
  codeHtml: '',
  codeLabel: '',
  codeLang: 'vue',
})

const slots = useSlots()
const hasPreviewSlot = computed(() => Boolean(slots.preview))
const hasCodeSlot = computed(() => Boolean(slots.code))
</script>

<template>
  <TuffDemo
    :title="props.title"
    :description="props.description"
    :code="props.code"
    :code-html="props.codeHtml"
    :code-label="props.codeLabel"
    :code-lang="props.codeLang"
  >
    <template v-if="hasPreviewSlot" #preview>
      <slot name="preview" />
    </template>
    <template v-if="hasCodeSlot" #code>
      <slot name="code" />
    </template>
  </TuffDemo>
</template>
