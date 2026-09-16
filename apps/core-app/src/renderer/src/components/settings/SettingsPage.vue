<script lang="ts" name="SettingsPage" setup>
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'

/**
 * The one shell every settings surface renders inside, in exactly two shapes.
 *
 * `column` is the artboard's reading page: a 940px centred column under a large title, scrolling
 * against pinned edge fades. `split` is the full-canvas master/detail: a searchable aside against
 * a detail pane, both reaching the window edges with no page title at all.
 *
 * They are a closed set on purpose. The four flags this replaced (`fill`, `flush`, `edgeBlur`,
 * `integratedDragRegion`) only ever appeared together, spelling `split` four times over at four
 * call sites — each of which then mounted its own `TuffAsideTemplate` with the same three props
 * and wrapped it in the same hand-written `role="main"` box.
 */
const props = withDefaults(
  defineProps<{
    layout?: 'column' | 'split'
    /** Column layout. Omit when the page has no heading of its own. */
    title?: string
    /**
     * Renders a way back to the page that links here, above the title. Sub-pages are siblings of
     * their category route, so the sidebar shows no trail into them. Column layout only.
     */
    backTo?: string
    backLabel?: string
    /** Split layout: names the master/detail region for assistive technology. */
    ariaLabel?: string
    /** Split layout: the aside's search field. */
    search?: string
    searchPlaceholder?: string
    searchId?: string
    searchable?: boolean
    clearLabel?: string
    mainAriaLive?: 'off' | 'polite' | 'assertive'
  }>(),
  {
    layout: 'column' as const,
    title: undefined,
    backTo: undefined,
    backLabel: undefined,
    ariaLabel: undefined,
    search: '',
    searchPlaceholder: '',
    searchId: undefined,
    searchable: true,
    clearLabel: '',
    mainAriaLive: 'polite' as const
  }
)

const emit = defineEmits<{
  (event: 'update:search', value: string): void
  (event: 'search', value: string): void
  (event: 'clear'): void
}>()

const router = useRouter()

const isSplit = computed(() => props.layout === 'split')

function goBack(): void {
  if (props.backTo) void router.push(props.backTo)
}
</script>

<template>
  <div class="SettingsPage" :class="`is-${layout}`">
    <!--
      Column pages reserve the macOS title-bar strip wholesale. Split pages cannot: their aside
      header and detail chrome live in that strip, so `TuffAsideTemplate` marks its own drag
      surfaces around the live controls instead.
    -->
    <div v-if="!isSplit" class="SettingsPage-DragRegion" aria-hidden="true" />

    <!--
      The pinned scroll-edge fades belong to the reading column. Split panes reach the window
      edges, where a band of haze would sit over a pane border rather than over scrolling text.
    -->
    <template v-if="!isSplit">
      <TxGradualBlur
        exponential
        :div-count="10"
        position="top"
        height="40px"
        :strength="1.4"
        :opacity="0.9"
        :z-index="20"
      />
      <TxGradualBlur
        exponential
        :div-count="10"
        position="bottom"
        height="40px"
        :strength="1.4"
        :opacity="0.9"
        :z-index="20"
      />
    </template>

    <section v-if="isSplit" class="SettingsPage-Split" role="main" :aria-label="ariaLabel">
      <TuffAsideTemplate
        :model-value="search"
        :search-placeholder="searchPlaceholder"
        :search-id="searchId ?? 'settings-page-search'"
        :searchable="searchable"
        :clear-label="clearLabel"
        :main-aria-live="mainAriaLive"
        :main-edge-blur="false"
        window-drag-region
        @update:model-value="emit('update:search', $event)"
        @search="emit('search', $event)"
        @clear="emit('clear')"
      >
        <template v-if="$slots.filter" #filter>
          <slot name="filter" />
        </template>

        <slot name="aside" />

        <template v-if="$slots['aside-footer']" #footer>
          <slot name="aside-footer" />
        </template>

        <template #main>
          <slot name="detail" />
        </template>
      </TuffAsideTemplate>

      <!-- Dialogs, drawers and file inputs the page owns; outside the panes, over both. -->
      <slot name="overlay" />
    </section>

    <div v-else class="SettingsPage-Scroll">
      <div class="SettingsPage-Column">
        <button v-if="backTo && backLabel" class="SettingsPage-Back" type="button" @click="goBack">
          <span class="SettingsPage-BackIcon i-ri-arrow-left-s-line" />
          <span>{{ backLabel }}</span>
        </button>

        <h1 v-if="title" class="SettingsPage-Title">
          {{ title }}
        </h1>

        <slot />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SettingsPage {
  // Anchors the two blur bands, which position themselves against the nearest positioned
  // ancestor. The scroll moved into a child so they stay pinned instead of scrolling away.
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.SettingsPage-DragRegion {
  z-index: 19;
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 44px;
  -webkit-app-region: drag;
}

.SettingsPage-Split {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.SettingsPage-Split > :deep(.TuffAsideTemplate) {
  flex: 1 1 auto;
  min-height: 0;
}

.SettingsPage-Scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.SettingsPage-Column {
  display: flex;
  flex-direction: column;
  // Artboard `iqbKR` body: gap 20, padding [4,40,36,40]; 940 content inside a 1020 main
  // column, expressed as a max-width so wider windows do not stretch the rows.
  gap: 20px;
  max-width: 940px;
  margin: 0 auto;
  /**
   * 56 = the artboard's 52px TopBar plus its 4px body inset.
   *
   * The implemented shell has no top bar — the chrome moved into the sidebar — so that height
   * had nowhere to go and the title ended up against the window edge. Restating it here also
   * keeps the title clear of the macOS hidden-title-bar strip, which stays window-draggable no
   * matter what the renderer marks `no-drag`.
   */
  padding: 56px 40px 36px;
  box-sizing: border-box;
}

.SettingsPage-Back {
  display: flex;
  gap: 2px;
  align-items: center;
  align-self: flex-start;
  // Pulled up into the title's gap: this is a trail marker, not a row of its own.
  margin-bottom: -12px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-secondary);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.SettingsPage-BackIcon {
  width: 14px;
  height: 14px;
  font-size: 14px;
}

.SettingsPage-Title {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-h1);
  font-weight: 600;
  // Chrome, like the nav item that led here — and it sits in the window's drag strip, where a
  // stray selection is the usual outcome of trying to move the window.
  user-select: none;
}
</style>
