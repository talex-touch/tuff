<script lang="ts" name="ShellChromeBar" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLogo from '~/components/icon/AppLogo.vue'
import { useHistoryNavigation } from '~/modules/layout/useHistoryNavigation'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { SIDEBAR_BRAND_LABEL_MIN, SIDEBAR_HISTORY_MIN } from '~/modules/layout/shell-sidebar-state'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'

/**
 * The single row of window chrome, living at the top of the sidebar.
 *
 * Everything the shell owns sits here — the macOS traffic-light reservation, the brand, the
 * sidebar collapse toggle and history navigation — so the main area can start flush against the
 * top of the window instead of below a bar that is empty on every top-level route.
 */
const { t } = useI18n()
const { isMac } = useRendererPlatform()
const { collapsed, width, toggle } = useShellSidebar()
const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigation()

/**
 * Narrowing the sidebar sheds the bar's contents in stages rather than letting them ellipsis
 * into unreadable stubs.
 *
 * The rail sheds history too. Wrapped onto their own centred line the two arrows sat directly
 * above the settings back row, and three bare glyphs in a column gave no way to tell "step back
 * through the visit stack" apart from "leave settings" — the kind of mis-click you cannot undo
 * by clicking again.
 */
const showBrandLabel = computed(() => !collapsed.value && width.value >= SIDEBAR_BRAND_LABEL_MIN)
const showHistory = computed(() => !collapsed.value && width.value >= SIDEBAR_HISTORY_MIN)
</script>

<template>
  <div class="ShellChromeBar" :class="{ 'is-rail': collapsed }">
    <!--
      Reserves the box the native macOS buttons are drawn into. The window is created with
      `titleBarStyle: 'hidden'` plus a `trafficLightPosition` matching this block, so nothing is
      rendered here — it only keeps the brand from sliding underneath. Windows and Linux draw
      their controls in the top-right corner instead (ShellWindowControls.vue).
    -->
    <div v-if="isMac" class="ShellChromeBar-TrafficLights" aria-hidden="true" />

    <div class="ShellChromeBar-Brand">
      <AppLogo class="ShellChromeBar-Mark" />
      <!--
        Kept mounted and collapsed with CSS rather than toggled with `v-if`: the width changes
        continuously under the drag, and unmounting would pop it in and out instead of fading.
      -->
      <span class="ShellChromeBar-Name" :class="{ 'is-shed': !showBrandLabel }">Tuff</span>
    </div>

    <button
      class="ShellChromeBar-Button"
      type="button"
      :aria-label="collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')"
      :title="collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')"
      @click="toggle"
    >
      <span class="i-ri-side-bar-line" />
    </button>

    <div class="ShellChromeBar-Spacer" />

    <div class="ShellChromeBar-History" :class="{ 'is-shed': !showHistory }" :inert="!showHistory">
      <!--
        Disabled rather than hidden: the two arrows flip availability on nearly every navigation,
        and removing them from the flow would make the whole row jump each time.
      -->
      <button
        class="ShellChromeBar-Button"
        type="button"
        :disabled="!canGoBack"
        :aria-label="t('shell.back')"
        :title="t('shell.back')"
        @click="goBack"
      >
        <span class="i-ri-arrow-left-line" />
      </button>
      <button
        class="ShellChromeBar-Button"
        type="button"
        :disabled="!canGoForward"
        :aria-label="t('shell.forward')"
        :title="t('shell.forward')"
        @click="goForward"
      >
        <span class="i-ri-arrow-right-line" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ShellChromeBar {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
  width: 100%;
  min-height: 30px;
  -webkit-app-region: drag;
}

.ShellChromeBar-TrafficLights {
  flex: 0 0 auto;
  /**
   * Spans the native buttons drawn at `trafficLightPosition: { x: 20, y: 18 }`.
   *
   * Measured rather than derived: macOS lays the three lights out on a ~24px pitch, so the
   * last one reaches x≈80 in window coordinates. The sidebar's 10px padding already covers
   * the first 10, leaving 74 here — a narrower block lets the brand mark ride on top of the
   * green button.
   */
  width: 74px;
  height: 20px;
}

.ShellChromeBar-Brand {
  display: flex;
  flex: 0 1 auto;
  // No `gap`: the wordmark carries its own leading margin, so collapsing it leaves no orphan
  // space between the mark and the button that follows.
  align-items: center;
  min-width: 0;
  padding-left: 2px;
}

/**
 * Shared shedding treatment. Width and margin animate the element out of the flow while opacity
 * and blur dissolve it, so a piece leaving the bar reads as one motion instead of a snap.
 */
.ShellChromeBar-Name,
.ShellChromeBar-History {
  overflow: hidden;
  transition:
    max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    margin 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.16s ease,
    filter 0.16s ease;

  &.is-shed {
    max-width: 0;
    margin-left: 0;
    margin-right: 0;
    opacity: 0;
    filter: blur(4px);
    pointer-events: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ShellChromeBar-Name,
  .ShellChromeBar-History {
    transition: none;
  }
}

.ShellChromeBar-Mark {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
}

// Pushes history navigation to the trailing edge. A `margin-left: auto` on the group itself
// would be simpler, but `auto` cannot be transitioned, and that margin has to animate closed
// when the group is shed.
.ShellChromeBar-Spacer {
  flex: 1 1 auto;
  min-width: 0;
}

.ShellChromeBar-Name {
  // A generous cap the wordmark never reaches, so the shed transition has a real distance to
  // animate — `max-width: none` would jump straight to zero.
  max-width: 120px;
  margin-left: 8px;
  color: var(--shell-text-primary);
  white-space: nowrap;
  font-size: var(--shell-fs-md);
  font-weight: 600;
}

.ShellChromeBar-History {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  align-items: center;
  max-width: 120px;
  // `auto` cannot be transitioned, so the group is pinned right by the bar instead.
  margin-left: 8px;
}

.ShellChromeBar-Button {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

/**
 * Rail mode wraps the same row instead of turning it into a column, which lets the mark and the
 * collapse toggle stay side by side on one line while the full-width blocks around them force
 * their own. A `flex-direction: column` would have stranded each control on a line of its own.
 */
.ShellChromeBar.is-rail {
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;

  .ShellChromeBar-TrafficLights {
    // Full width so it both reserves the native buttons' row and breaks the line after itself.
    width: 100%;
  }

  .ShellChromeBar-Brand {
    flex: 0 0 auto;
    padding-left: 0;
  }

  .ShellChromeBar-Spacer {
    display: none;
  }
}
</style>
