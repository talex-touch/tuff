<script lang="ts" setup>
import type { DialogButton, DialogSurfaceProps } from '@talex-touch/tuffex/dialog'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'TBottomDialog' })

interface Props {
  /** Dialog title */
  title?: string
  /** Dialog message */
  message?: string
  /** Stay time in milliseconds */
  stay?: number
  /** Close callback function */
  close: () => void
  /** Array of buttons */
  btns?: DialogButton[]
  /** Icon name */
  icon?: string
  /** Z-index value */
  index?: number
  /** Accessible label for the close button */
  closeLabel?: string
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
  stay: 0,
  btns: () => [],
  icon: '',
  index: 0,
  closeLabel: undefined,
  surface: undefined,
  surfaceColor: undefined,
  surfaceOpacity: undefined
})

const { t } = useI18n()
</script>

<template>
  <TxBottomDialog
    :title="props.title"
    :message="props.message"
    :stay="props.stay"
    :close="props.close"
    :btns="props.btns"
    :icon="props.icon"
    :index="props.index"
    :close-label="props.closeLabel ?? t('common.close')"
    :surface="props.surface"
    :surface-color="props.surfaceColor"
    :surface-opacity="props.surfaceOpacity"
  />
</template>
