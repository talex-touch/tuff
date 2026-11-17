<script lang="ts" setup>
import type {
  DialogMessageHtml,
  DialogSurfaceProps,
  TouchTipButton
} from '@talex-touch/tuffex/dialog'
import { TxTouchTip } from '@talex-touch/tuffex/dialog'

defineOptions({ name: 'TouchTip' })

interface Props {
  /** Dialog title */
  title?: string
  /** Dialog message */
  message?: string
  /** Trusted HTML dialog message */
  messageHtml?: DialogMessageHtml
  /** Array of buttons */
  buttons?: TouchTipButton[]
  /** Close callback function */
  close: () => void
  /** Surface material mode */
  surface?: DialogSurfaceProps['surface']
  /** Surface tint colour */
  surfaceColor?: string
  /** Surface tint opacity */
  surfaceOpacity?: number
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  messageHtml: '',
  buttons: () => [],
  surface: undefined,
  surfaceColor: undefined,
  surfaceOpacity: undefined
})
</script>

<template>
  <TxTouchTip
    :title="props.title"
    :message="props.message"
    :message-html="props.messageHtml"
    :buttons="props.buttons"
    :close="props.close"
    :surface="props.surface"
    :surface-color="props.surfaceColor"
    :surface-opacity="props.surfaceOpacity"
  />
</template>
