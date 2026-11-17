<script lang="ts" setup>
import type { DialogMessageHtml, DialogSurfaceProps } from '@talex-touch/tuffex/dialog'
import type { Component, VNode } from 'vue'
import { TxBlowDialog } from '@talex-touch/tuffex/dialog'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'TBlowDialog' })

interface Props {
  /** Callback function to close the dialog */
  close: () => void
  /** Dialog title */
  title?: string
  /** Dialog message content */
  message?: string
  /** Trusted HTML dialog message content */
  messageHtml?: DialogMessageHtml
  /** Confirm button label */
  confirmText?: string
  /** Component to render */
  comp?: Component
  /** Render function */
  render?: () => VNode
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
  confirmText: undefined,
  comp: undefined,
  render: undefined,
  surface: undefined,
  surfaceColor: undefined,
  surfaceOpacity: undefined
})

const { t } = useI18n()
</script>

<template>
  <TxBlowDialog
    :close="props.close"
    :title="props.title"
    :message="props.message"
    :message-html="props.messageHtml"
    :confirm-text="props.confirmText ?? t('common.confirm')"
    :comp="props.comp"
    :render="props.render"
    :surface="props.surface"
    :surface-color="props.surfaceColor"
    :surface-opacity="props.surfaceOpacity"
  />
</template>
