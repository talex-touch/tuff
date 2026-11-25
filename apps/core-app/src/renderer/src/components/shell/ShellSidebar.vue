<script lang="ts" name="ShellSidebar" setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import {
  createBrowserSdk,
  type BrowserWorkspaceState
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { useConversationEntry } from '~/modules/conversation/useConversationEntry'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { groupedSettingNavigation } from '~/modules/settings/categories'
import { useCoreBoxShortcut } from '~/modules/shortcuts/useCoreBoxShortcut'
import { appSetting } from '~/modules/storage/app-storage'
import { isBetaFeatureEnabled } from '../../../../shared/beta-features'
import { useEnv } from '~/modules/hooks/env-hooks'
import { useProjectStore } from '~/stores/projects'
import MetaHintBadge from './MetaHintBadge.vue'
import ShellBackRow from './ShellBackRow.vue'
import ShellChromeBar from './ShellChromeBar.vue'
import ShellConversationList from './ShellConversationList.vue'
import ShellNavGroup from './ShellNavGroup.vue'
import ShellNavItem from './ShellNavItem.vue'
import ShellSearchEntry from './ShellSearchEntry.vue'
import ShellUpdateNotice from './ShellUpdateNotice.vue'
/** How long the rail snap animates. Short enough to still feel like a latch, not a slide. */
const SNAP_DURATION = 200

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const transport = useTuffTransport()
const { packageJson } = useEnv()
const { collapsed, isDragging, startDrag } = useShellSidebar()
const { enterPickedProjectConversation } = useConversationEntry()
const { effectiveLabel: coreBoxShortcutLabel } = useCoreBoxShortcut()

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

const browserEnabled = computed(() => isBetaFeatureEnabled(appSetting, 'browserWorkspace'))
const browserSdk = createBrowserSdk(transport)
const browserState = shallowRef<BrowserWorkspaceState | null>(null)
let unsubBrowser: (() => void) | undefined
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
  unsubBrowser?.()
})

/**
 * The global key that opens CoreBox, not a written-in one: the user can rebind it, and a key the
 * OS refused or one that lost an in-app conflict does nothing. No key at all hides the hint.
 */
const searchKbd = computed(() => coreBoxShortcutLabel.value ?? undefined)
const settingGroups = computed(() =>
  groupedSettingNavigation(Boolean(appSetting?.dev?.developerMode))
)
const appVersion = computed(() =>
  packageJson.value?.version ? `v${packageJson.value.version}` : ''
)

const activeBrowserTab = computed(() =>
  browserState.value?.tabs.find((tab) => tab.id === browserState.value?.activeTabId)
)
const isStoreActive = computed(
  () =>
    route.path === '/store' ||
    (route.path === '/browser' &&
      (activeBrowserTab.value?.url?.startsWith('tuff://store') ?? false))
)
const isSettingsActive = computed(
  () =>
    route.path.startsWith('/setting') ||
    (route.path === '/browser' &&
      (activeBrowserTab.value?.url?.startsWith('tuff://setting') ?? false))
)
const isBrowserActive = computed(
  () => route.path === '/browser' && !isStoreActive.value && !isSettingsActive.value
)

async function openBrowserWorkspace(): Promise<void> {
  if (route.path !== '/browser') {
    await router.push('/browser')
  }
  try {
    const s = await browserSdk.getState()
    const active = s.tabs.find((tab) => tab.id === s.activeTabId)
    if (active && (!active.url || active.url.startsWith('http'))) {
      return
    }
    const landing = s.tabs.find((tab) => !tab.url)
    if (landing) {
      await browserSdk.activateTab(landing.id)
    } else {
      await browserSdk.createTab('')
    }
  } catch (err) {
    void err
  }
}

async function openStoreTab(): Promise<void> {
  if (!browserEnabled.value) {
    if (route.path !== '/store') {
      await router.push('/store')
    }
    return
  }
  if (route.path !== '/browser') {
    await router.push('/browser')
  }
  try {
    const s = await browserSdk.getState()
    const existing = s.tabs.find((tab) => tab.url.startsWith('tuff://store'))
    if (existing) {
      await browserSdk.activateTab(existing.id)
    } else {
      await browserSdk.createTab('tuff://store')
    }
  } catch (err) {
    void err
  }
}

async function openSettingsTab(): Promise<void> {
  if (!browserEnabled.value) {
    if (route.path !== '/setting') {
      await router.push('/setting')
    }
    return
  }
  if (route.path !== '/browser') {
    await router.push('/browser')
  }
  try {
    const s = await browserSdk.getState()
    const existing = s.tabs.find((tab) => tab.url.startsWith('tuff://setting'))
    if (existing) {
      await browserSdk.activateTab(existing.id)
    } else {
      await browserSdk.createTab('tuff://settings')
    }
  } catch (err) {
    void err
  }
}

function openCoreBox(): void {
  transport.send(CoreBoxEvents.ui.show).catch(() => {})
}

