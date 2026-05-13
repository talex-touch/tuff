<script setup lang="ts">
import type { TxAiRichBlockProps } from '../../types'
import type { TxAutoSizerInstance } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'
import { TxAutoSizer, TxIcon } from '@talex-touch/tuffex'
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
              wrap
              :duration="280"
              :stagger="14"
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

      <button v-else-if="block.type === 'image'" type="button" class="tx-ai-rich-block__image">
        <img :src="String(block.content ?? block.value ?? '')" alt="" loading="lazy">
      </button>

      <TxAiLoadingHint
        v-else-if="block.type === 'tool'"
        :label="block.name || 'Tool call'"
        :description="String(block.content ?? '')"
        :status="block.status === 'error' ? 'error' : block.status === 'cancelled' ? 'cancelled' : 'running'"
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
