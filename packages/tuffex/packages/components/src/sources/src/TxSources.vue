<script setup lang="ts">
import type { AiSourceItem } from '../../ai-elements/src/types'
import { computed, ref, useId } from 'vue'

defineOptions({ name: 'TxSources' })

const props = withDefaults(
  defineProps<{
    sources: AiSourceItem[]
    /** Builds the collapsed header text. @default (n) => `Used ${n} source(s)` */
    labelFormatter?: (count: number) => string
    defaultOpen?: boolean
  }>(),
  {
    defaultOpen: false,
  },
)

const emit = defineEmits<{
  /** Opening a source is the host's call — links never navigate on their own. */
  open: [source: AiSourceItem]
}>()

const open = ref(props.defaultOpen)
const bodyId = useId()

const headerLabel = computed(() => {
  const count = props.sources.length
  const format = props.labelFormatter ?? ((n: number) => `Used ${n} source${n === 1 ? '' : 's'}`)
  return format(count)
})

const failedIcons = ref(new Set<string>())

function markFailed(id: string): void {
  failedIcons.value = new Set(failedIcons.value).add(id)
}

function domainOf(source: AiSourceItem): string {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '')
  }
  catch {
    return source.url
  }
}

function onOpen(event: MouseEvent, source: AiSourceItem): void {
  event.preventDefault()
  emit('open', source)
}
</script>

<template>
  <div class="tx-sources">
    <button
      type="button"
      class="tx-sources__header"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <span class="tx-sources__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 12h17M12 3.5c2.6 2.4 4 5.3 4 8.5s-1.4 6.1-4 8.5c-2.6-2.4-4-5.3-4-8.5s1.4-6.1 4-8.5Z" />
        </svg>
      </span>
      <span class="tx-sources__label">{{ headerLabel }}</span>
      <span class="tx-sources__chevron" :class="{ 'is-open': open }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>

    <div :id="bodyId" class="tx-sources__collapse" :class="{ 'is-open': open }">
      <ol class="tx-sources__list">
        <li v-for="(source, index) in sources" :key="source.id" class="tx-sources__item">
          <a
            class="tx-sources__link"
            :href="source.url"
            @click="onOpen($event, source)"
          >
            <span class="tx-sources__ordinal">{{ index + 1 }}</span>
            <img
              v-if="source.favicon && !failedIcons.has(source.id)"
              class="tx-sources__favicon"
              :src="source.favicon"
              alt=""
              aria-hidden="true"
              @error="markFailed(source.id)"
            >
            <span class="tx-sources__title">{{ source.title || domainOf(source) }}</span>
            <span class="tx-sources__domain">{{ domainOf(source) }}</span>
          </a>
        </li>
      </ol>
    </div>
  </div>
</template>

<style lang="scss">
.tx-sources {
  font-size: 12.5px;

  .tx-sources__header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border: none;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font: inherit;
    cursor: pointer;
  }

  .tx-sources__icon {
    display: inline-flex;
  }

  .tx-sources__chevron {
    display: inline-flex;
    transition: transform 0.18s ease;

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .tx-sources__collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s ease;

    &.is-open {
      grid-template-rows: 1fr;
    }
  }

  .tx-sources__list {
    min-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tx-sources__item {
    margin-top: 6px;
  }

  .tx-sources__link {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 10px;
    color: var(--tx-text-color-primary, #111827);
    text-decoration: none;
    transition: border-color 0.15s ease, background-color 0.15s ease;

    &:hover {
      border-color: var(--tx-color-primary, #409eff);
      background: color-mix(in srgb, var(--tx-color-primary, #409eff) 4%, transparent);
    }
  }

  .tx-sources__ordinal {
    flex: none;
    min-width: 18px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .tx-sources__favicon {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }

  .tx-sources__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-sources__domain {
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-sources .tx-sources__collapse,
  .tx-sources .tx-sources__chevron {
    transition: none;
  }
}
</style>
