<script lang="ts" name="AppLayoutClassic" setup>
import { computed } from 'vue'
import { useLayoutAtoms } from '~/modules/layout/atoms'
import LayoutShell from '../shared/LayoutShell.vue'
import ClassicController from './ClassicController.vue'

const props = withDefaults(
  defineProps<{
    display?: boolean
    preview?: boolean
  }>(),
  {
    display: false,
    preview: false
  }
)

const { atomConfig } = useLayoutAtoms()
const isDisplayMode = computed(() => props.display)
const isPreviewMode = computed(() => props.preview)
const isWindows = process.platform === 'win32'
</script>

<template>
  <LayoutShell
    variant="simple"
    :atom-config="atomConfig"
    :display="isDisplayMode"
    :preview="isPreviewMode"
    :is-windows="isWindows"
  >
    <template #header>
      <ClassicController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template #title>
          <slot name="title" />
        </template>
        <template #navbar>
          <slot name="navbar" />
        </template>
      </ClassicController>
    </template>
    <template #aside>
      <div aria-hidden="true" />
    </template>
    <template #icon>
      <slot name="icon" />
    </template>
    <template #view>
      <slot name="view" />
    </template>
  </LayoutShell>
</template>
