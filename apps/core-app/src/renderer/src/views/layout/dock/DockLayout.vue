<script lang="ts" name="AppLayoutDock" setup>
import { computed } from 'vue'
import { useLayoutAtoms } from '~/modules/layout/atoms'
import LayoutShell from '../shared/LayoutShell.vue'
import SimpleController from '../simple/SimpleController.vue'
import FlatNavBar from '../flat/FlatNavBar.vue'

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
