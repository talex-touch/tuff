<script lang="ts" setup>
import type { TxVersionHistoryEntry, TxVersionHistoryPanelProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxVersionHistoryPanel' })

const props = withDefaults(defineProps<TxVersionHistoryPanelProps>(), {
  title: 'Version history',
  latest: undefined,
  entries: () => [],
  latestLabel: 'LATEST',
  countLabel: undefined,
  notesLabel: 'What\'s new',
  emptyText: 'No releases published yet.',
})

const emit = defineEmits<{
  select: [entry: TxVersionHistoryEntry]
}>()

const isEmpty = computed(() => !props.latest && !props.entries.length)

function toneClass(entry: TxVersionHistoryEntry) {
  return `tx-version-history-panel--${entry.tone ?? 'preview'}`
}
</script>

<template>
  <div class="tx-version-history-panel">
    <header class="tx-version-history-panel__head">
      <span class="tx-version-history-panel__title">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
        {{ title }}
      </span>
      <span v-if="countLabel" class="tx-version-history-panel__count">{{ countLabel }}</span>
    </header>

    <div class="tx-version-history-panel__body">
      <p v-if="isEmpty" class="tx-version-history-panel__empty">
        {{ emptyText }}
      </p>

      <component
        :is="latest.href ? 'a' : 'div'"
        v-if="latest"
        class="tx-version-history-panel__latest"
        :class="toneClass(latest)"
        :href="latest.href"
        @click="emit('select', latest)"
      >
        <div class="tx-version-history-panel__latest-top">
          <span class="tx-version-history-panel__latest-ident">
            <span v-if="latest.channel" class="tx-version-history-panel__chip">{{ latest.channel }}</span>
            <span class="tx-version-history-panel__latest-tag">{{ latest.tag }}</span>
          </span>
          <span class="tx-version-history-panel__latest-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
            </svg>
            {{ latestLabel }}
          </span>
        </div>
        <p v-if="latest.note" class="tx-version-history-panel__latest-note">
          {{ latest.note }}
        </p>
        <div class="tx-version-history-panel__latest-foot">
          <span v-if="latest.date" class="tx-version-history-panel__date">{{ latest.date }}</span>
          <span class="tx-version-history-panel__notes-cta">
            {{ notesLabel }}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </component>

      <component
        :is="entry.href ? 'a' : 'div'"
        v-for="entry in entries"
        :key="entry.id"
        class="tx-version-history-panel__row"
        :class="toneClass(entry)"
        :href="entry.href"
        @click="emit('select', entry)"
      >
        <span class="tx-version-history-panel__row-main">
          <span class="tx-version-history-panel__row-dot" aria-hidden="true" />
          <span class="tx-version-history-panel__row-tag">{{ entry.tag }}</span>
        </span>
        <span class="tx-version-history-panel__row-meta">
          <span v-if="entry.channel" class="tx-version-history-panel__row-channel">{{ entry.channel }}</span>
          <span v-if="entry.date" class="tx-version-history-panel__date">{{ entry.date }}</span>
        </span>
      </component>
    </div>

    <div v-if="$slots.footer" class="tx-version-history-panel__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-version-history-panel {
  --tx-version-panel-bg: var(--tx-bg-color-overlay);
  --tx-version-panel-border-color: var(--tx-border-color);
  --tx-version-panel-radius: 16px;
  --tx-version-panel-accent: var(--tx-color-primary);

  display: flex;
  flex-direction: column;
  border: 1px solid var(--tx-version-panel-border-color);
  border-radius: var(--tx-version-panel-radius);
  background: var(--tx-version-panel-bg);
  box-shadow: var(--tx-box-shadow-dark, 0 24px 60px rgb(0 0 0 / 40%));
  overflow: hidden;
}

/* Tone is resolved per row so a stable release stays readable inside a preview list. */
.tx-version-history-panel--stable {
  --tx-version-entry-tone: var(--tx-color-success);
}

.tx-version-history-panel--preview {
  --tx-version-entry-tone: var(--tx-color-primary);
}

.tx-version-history-panel--nightly {
  --tx-version-entry-tone: var(--tx-color-warning);
}

.tx-version-history-panel--neutral {
  --tx-version-entry-tone: var(--tx-text-color-secondary);
}

.tx-version-history-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--tx-version-panel-border-color);
}

.tx-version-history-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--tx-text-color-primary);
  font-size: 13.5px;
  font-weight: 680;

  svg {
    width: 14px;
    height: 14px;
    color: var(--tx-version-panel-accent);
  }
}

.tx-version-history-panel__count {
  color: var(--tx-text-color-placeholder);
  font-size: 11.5px;
}

.tx-version-history-panel__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.tx-version-history-panel__empty {
  margin: 0;
  padding: 4px 10px 8px;
  color: var(--tx-text-color-secondary);
  font-size: 12.5px;
}

.tx-version-history-panel__latest {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-version-entry-tone) 24%, transparent);
  border-radius: 12px;
  background: var(--tx-fill-color);
  color: inherit;
  text-decoration: none;
}

.tx-version-history-panel__latest-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-version-history-panel__latest-ident {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tx-version-history-panel__chip {
  flex: none;
  padding: 3px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tx-version-entry-tone) 20%, transparent);
  color: var(--tx-version-entry-tone);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tx-version-history-panel__latest-tag {
  color: var(--tx-text-color-primary);
  font-size: 13.5px;
  font-weight: 680;
}

.tx-version-history-panel__latest-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  color: var(--tx-color-warning);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;

  svg {
    width: 10px;
    height: 10px;
  }
}

.tx-version-history-panel__latest-note {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.tx-version-history-panel__latest-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tx-version-history-panel__notes-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--tx-version-panel-accent);
  font-size: 11.5px;
  font-weight: 640;

  svg {
    width: 12px;
    height: 12px;
  }
}

.tx-version-history-panel__date {
  color: var(--tx-text-color-placeholder);
  font-size: 11.5px;
}

.tx-version-history-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  transition: background-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-history-panel__row:hover {
  background: var(--tx-fill-color-light);
}

.tx-version-history-panel__row:focus-visible {
  outline: 2px solid var(--tx-version-panel-accent);
  outline-offset: -2px;
}

.tx-version-history-panel__row-main {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.tx-version-history-panel__row-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 999px;
  background: var(--tx-version-entry-tone);
}

.tx-version-history-panel__row-tag {
  color: var(--tx-text-color-regular);
  font-size: 12.5px;
  font-weight: 600;
}

.tx-version-history-panel__row-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.tx-version-history-panel__row-channel {
  color: var(--tx-version-entry-tone);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tx-version-history-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 12px 18px;
  border-top: 1px solid var(--tx-version-panel-border-color);
  background: var(--tx-fill-color-lighter);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .tx-version-history-panel__row {
    transition: none;
  }
}
</style>
