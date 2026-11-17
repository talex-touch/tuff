<script lang="ts" setup>
import type { DialogMessageHtml, DialogSurfaceProps } from '@talex-touch/tuffex/dialog'
import type { Component, VNode, VNodeChild } from 'vue'
import { TxPopperDialog } from '@talex-touch/tuffex/dialog'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'TPopperDialog' })

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
  render?: () => VNodeChild
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
const resolvedRender = computed(() => props.render as (() => VNode) | undefined)
</script>

<template>
  <TxPopperDialog
    :close="props.close"
    :title="props.title"
    :message="props.message"
    :message-html="props.messageHtml"
    :confirm-text="props.confirmText ?? t('common.confirm')"
    :comp="props.comp"
    :render="resolvedRender"
    :surface="props.surface"
    :surface-color="props.surfaceColor"
    :surface-opacity="props.surfaceOpacity"
  />
</template>