onMounted(() => {
  void projectStore.initialize()
  if (browserEnabled.value) {
    void browserSdk
      .getState()
      .then((s) => {
        browserState.value = s
      })
      .catch(() => {})
    unsubBrowser = browserSdk.onChanged((s) => {
      browserState.value = s
    })
  }
})
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
      <div
        v-if="isSettingsContext"
        key="settings"
        class="ShellSidebar-Context ShellSidebar-Context--settings"
      >
        <div class="ShellSidebar-SettingsHeader">
          <ShellBackRow />

          <ShellSearchEntry :placeholder="t('settingsNav.search')" @activate="openCoreBox" />
        </div>

        <div class="ShellSidebar-SettingsNav">
          <ShellNavGroup
            v-for="group in settingGroups"
            :key="group.group"
            :label="t(`settingsNav.group.${group.group}`)"
          >
            <ShellNavItem
              v-for="item in group.items"
              :key="item.key"
              :icon="item.icon"
              :label="t(item.labelKey)"
              :to="item.path"
              :badge="item.beta ? t('settings.platformTags.beta') : undefined"
              :active="item.activeExact ? route.path === item.path : undefined"
            />
          </ShellNavGroup>
        </div>
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
          <ShellNavItem
            v-if="browserEnabled"
            icon="i-ri-global-line"
            :label="t('shell.browser')"
            to="/browser"
            :active="isBrowserActive"
            @select="openBrowserWorkspace"
          />
          <!--
            Expanded, New Project is the + on the Projects section title. The rail hides that whole
            list, so without this row the action would have no button there at all.
          -->
          <ShellNavItem
            v-if="collapsed"
            icon="i-ri-folder-add-line"
            :label="t('shell.newProject')"
            @select="enterPickedProjectConversation"
          >
            <template #hint><MetaHintBadge command="new-project" placement="trailing" /></template>
          </ShellNavItem>
          <!-- Intelligence configuration lives in the settings rail, not the home-mode nav. -->
          <ShellNavItem
            icon="i-ri-store-2-line"
            :label="t('shell.store')"
            :to="browserEnabled ? undefined : '/store'"
            :active="isStoreActive"
            @select="openStoreTab"
          >
            <template #hint><MetaHintBadge command="open-store" placement="trailing" /></template>
          </ShellNavItem>
        </nav>

        <ShellConversationList />

        <div class="ShellSidebar-Spacer" />

        <ShellNavItem
          icon="i-ri-settings-3-line"
          :label="t('shell.setting')"
          :to="browserEnabled ? undefined : '/setting'"
          :active="isSettingsActive"
          @select="openSettingsTab"
        >
          <template #hint><MetaHintBadge command="open-settings" placement="trailing" /></template>
        </ShellNavItem>
      </div>
    </Transition>

    <ShellUpdateNotice />

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
  height: 100%;
  min-height: 0;
  overflow: hidden;
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

  /**
   * One set of row metrics for every row in the column. Inside a 1px transparent border, 9px of
   * inline padding puts the icon column 10px in; the 16px icon and a 10px gap put the text column
   * 36px in. Nav items, section titles, project folders and conversation rows all read these, so
   * their icons and text line up instead of each restating the numbers and drifting apart.
   */
  --shell-row-pad-x: 9px;
  --shell-row-pad-y: 6px;
  --shell-row-icon: 16px;
  --shell-row-gap: 10px;
  /**
   * The icon's share of a row's height: border, padding and the 16px icon. A row without an icon
   * takes it as a floor, so it is never shorter than a nav row whose icon outgrows its label. It is
   * not a row's height: a label's line of text is taller than the icon — 19.5px of 13px type at the
   * page's 1.5 line-height — so rows measure 33.5px, and each gets that from its own label's line.
   */
  --shell-row-min-height: calc(var(--shell-row-icon) + 2 * var(--shell-row-pad-y) + 2px);
}

.ShellSidebar.is-rail {
  gap: 4px;
  padding: 10px 6px;
  align-items: center;

  /**
   * The rail has no room beside a 60px column for a key cap — the nav rows stack their label under
   * the icon there, so a chip anchored to the row's trailing edge would hang over the resize grip.
   * The chords still run; only the reminder is shed.
   */
  .MetaHintBadge {
    display: none;
  }
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
  -webkit-app-region: no-drag;
}
.ShellSidebar-Context--settings {
  overflow: hidden;
}

.ShellSidebar-SettingsHeader {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  flex-shrink: 0;
}

.ShellSidebar-SettingsNav {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 2px;
    transition: background-color 0.2s ease;
  }

  &:hover {
    scrollbar-color: var(--shell-border-strong) transparent;

    &::-webkit-scrollbar-thumb {
      background: var(--shell-border-strong);
    }
  }

  > * {
    flex-shrink: 0;
  }
}

.ShellSidebar.is-rail {
  .ShellSidebar-SettingsHeader,
  .ShellSidebar-SettingsNav {
    gap: 4px;
    align-items: center;
  }
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

.ShellSidebar.is-rail {
  .ShellSidebar-Context {
    gap: 4px;
    align-items: center;
  }
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
  flex-shrink: 0;
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
