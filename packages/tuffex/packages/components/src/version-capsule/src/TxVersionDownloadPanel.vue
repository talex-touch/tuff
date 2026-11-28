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
  <div class="tx-version-download-panel tx-vp">
    <div
      v-if="notice"
      class="tx-vd-n"
      :class="`tx-version-download-panel__notice--${noticeTone}`"
    >
      <div class="tx-vd-nh">
        <span class="tx-vd-ni" aria-hidden="true">
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
        <span class="tx-version-download-panel__notice-title tx-vd-nt">{{ notice.title }}</span>
      </div>
      <p v-if="notice.description" class="tx-vd-nd">
        {{ notice.description }}
      </p>
      <ul v-if="notice.points?.length" class="tx-version-download-panel__points tx-vd-pts">
        <li v-for="point in notice.points" :key="point">
          {{ point }}
        </li>
      </ul>
    </div>

    <div class="tx-vd-bs">
      <p v-if="buildsLabel" class="tx-vd-bl">
        {{ buildsLabel }}
      </p>

      <p v-if="!builds.length" class="tx-version-download-panel__empty tx-vd-em">
        {{ emptyText }}
      </p>

      <component
        :is="build.href ? 'a' : 'button'"
        v-for="build in builds"
        :key="build.id"
        class="tx-version-download-panel__build tx-vd-b"
        :class="{ 'is-recommended': build.id === highlightedId }"
        :href="build.href"
        :type="build.href ? undefined : 'button'"
        :download="build.href ? '' : undefined"
        @click="emit('select', build.id)"
      >
        <span class="tx-vd-bm">
          <span v-if="build.icon" class="tx-vd-bi" :class="build.icon" aria-hidden="true" />
          <span class="tx-vd-bt">
            <span class="tx-version-download-panel__build-name tx-vd-bn">{{ build.name }}</span>
            <span v-if="build.meta" class="tx-vd-bme">{{ build.meta }}</span>
          </span>
        </span>

        <span v-if="build.id === highlightedId" class="tx-version-download-panel__cta tx-vd-cta">
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
          class="tx-vd-bg"
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

    <div v-if="$slots.footer" class="tx-vp-ft">
      <slot name="footer" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-vd-n { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-bottom: 1px solid var(--_bd); background: var(--_fl2); }
.tx-version-download-panel__notice--warning { --tx-version-notice-tone: var(--_mu); }
.tx-version-download-panel__notice--success { --tx-version-notice-tone: var(--tx-color-success); }
.tx-vd-nh, .tx-vd-bm, .tx-vp-ft { display: flex; align-items: center; gap: 6px; }
.tx-vd-ni { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; color: var(--tx-version-notice-tone); svg { width: 14px; height: 14px; } }
.tx-vd-nt { color: var(--_fg); font-size: 12.5px; font-weight: 600; }
.tx-vd-nd { margin: 0; color: var(--_re); font-size: 12.5px; line-height: 1.5; }
.tx-vd-pts {
  display: flex; flex-direction: column; gap: 6px; margin: 2px 0 0; padding: 0; list-style: none;
  li {
    position: relative; padding-left: 14px; color: var(--_mu); font-size: 12px; line-height: 1.5;
    &::before { content: ''; position: absolute; top: 7px; left: 2px; width: 4px; height: 4px; border-radius: 999px; background: var(--tx-version-notice-tone); }
  }
}
.tx-vd-bs { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
.tx-vd-bl { margin: 2px 0; padding: 0 8px; color: var(--_pl); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.tx-vd-em { margin: 0; padding: 6px 8px 8px; color: var(--_mu); font-size: 12.5px; }
.tx-vd-b {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 7px;
  background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer;
  &:hover { background: var(--_fl); }
  &:focus-visible { outline: 2px solid var(--tx-version-panel-accent); outline-offset: -2px; }
  &.is-recommended { background: var(--_fl2); .tx-vd-bn, .tx-vd-bi { color: var(--_fg); } }
}
.tx-vd-bm { gap: 10px; min-width: 0; }
.tx-vd-bi { width: 16px; height: 16px; flex: none; color: var(--_mu); }
.tx-vd-bt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tx-vd-bn { color: var(--_re); font-size: 13px; font-weight: 600; }
.tx-vd-bme { color: var(--_pl); font-size: 11px; }
.tx-vd-bg { width: 14px; height: 14px; flex: none; color: var(--_pl); }
.tx-vd-cta {
  display: inline-flex; align-items: center; gap: 5px; flex: none; height: 26px; padding: 0 9px; border-radius: 7px;
  background: var(--_fg); color: var(--tx-bg-color); font-size: 11.5px; font-weight: 600;
  svg { width: 12px; height: 12px; }
}
.tx-vp-ft { padding: 12px 18px; border-top: 1px solid var(--tx-version-panel-border-color); background: var(--_fl2); font-size: 12px; justify-content: space-between; }
</style>
