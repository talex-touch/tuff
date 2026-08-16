<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { AiSourceItem } from '../../ai-elements/src/types'
import type { InlineCitationProps } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxInlineCitation' })

const props = withDefaults(defineProps<InlineCitationProps>(), {
  appear: true,
})

const emit = defineEmits<{
  open: [source: AiSourceItem]
}>()

defineSlots<{
  /** Replaces the chip text. */
  default?: (props: { source: AiSourceItem, label: string }) => unknown
  /** Replaces the leading favicon. */
  icon?: (props: { source: AiSourceItem }) => unknown
}>()

const iconFailed = ref(false)

const domain = computed(() => {
  try {
    return new URL(props.source.url).hostname.replace(/^www\./, '')
  }
  catch {
    return props.source.url
  }
})

const label = computed(() => props.label ?? props.source.title ?? domain.value)

function onOpen(event: MouseEvent): void {
  // The href stays real so the chip reads as a link and offers a target on
  // hover, but navigation belongs to the host (an Electron renderer must not
  // walk away from the app).
  event.preventDefault()
  emit('open', props.source)
}
</script>

<template>
  <a
    class="tx-bui-inline-citation"
    :class="{ 'is-appear': appear }"
    :href="source.url"
    @click="onOpen"
  >
    <slot name="icon" :source="source">
      <img
        v-if="source.favicon && !iconFailed"
        class="tx-bui-inline-citation__avatar"
        :src="source.favicon"
        alt=""
        aria-hidden="true"
        @error="iconFailed = true"
      >
    </slot>
    <span class="tx-bui-inline-citation__label">
      <slot :source="source" :label="label">{{ label }}</slot>
    </span>
  </a>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;

.tx-bui-inline-citation {
  // Hairline ring around the favicon. Not a token: upstream punches it with a
  // fixed neutral wash rather than the palette line colour.
  --tx-bui-inline-citation-avatar-ring: #1018281a;

  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 18px;
  padding: 0 3px;
  margin-right: 4px;
  border-radius: 5px;
  background: var(--tx-bui-inset, #f7f8f9);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  color: var(--tx-bui-ink-2, #62656b);
  font-family: var(--tx-bui-font-mono, ui-monospace, "SF Mono", monospace);
  font-size: 10.5px;
  text-decoration: none;
  // Sits in a text run: nudged up a pixel so the cap height lines up with the
  // surrounding prose rather than the baseline.
  vertical-align: middle;
  transform: translateY(-1px);
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--tx-bui-hover, #f4f5f6);
    color: var(--tx-bui-ink, #1f2124);
  }

  &.is-appear {
    @include bui-pop-in(250ms);
  }

  .tx-bui-inline-citation__avatar {
    display: block;
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--tx-bui-inline-citation-avatar-ring, #1018281a);
  }

  .tx-bui-inline-citation__label {
    white-space: nowrap;
  }
}

[data-theme='dark'] .tx-bui-inline-citation,
.dark .tx-bui-inline-citation {
  --tx-bui-inline-citation-avatar-ring: #ffffff1f;
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-inline-citation {
    transition: none;
  }
}
</style>
