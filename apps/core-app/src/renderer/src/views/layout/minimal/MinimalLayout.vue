<script lang="ts" name="AppLayoutMinimal" setup>
import { computed } from 'vue'
import { useLayoutAtoms } from '~/modules/layout/atoms'
import LayoutShell from '../shared/LayoutShell.vue'
import FloatingNav from '../shared/FloatingNav.vue'
import SimpleController from '../simple/SimpleController.vue'

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
const isWindows = process.platform === 'win32'
</script>

<template>
  <LayoutShell
    variant="flat"
    :atom-config="atomConfig"
    :display="isDisplayMode"
    :preview="isPreviewMode"
    :is-windows="isWindows"
  >
    <template #header>
      <SimpleController>
        <template #nav>
          <slot name="nav" />
        </template>
        <template v-if="shouldRenderSlots" #title>
          <slot name="title" />
        </template>
      </SimpleController>
    </template>
    <template #aside>
      <div v-if="false" aria-hidden="true"><slot name="navbar" /></div>
    </template>
    <template #icon>
      <slot name="icon" />
    </template>
    <template #view>
      <FloatingNav v-if="!isDisplayMode || isPreviewMode">
        <slot name="navbar" />
        <slot name="plugins" />
      </FloatingNav>
      <slot name="view" />
    </template>
  </LayoutShell>
</template>
