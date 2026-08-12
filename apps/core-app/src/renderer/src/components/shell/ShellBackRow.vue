<script lang="ts" name="ShellBackRow" setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

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
</script>

<template>
  <button class="ShellBackRow" type="button" :title="t('settingsNav.back')" @click="goHome">
    <span class="ShellBackRow-Icon i-ri-arrow-left-line" />
    <span class="ShellBackRow-Label">{{ t('settingsNav.back') }}</span>
  </button>
</template>

<style lang="scss" scoped>
.ShellBackRow {
  display: flex;
  // Artboard: 232 x 28, icon at x=8, label at x=28 — a 14px glyph with a 6px gap after it.
  gap: 6px;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
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
</style>
