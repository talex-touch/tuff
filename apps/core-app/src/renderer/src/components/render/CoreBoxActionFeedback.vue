<script setup lang="ts">
import type { CoreBoxFooterFeedback } from '~/modules/box/meta-actions/footer-feedback'
import { TxStatusHint } from '@talex-touch/tuffex/status-hint'
import { computed } from 'vue'

/**
 * What an action did ("已复制", "固定失败"), drawn as TuffEx's status hint: over the footer's left
 * half while the footer is on screen, and header-sized in the header's status slot while it is not.
 * CoreBox decides which.
 *
 * Visual only. CoreBox announces the message from one always-mounted live region on its wrapper, so
 * the hint carries none (`live=false`) and moving between the footer and the header never
 * announces it twice. Hosts keep it mounted while messages change: the next message's words morph
 * out of the last one's, and its id replays the emphasis when the same words come again.
 */
defineOptions({ name: 'CoreBoxActionFeedback' })

const props = defineProps<{
  feedback: CoreBoxFooterFeedback
  placement: 'footer' | 'header'
  /** CoreBox's motion gate (`shouldAnimate()`). False lands the hint in place, with no morph. */
  animated: boolean
}>()

const isError = computed(() => props.feedback.tone === 'error')
</script>

<template>
  <TxStatusHint
    class="CoreBoxActionFeedback"
    :class="[`is-${placement}`, isError ? 'is-error' : 'is-success']"
    :text="feedback.message"
    :tone="isError ? 'danger' : 'success'"
    :size="placement === 'footer' ? 'md' : 'sm'"
    :pulse-key="feedback.id"
    :animated="animated"
    :live="false"
  >
    <!-- The glyphs CoreBox pairs with the words, so colour alone never carries the outcome. -->
    <template #icon>
      <i
        class="CoreBoxActionFeedback-Icon"
        :class="isError ? 'i-ri-error-warning-line' : 'i-ri-checkbox-circle-line'"
      />
    </template>
  </TxStatusHint>
</template>

<style scoped lang="scss">
// Over the footer's left half, the full height of the bar, so the wash rises out of the footer's
// own edge. The footer (`.CoreBoxFooter-Sticky`) is positioned, so it is the containing block. Out
// of the footer's flow, the hints on the right stay where they are; and it takes no pointer, since
// nothing it covers is a control and a leaving hint must not catch a click.
.CoreBoxActionFeedback.is-footer {
  --tx-status-hint-radius: 0;
  // The footer's `px-3`: the glyph lines up with the item icon it stands in for.
  --tx-status-hint-pad-x: 12px;

  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: 50%;
  pointer-events: none;
}

// First in the header's Configure row: it gives up width before the buttons beside it do.
.CoreBoxActionFeedback.is-header {
  flex: 0 1 auto;
  min-width: 0;
}
</style>
