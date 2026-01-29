<script setup lang="ts">
import { computed, useSlots } from 'vue'
import TuffDemo from '~/components/content/TuffDemo.vue'

interface DemoBlockProps {
  title?: string
  description?: string
  code?: string
  codeLabel?: string
  codeLang?: string
}

const props = withDefaults(defineProps<DemoBlockProps>(), {
  title: '',
  description: '',
  code: '',
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
