<script lang="ts" name="AppLayoutFlat" setup>
import { computed } from 'vue'
import { useLayoutAtoms } from '~/modules/layout/atoms'
import LayoutShell from '../shared/LayoutShell.vue'
import FlatController from './FlatController.vue'
import FlatNavBar from './FlatNavBar.vue'

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
const shouldRenderSlots = computed(() => !isDisplayMode.value || isPreviewMode.value)
</script>

<template>
  <LayoutShell
    variant="flat"
    :atom-config="atomConfig"
    :display="isDisplayMode"
    :preview="isPreviewMode"
  >
    <template #header>
      <FlatController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="shouldRenderSlots" #title>
          <slot name="title" />
        </template>
      </FlatController>
    </template>
    <template #aside>
      <FlatNavBar>
        <slot name="navbar" />
        <template #plugins>
          <slot name="plugins" />
        </template>
      </FlatNavBar>
    </template>
    <template #icon>
      <slot name="icon" />
    </template>
    <template #view>
      <slot name="view" />
    </template>
  </LayoutShell>
</template>
