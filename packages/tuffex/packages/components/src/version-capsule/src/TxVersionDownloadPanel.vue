<script lang="ts" setup>
import type { TxVersionDownloadPanelProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxVersionDownloadPanel' })

const props = withDefaults(defineProps<TxVersionDownloadPanelProps>(), {
  notice: undefined,
  builds: () => [],
  buildsLabel: 'Choose a build',
  downloadLabel: 'Download',
  emptyText: 'No builds published yet.',
})

const emit = defineEmits<{
  select: [id: string]
}>()

const noticeTone = computed(() => props.notice?.tone ?? 'warning')

/**
 * Only the first recommended build gets the labelled button — a panel with two
 * primary actions reads as a choice the visitor has to make, which is exactly
 * what the platform detection is supposed to spare them.
 */
const highlightedId = computed(() => props.builds.find(build => build.recommended)?.id)
</script>

<template>
  <div class="tx-version-download-panel">
    <div
      v-if="notice"
      class="tx-version-download-panel__notice"
      :class="`tx-version-download-panel__notice--${noticeTone}`"
    >
      <div class="tx-version-download-panel__notice-head">
        <span class="tx-version-download-panel__notice-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <template v-if="noticeTone === 'success'">
              <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
              <path d="m9 12 2 2 4-4" />
            </template>
            <template v-else>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </template>
          </svg>
        </span>
        <span class="tx-version-download-panel__notice-title">{{ notice.title }}</span>
      </div>
      <p v-if="notice.description" class="tx-version-download-panel__notice-desc">
        {{ notice.description }}
      </p>
      <ul v-if="notice.points?.length" class="tx-version-download-panel__points">
        <li v-for="point in notice.points" :key="point">
          {{ point }}
        </li>
      </ul>
    </div>

    <div class="tx-version-download-panel__builds">
      <p class="tx-version-download-panel__builds-label">
        {{ buildsLabel }}
      </p>

      <p v-if="!builds.length" class="tx-version-download-panel__empty">
        {{ emptyText }}
      </p>

      <component
        :is="build.href ? 'a' : 'button'"
        v-for="build in builds"
        :key="build.id"
        class="tx-version-download-panel__build"
        :class="{ 'is-recommended': build.id === highlightedId }"
        :href="build.href"
        :type="build.href ? undefined : 'button'"
        :download="build.href ? '' : undefined"
        @click="emit('select', build.id)"
      >
        <span class="tx-version-download-panel__build-main">
          <span v-if="build.icon" class="tx-version-download-panel__build-icon" :class="build.icon" aria-hidden="true" />
          <span class="tx-version-download-panel__build-text">
            <span class="tx-version-download-panel__build-name">{{ build.name }}</span>
            <span v-if="build.meta" class="tx-version-download-panel__build-meta">{{ build.meta }}</span>
          </span>
        </span>

        <span v-if="build.id === highlightedId" class="tx-version-download-panel__cta">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          {{ downloadLabel }}
        </span>
        <svg
          v-else
          class="tx-version-download-panel__build-glyph"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </component>
    </div>

    <div v-if="$slots.footer" class="tx-version-download-panel__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-version-download-panel {
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

.tx-version-download-panel__notice {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--tx-version-panel-border-color);
}

.tx-version-download-panel__notice--warning {
  --tx-version-notice-tone: var(--tx-color-warning);

  background: color-mix(in srgb, var(--tx-color-warning) 8%, transparent);
}

.tx-version-download-panel__notice--success {
  --tx-version-notice-tone: var(--tx-color-success);

  background: color-mix(in srgb, var(--tx-color-success) 8%, transparent);
}

.tx-version-download-panel__notice-head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.tx-version-download-panel__notice-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-version-notice-tone) 22%, transparent);
  color: var(--tx-version-notice-tone);

  svg {
    width: 14px;
    height: 14px;
  }
}

.tx-version-download-panel__notice-title {
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 680;
}

.tx-version-download-panel__notice-desc {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 12.5px;
  line-height: 1.5;
}

.tx-version-download-panel__points {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 14px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
    line-height: 1.5;
  }

  li::before {
    content: '';
    position: absolute;
    top: 7px;
    left: 2px;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--tx-version-notice-tone);
  }
}

.tx-version-download-panel__builds {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
}

.tx-version-download-panel__builds-label {
  margin: 0 0 2px;
  padding: 0 10px;
  color: var(--tx-text-color-placeholder);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.tx-version-download-panel__empty {
  margin: 0;
  padding: 6px 10px 10px;
  color: var(--tx-text-color-secondary);
  font-size: 12.5px;
}

.tx-version-download-panel__build {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.tx-version-download-panel__build:hover {
  background: var(--tx-fill-color-light);
}

.tx-version-download-panel__build:focus-visible {
  outline: 2px solid var(--tx-version-panel-accent);
  outline-offset: -2px;
}

.tx-version-download-panel__build.is-recommended {
  background: var(--tx-fill-color);
}

.tx-version-download-panel__build-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tx-version-download-panel__build-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--tx-text-color-secondary);
}

.tx-version-download-panel__build-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tx-version-download-panel__build-name {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  font-weight: 600;
}

.tx-version-download-panel__build.is-recommended .tx-version-download-panel__build-name,
.tx-version-download-panel__build.is-recommended .tx-version-download-panel__build-icon {
  color: var(--tx-text-color-primary);
}

.tx-version-download-panel__build-meta {
  color: var(--tx-text-color-placeholder);
  font-size: 11px;
}

.tx-version-download-panel__build-glyph {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--tx-text-color-placeholder);
}

.tx-version-download-panel__cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 6px 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-version-panel-accent) 20%, transparent);
  color: var(--tx-version-panel-accent);
  font-size: 11.5px;
  font-weight: 700;

  svg {
    width: 12px;
    height: 12px;
  }
}

.tx-version-download-panel__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  border-top: 1px solid var(--tx-version-panel-border-color);
  background: var(--tx-fill-color-lighter);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .tx-version-download-panel__build {
    transition: none;
  }
}
</style>
