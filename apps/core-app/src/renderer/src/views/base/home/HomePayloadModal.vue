<script lang="ts" name="HomePayloadModal" setup>
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxCodeBlock } from '@talex-touch/tuffex/stream-markdown'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { homeMessageContextKey } from './composables/home-message-context'

/**
 * The dev payload inspector: one dialog for whichever widget's toggle was clicked, the raw call
 * as highlighted JSON with the code block's own copy button. The toggle lives in the message row
 * and writes `payloadFor`; the dialog reads it from the same page context.
 */
const { t } = useI18n()
const { payloadFor, payloadJson } = inject(homeMessageContextKey)!
</script>

<template>
  <TxModal
    :model-value="payloadFor !== null"
    :title="`${payloadFor?.name ?? ''} · ${t('home.toolPayload')}`"
    :close-label="t('common.close')"
    width="640px"
    @update:model-value="payloadFor = null"
  >
    <TxCodeBlock
      class="HomePayloadModal-Code"
      lang="json"
      :code="payloadJson"
      :closed="true"
      :copy-label="t('home.copy')"
      :copied-label="t('home.copied')"
    />
  </TxModal>
</template>

<style lang="scss" scoped>
.HomePayloadModal-Code {
  max-height: 420px;
  overflow: auto;
}
</style>
