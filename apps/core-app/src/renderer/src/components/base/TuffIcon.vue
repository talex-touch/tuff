<script lang="ts" name="TuffIcon" setup>
// Legacy adaptor: new CoreApp code should import TxIcon from @talex-touch/tuffex/icon.
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon } from '@talex-touch/tuffex/icon'

defineProps<{
  icon?: ITuffIcon | null
  alt?: string
  size?: number
  empty?: string
  /** Preserve the original color of the svg icon */
  colorful?: boolean
}>()
</script>

<template>
  <TxIcon class="TuffIcon" :icon="icon" :alt="alt" :size="size" :empty="empty" :colorful="colorful">
    <template v-if="$slots.empty" #empty>
      <slot name="empty" />
    </template>
  </TxIcon>
</template>
