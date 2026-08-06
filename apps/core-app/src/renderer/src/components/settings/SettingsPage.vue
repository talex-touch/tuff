<script lang="ts" name="SettingsPage" setup>
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    /**
     * Renders a way back to the page that links here, above the title. Sub-pages are siblings of
     * their category route, so the sidebar shows no trail into them.
     */
    backTo?: string
    backLabel?: string
    /**
     * Hands the column's height to the content instead of letting it grow and scroll. For pages
     * that own their own scrolling — a master/detail split, say, which needs a definite height
     * to size its two panes against.
     */
    fill?: boolean
  }>(),
  { backTo: undefined, backLabel: undefined, fill: false }
)

const router = useRouter()

function goBack(): void {
  if (props.backTo) void router.push(props.backTo)
}
</script>

<template>
  <div class="SettingsPage">
    <!--
      The scroll-edge fade every other view inherits from `ViewTemplate`. The v2 settings shell
      owns its own column and bypasses that wrapper, which silently dropped the pair — so it is
      restated here with the same parameters, and both surfaces keep fading identically.
    -->
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

    <div class="SettingsPage-Scroll" :class="{ 'is-fill': fill }">
      <div class="SettingsPage-Column" :class="{ 'is-fill': fill }">
        <button v-if="backTo && backLabel" class="SettingsPage-Back" type="button" @click="goBack">
          <span class="SettingsPage-BackIcon i-ri-arrow-left-s-line" />
          <span>{{ backLabel }}</span>
        </button>

        <h1 class="SettingsPage-Title">
          {{ title }}
        </h1>

        <div v-if="fill" class="SettingsPage-Body">
          <slot />
        </div>
        <slot v-else />
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

.SettingsPage-Scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;

  // The content scrolls itself in fill mode; leaving the outer scroll on would let a pane's
  // overflow push the column instead of scrolling inside it.
  &.is-fill {
    overflow: hidden;
  }
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

  &.is-fill {
    height: 100%;
    min-height: 0;
  }
}

/**
 * `TuffGroupBlock` carries its own bottom margin for the many pages that stack blocks in a
 * parent with no `gap` of its own. Here the column's `gap` already sets the rhythm, so the two
 * would add up and push sections ~11px past the artboard's 20.
 *
 * Direct children only: a block nested inside a page's own sub-layout keeps the margin, since
 * that layout has no gap to replace it with.
 */
.SettingsPage-Column > :deep(.TGroupBlock-Container) {
  margin-bottom: 0;
}

/**
 * Fill mode's slot host. A definite height for whatever it wraps: `height: 100%` inside a
 * scrolling column resolves to nothing, which is how a master/detail split ends up invisible.
 */
.SettingsPage-Body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
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
