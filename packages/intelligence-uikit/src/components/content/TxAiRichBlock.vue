<script setup lang="ts">
import type { TxAiRichBlockProps, TxAiToolStatus } from '../../types'
import type { TxAutoSizerInstance } from '@talex-touch/tuffex/auto-sizer'
import { computed, ref, watch } from 'vue'
import { TxAutoSizer } from '@talex-touch/tuffex/auto-sizer'
import { TxIcon } from '@talex-touch/tuffex/icon'
import TxAiLoadingHint from '../foundation/TxAiLoadingHint.vue'
import TxAiStreamText from '../foundation/TxAiStreamText.vue'
import TxAiCodeBlock from './TxAiCodeBlock.vue'
import TxAiMarkdown from './TxAiMarkdown.vue'

defineOptions({
  name: 'TxAiRichBlock',
})

const props = defineProps<TxAiRichBlockProps>()

const expanded = ref(true)
const thoughtSizerRef = ref<TxAutoSizerInstance | null>(null)
let expandSeq = 0
const thoughtKind = computed(() => {
  const kind = props.block.meta?.kind
  if (kind === 'planning' || kind === 'thinking' || kind === 'thought')
    return kind
  return ''
})
const isThoughtBlock = computed(() => Boolean(thoughtKind.value))
const thoughtTitle = computed(() => {
  if (thoughtKind.value === 'planning')
    return '规划中'
  if (thoughtKind.value === 'thinking')
    return '思考中'
  return '思考内容'
})
const thoughtText = computed(() => String(props.block.content ?? props.block.value ?? ''))
const isThoughtRunning = computed(() => props.block.status === 'running' || props.block.status === 'waiting' || props.block.status === 'streaming')
// Pass the block's own status through. Coercing everything that was not `error` or
// `cancelled` to `running` made a finished tool call spin forever.
const toolStatus = computed<TxAiToolStatus>(() => {
  const status = props.block.status
  if (status === 'pending' || status === 'running' || status === 'success' || status === 'error' || status === 'cancelled')
    return status
  if (status === 'waiting' || status === 'streaming')
    return 'running'
  if (status === 'done')
    return 'success'
  return 'running'
})

async function setThoughtExpanded(next: boolean) {
  const seq = ++expandSeq

  if (expanded.value === next) {
    await thoughtSizerRef.value?.refresh()
    return
  }

  const sizer = thoughtSizerRef.value
  if (!sizer) {
    expanded.value = next
    return
  }

  await sizer.action(() => {
    if (seq === expandSeq)
      expanded.value = next
  }, {
    target: 'outer',
    watch: ['rect', 'box', 'scroll'],
  })
}

function toggleThoughtExpanded() {
  void setThoughtExpanded(!expanded.value)
}

watch(
  [isThoughtBlock, isThoughtRunning],
  ([isThought, isRunning]) => {
    if (!isThought)
      return
    void setThoughtExpanded(isRunning)
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="tx-ai-rich-block"
    :class="[
      `tx-ai-rich-block--${block.type}`,
      typeof block.meta?.kind === 'string' ? `tx-ai-rich-block--${block.meta.kind}` : '',
    ]"
  >
    <slot :block="block">
      <div
        v-if="isThoughtBlock"
        class="tx-ai-rich-block__thought"
        :class="{ 'is-expanded': expanded, 'is-running': isThoughtRunning }"
      >
        <button
          type="button"
          class="tx-ai-rich-block__thought-header"
          :aria-expanded="expanded"
          @click="toggleThoughtExpanded"
        >
          <span class="tx-ai-rich-block__thought-title">{{ thoughtTitle }}</span>
          <TxIcon name="chevron-down" class="tx-ai-rich-block__thought-chevron" :size="16" />
        </button>
        <TxAutoSizer
          ref="thoughtSizerRef"
          :width="false"
          height
          :duration-ms="240"
          easing="cubic-bezier(0.2, 0, 0, 1)"
          observe-target="both"
          outer-class="tx-ai-rich-block__thought-sizer"
          inner-class="tx-ai-rich-block__thought-sizer-inner"
        >
          <div
            v-show="expanded"
            class="tx-ai-rich-block__thought-content"
            :class="{ 'is-running': isThoughtRunning }"
          >
            <TxAiStreamText
              v-if="isThoughtRunning"
              :text="thoughtText"
              motion="fade"
              streaming
              :stagger="24"
              :cursor="false"
            />
            <span v-else class="tx-ai-rich-block__thought-plain">
              {{ thoughtText }}
            </span>
          </div>
        </TxAutoSizer>
      </div>

      <TxAiMarkdown
        v-else-if="block.type === 'markdown'"
        :content="String(block.content ?? block.value ?? '')"
        :streaming="block.status === 'running' || block.status === 'streaming'"
      />

      <p v-else-if="block.type === 'text'" class="tx-ai-rich-block__text">
        {{ String(block.content ?? block.value ?? '') }}
      </p>

      <TxAiCodeBlock
        v-else-if="block.type === 'code'"
        :code="String(block.content ?? block.value ?? '')"
        :language="typeof block.meta?.language === 'string' ? block.meta.language : ''"
      />

      <!-- Nothing listens for a click on a block image: the conversation's `imageClick`
           only fires for message attachments. A `<button>` here was a focusable control
           that did nothing, so the block is plain content until a viewer is wired. -->
      <figure v-else-if="block.type === 'image'" class="tx-ai-rich-block__image">
        <img :src="String(block.content ?? block.value ?? '')" alt="" loading="lazy">
      </figure>

      <TxAiLoadingHint
        v-else-if="block.type === 'tool'"
        :label="block.name || 'Tool call'"
        :description="String(block.content ?? '')"
        :status="toolStatus"
      />

      <div v-else-if="block.type === 'error'" class="tx-ai-rich-block__error" role="alert">
        {{ String(block.content ?? block.value ?? 'Something went wrong') }}
      </div>

      <div v-else class="tx-ai-rich-block__card">
        <slot name="card" :block="block">
          {{ String(block.content ?? block.name ?? block.type) }}
        </slot>
      </div>
    </slot>
  </div>
</template>
