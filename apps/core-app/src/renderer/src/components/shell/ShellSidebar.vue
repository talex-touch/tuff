<script lang="ts" name="ShellSidebar" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { groupedSettingCategories } from '~/modules/settings/categories'
import { useEnv } from '~/modules/hooks/env-hooks'
import ShellBackRow from './ShellBackRow.vue'
import ShellChromeBar from './ShellChromeBar.vue'
import ShellNavGroup from './ShellNavGroup.vue'
import ShellNavItem from './ShellNavItem.vue'
import ShellSearchEntry from './ShellSearchEntry.vue'

/** How long the rail snap animates. Short enough to still feel like a latch, not a slide. */
const SNAP_DURATION = 200

const { t } = useI18n()
const route = useRoute()
const transport = useTuffTransport()
const { isMac } = useRendererPlatform()
const { packageJson } = useEnv()
const { collapsed, isDragging, startDrag } = useShellSidebar()

/**
 * A width transition is off while the grip is held so the edge stays under the pointer. Snapping
 * to and from the rail is the exception: that jump is one the pointer never made, and with no
 * animation it reads as the sidebar glitching rather than latching. So the transition is switched
 * back on for the length of the snap only.
 */
const snapping = ref(false)
let snapTimer: number | null = null

watch(collapsed, () => {
  if (!isDragging.value) return

  snapping.value = true
  if (snapTimer !== null) window.clearTimeout(snapTimer)
  snapTimer = window.setTimeout(() => {
    snapping.value = false
    snapTimer = null
  }, SNAP_DURATION)
})

onBeforeUnmount(() => {
  if (snapTimer !== null) window.clearTimeout(snapTimer)
})

/**
 * The v2 design folds the settings category rail into the main sidebar, so the same column
 * swaps its contents once you are inside settings.
 */
const isSettingsContext = computed(() => route.path.startsWith('/setting'))

/**
 * Settings reads as a level deeper than the conversation column, so its contents arrive from the
 * right and the way back reverses. Bound reactively: with `mode="out-in"` the name resolves once
 * per swap, so the leaving and entering halves always share a direction.
 */
const contextTransition = computed(() =>
  isSettingsContext.value ? 'ShellSidebar-forward' : 'ShellSidebar-back'
)

const searchKbd = computed(() => (isMac.value ? '⌘E' : 'Ctrl+E'))
const settingGroups = groupedSettingCategories()
const appVersion = computed(() =>
  packageJson.value?.version ? `v${packageJson.value.version}` : ''
)

function openCoreBox(): void {
  transport.send(CoreBoxEvents.ui.show).catch(() => {})
}
</script>

<template>
  <aside
    class="ShellSidebar fake-background"
    :class="{ 'is-rail': collapsed, 'is-snapping': snapping }"
  >
    <ShellChromeBar />

    <!--
      Only the column below the chrome swaps. Keeping the chrome bar outside the transition is
      what makes the change read as one surface changing contents rather than two sidebars.
    -->
    <Transition :name="contextTransition" mode="out-in">
      <div v-if="isSettingsContext" key="settings" class="ShellSidebar-Context">
        <ShellBackRow />

        <ShellSearchEntry :placeholder="t('settingsNav.search')" @activate="openCoreBox" />

        <ShellNavGroup
          v-for="group in settingGroups"
          :key="group.group"
          :label="t(`settingsNav.group.${group.group}`)"
        >
          <ShellNavItem
            v-for="category in group.items"
            :key="category.key"
            :icon="category.icon"
            :label="t(`settingsNav.category.${category.labelKey}`)"
            :to="category.path"
          />
        </ShellNavGroup>

        <div class="ShellSidebar-Spacer" />

        <div v-if="appVersion" class="ShellSidebar-Footer">
          {{ appVersion }}
        </div>
      </div>

      <div v-else key="home" class="ShellSidebar-Context">
        <ShellSearchEntry
          :placeholder="t('shell.search')"
          :kbd="searchKbd"
          @activate="openCoreBox"
        />

        <nav class="ShellSidebar-Nav">
          <ShellNavItem icon="i-ri-edit-box-line" :label="t('shell.newChat')" to="/home" />
          <!--
            Intelligence moved under 「设置 · 智能」: it is configuration, not a place you switch to
            alongside conversations and the store. `/intelligence` is reached from that page.
          -->
          <ShellNavItem icon="i-ri-store-2-line" :label="t('shell.store')" to="/store" />
        </nav>

        <!-- Conversation history buckets are filled by 08-04-home-conversation. -->
        <slot name="conversations" />

        <div class="ShellSidebar-Spacer" />

        <ShellNavItem icon="i-ri-settings-3-line" :label="t('shell.setting')" to="/setting" />
      </div>
    </Transition>

    <!--
      Resize grip along the trailing edge. It opts out of the window drag region; without that
      the pointer moves the whole window instead of resizing.
    -->
    <div
      class="ShellSidebar-Resizer"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="startDrag"
    />
  </aside>
