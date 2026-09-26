<script lang="ts" name="ShellBackRow" setup>
import { onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { registerMainWindowCommandHandlers } from '~/modules/shortcuts/main-window-shortcuts'
import MetaHintBadge from './MetaHintBadge.vue'

/**
 * Settings' way out, per artboard `iqbKR`'s `BackRow`.
 *
 * Not the same affordance as the chrome bar's history arrows: those walk the visit stack, which
 * from settings can lead anywhere. This one always lands on the app itself, which is what someone
 * who opened settings from a menu or a deep link is looking for.
 */
const { t } = useI18n()
const router = useRouter()

function goHome(): void {
  if (router.currentRoute.value.path === '/home') return

  void router.push('/home')
}

/**
 * `⌘[`, registered by this row rather than by the shell's own list: the command only exists while
 * the way out is on screen, which is the settings column and nowhere else. An id with no handler
 * is not offered anywhere, so the palette cannot teach the chord outside settings.
 */
const disposeCommand = registerMainWindowCommandHandlers([{ id: 'back-to-tuff', run: goHome }])

onBeforeUnmount(disposeCommand)
</script>

<template>
  <button class="ShellBackRow" type="button" :title="t('settingsNav.back')" @click="goHome">
    <span class="ShellBackRow-Icon i-ri-arrow-left-line" />
    <span class="ShellBackRow-Label">{{ t('settingsNav.back') }}</span>
    <span class="ShellBackRow-Hint">
      <MetaHintBadge command="back-to-tuff" placement="trailing" />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.ShellBackRow {
  display: flex;
  // The chord hint anchors to the row rather than to the sidebar: its trailing edge is the row's
  // trailing edge, which is where the eye already is.
  position: relative;
  // Same reason as ShellSearchEntry: a fixed height in the sidebar's flex column needs
  // `flex-shrink: 0`, or an overflowing settings list eats into the 32px.
  flex: 0 0 auto;
  // Artboard: icon at x=8, label at x=28 — a 14px glyph with a 6px gap after it.
  gap: 6px;
  align-items: center;
  width: 100%;
  /**
   * 32px, against the artboard's 28. Its neighbours are both 30 — `ShellSearchEntry` pins that
   * exactly, `ShellNavItem` lands there from `6px` padding on a 13px label — so two pixels is as
   * far as this row can grow while still belonging to their rhythm. 36 would make the way out of
   * settings the tallest control in the column, louder than the page the reader is actually on.
   */
  height: 32px;
  // 9px plus the transparent 1px border puts the glyph on the same 10px inset as every
  // `ShellNavItem` below it; the borderless 8px left it a pixel short of that column.
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  /**
   * A resting fill, where this row used to be the one control in the settings column with none —
   * which is why it read as a caption rather than as the way back.
   *
   * Neutral on purpose: `--shell-primary-soft` is what marks the *selected* settings category
   * (`ShellNavItem.active`), so spending it here would make the exit look like a nav selection.
   * The accent arrives on hover instead, where nothing else in the column is wearing it.
   */
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    border-color: var(--shell-primary-border);
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  /**
   * The rail keeps the label instead of shedding it, matching `ShellNavItem`. Reduced to a bare
   * arrow this row was indistinguishable from the chrome bar's history arrows sitting directly
   * above it — two near-identical glyphs stacked, one walking the visit stack and one leaving
   * settings entirely, which is an easy and unrecoverable mis-click.
   */
  .is-rail & {
    flex-direction: column;
    gap: 3px;
    justify-content: center;
    height: auto;
    padding: 6px 2px;
    text-align: center;
  }
}

.ShellBackRow-Icon {
  // Locked in px, not `1em`: the icon has to stay the same size at every sidebar width.
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

.ShellBackRow-Label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--shell-fs-body);

  .is-rail & {
    flex: 0 0 auto;
    max-width: 100%;
    font-size: 10px;
    line-height: 1.25;
  }
}

/**
 * Hidden in the rail: the row stacks its label under the icon there, so a chip centred on the row
 * would land on the second line of the label. The rail sheds the chrome bar's history arrows for
 * the same reason.
 */
.ShellBackRow-Hint {
  .is-rail & {
    display: none;
  }
}
</style>
