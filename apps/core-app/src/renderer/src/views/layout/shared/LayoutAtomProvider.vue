<script lang="ts" name="LayoutAtomProvider" setup>
import type { LayoutAtomConfig } from '@talex-touch/utils'
import { computed } from 'vue'
import { resolveLayoutAtomsToCSSVars } from '~/modules/layout/atoms'

const props = defineProps<{
  atomConfig: LayoutAtomConfig | null | undefined
}>()

const atomCSSVars = computed(() => {
  if (!props.atomConfig) return {}
  const vars = resolveLayoutAtomsToCSSVars(props.atomConfig)
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v as string])) as Record<
    string,
    string
  >
})
</script>

<template>
  <div class="LayoutAtomProvider" :style="atomCSSVars">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.LayoutAtomProvider {
  width: 100%;
  height: 100%;
}
</style>