</template>

<style lang="scss" scoped>
.ShellSidebar {
  z-index: 10;
  position: relative;
  display: flex;
  flex: 0 0 var(--shell-sidebar-width);
  flex-direction: column;
  gap: 6px;
  width: var(--shell-sidebar-width);
  padding: 10px;
  box-sizing: border-box;
  border-right: 1px solid var(--shell-border);
  // Chrome, not content: selecting a nav label has no use, and a stray drag-select across the
  // column while reaching for the resize grip looks like the app broke.
  user-select: none;
  -webkit-app-region: drag;

  /**
   * Animates the collapse toggle and the release of a drag. Suppressed mid-drag below, where the
   * column has to sit exactly under the pointer.
   */
  transition:
    flex-basis 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    width 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    padding 0.2s cubic-bezier(0.32, 0.72, 0, 1);

  // The window is `transparent: true` with no vibrancy layer, so translucency comes from
  // painting a partly-transparent fill via `.fake-background`'s ::before rather than from a
  // solid `background`. A solid fill here would cover the whole window and kill the effect.
  // `--fake-opacity` is set per window preference on `.AppShell`; under `.touch-blur` it
  // overrides `--fake-inner-opacity`, so pure stays opaque and refraction/filter go through.
  background: transparent;
  --fake-color: var(--shell-surface);
  --fake-radius: 0;
}

.ShellSidebar.is-rail {
  gap: 4px;
  padding: 10px 6px;
  align-items: center;
}

// A held grip means the width is the pointer position — a transition here would trail the cursor
// and fire the snap thresholds at a width the user is no longer at.
.AppShell.is-resizing .ShellSidebar {
  transition: none;
}

// …except while the rail snap plays, which is a jump the pointer never made.
.AppShell.is-resizing .ShellSidebar.is-snapping {
  transition:
    flex-basis 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    width 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    padding 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

/**
 * The swapping half of the column. It restates the aside's own column layout, so wrapping the two
 * contexts for the transition leaves their spacing exactly as it was when they were direct
 * children — and `flex: 1` keeps the inner spacer pushing the footer to the bottom.
 */
.ShellSidebar-Context {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-height: 0;
}

.ShellSidebar.is-rail .ShellSidebar-Context {
  gap: 4px;
  align-items: center;
}

.ShellSidebar-forward-enter-active,
.ShellSidebar-forward-leave-active,
.ShellSidebar-back-enter-active,
.ShellSidebar-back-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

// Short travel on purpose: the column is 260 wide and stays in place, so this reads as its
// contents being replaced rather than as a panel flying in.
.ShellSidebar-forward-enter-from,
.ShellSidebar-back-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.ShellSidebar-forward-leave-to,
.ShellSidebar-back-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.ShellSidebar-Nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

.ShellSidebar-Spacer {
  flex: 1 1 auto;
  min-height: 0;
}

.ShellSidebar-Footer {
  padding: 6px 10px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);

  .is-rail & {
    display: none;
  }
}

.ShellSidebar-Resizer {
  z-index: 1;
  position: absolute;
  top: 0;
  // Sits fully inside the aside. An earlier version overhung the edge with `right: -2px`, and
  // the part outside the parent's padding box never became a `no-drag` region — grabbing the
  // grip dragged the whole window instead of resizing.
  right: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  -webkit-app-region: no-drag;

  &:hover::after,
  &:active::after {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 2px;
    background: var(--shell-primary);
    content: '';
  }
}
</style>
