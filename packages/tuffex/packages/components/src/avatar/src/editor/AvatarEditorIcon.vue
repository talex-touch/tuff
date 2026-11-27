<script setup lang="ts">
import type { AvatarEditorIconName } from './icons'
import { computed } from 'vue'
import { AVATAR_EDITOR_ICONS } from './icons'

defineOptions({ name: 'AvatarEditorIcon' })

const props = withDefaults(defineProps<{
  name: AvatarEditorIconName
  size?: number
}>(), {
  size: 16,
})

const paths = computed(() => AVATAR_EDITOR_ICONS[props.name] ?? [])
</script>

<template>
  <svg
    class="tx-avatar-editor__svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, idx) in paths" :key="idx" :d="d" />
  </svg>
</template>
